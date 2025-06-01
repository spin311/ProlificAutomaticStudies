"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var Reason = chrome.offscreen.Reason;
var ContextType = chrome.runtime.ContextType;
const AUDIO_ACTIVE = "audioActive";
const SHOW_NOTIFICATION = "showNotification";
const OPEN_PROLIFIC = "openProlific";
const AUDIO = "audio";
const VOLUME = "volume";
const COUNTER = "counter";
const FOCUS_PROLIFIC = "focusProlific";
const ICON_URL = 'imgs/logo.png';
const TITLE = 'Prolific Automatic Studies';
const MESSAGE = 'A new study is available on Prolific!';
let creating = null; // A global promise to avoid concurrency issues
let volume;
let audio;
chrome.runtime.onMessage.addListener(handleMessages);
chrome.notifications.onClicked.addListener(function (notificationId) {
    if (!!notificationId && notificationId.includes('study-')) {
        notificationId = notificationId.split("-")[1];
        chrome.tabs.create({ url: `https://app.prolific.com/studies/${notificationId}`, active: true });
    }
    else {
        chrome.tabs.create({ url: "https://app.prolific.com/", active: true });
    }
    chrome.notifications.clear(notificationId);
});
chrome.notifications.onButtonClicked.addListener(function (notificationId, buttonIndex) {
    if (buttonIndex === 0) {
        if (!!notificationId && notificationId.includes('study-')) {
            notificationId = notificationId.split("-")[1];
            chrome.tabs.create({ url: `https://app.prolific.com/studies/${notificationId}`, active: true });
        }
        else {
            chrome.tabs.create({ url: "https://app.prolific.com/", active: true });
        }
    }
    chrome.notifications.clear(notificationId);
});
chrome.runtime.onInstalled.addListener((details) => __awaiter(void 0, void 0, void 0, function* () {
    if (details.reason === "install") {
        yield setInitialValues();
        yield new Promise(resolve => setTimeout(resolve, 1000));
        yield chrome.tabs.create({ url: "https://spin311.github.io/ProlificAutomaticStudies/", active: true });
    }
}));
function getValueFromStorage(key, defaultValue) {
    return new Promise((resolve) => {
        chrome.storage.sync.get(key, function (result) {
            resolve((result[key] !== undefined) ? result[key] : defaultValue);
        });
    });
}
function handleMessages(message) {
    return __awaiter(this, void 0, void 0, function* () {
        // Return early if this message isn't meant for the offscreen document.
        if (message.target !== 'background') {
            return;
        }
        // Dispatch the message to an appropriate handler.
        switch (message.type) {
            case 'play-sound':
                audio = yield getValueFromStorage(AUDIO, 'alert1.mp3');
                volume = (yield getValueFromStorage(VOLUME, 100)) / 100;
                yield playAudio(audio, volume);
                sendNotification();
                break;
            case 'show-notification':
                sendNotification();
                break;
            case 'clear-badge':
                yield chrome.action.setBadgeText({ text: '' });
                break;
            case 'new-studies':
                const studies = message.data;
                if (!studies || studies.length === 0)
                    break;
                const shouldShowNotification = yield getValueFromStorage(SHOW_NOTIFICATION, true);
                const shouldPlayAudio = yield getValueFromStorage(AUDIO_ACTIVE, true);
                const shouldFocusProlific = yield getValueFromStorage(FOCUS_PROLIFIC, false);
                if (shouldPlayAudio) {
                    audio = yield getValueFromStorage(AUDIO, 'alert1.mp3');
                    volume = (yield getValueFromStorage(VOLUME, 100)) / 100;
                    yield playAudio(audio, volume);
                }
                if (shouldFocusProlific) {
                    const tabs = yield chrome.tabs.query({ url: "*://app.prolific.com/*" });
                    if (tabs.length > 0) {
                        yield chrome.tabs.update(tabs[0].id, { active: true });
                    }
                    else {
                        yield chrome.tabs.create({ url: "https://app.prolific.com/", active: true });
                    }
                }
                studies.forEach((study) => {
                    if (shouldShowNotification) {
                        setTimeout(() => {
                            sendNotification(study);
                        }, 3000);
                    }
                });
                yield updateCounterAndBadge(studies.length);
                break;
        }
    });
}
chrome.runtime.onStartup.addListener(function () {
    return __awaiter(this, void 0, void 0, function* () {
        if (yield getValueFromStorage(OPEN_PROLIFIC, false)) {
            yield chrome.tabs.create({ url: "https://app.prolific.com/", active: false });
        }
    });
});
function playAudio() {
    return __awaiter(this, arguments, void 0, function* (audio = 'alert1.mp3', volume) {
        yield setupOffscreenDocument('audio/audio.html');
        const req = {
            audio: audio,
            volume: volume
        };
        yield chrome.runtime.sendMessage({
            type: 'play-sound',
            target: 'offscreen-doc',
            data: req
        });
    });
}
function setInitialValues() {
    return __awaiter(this, void 0, void 0, function* () {
        yield chrome.storage.sync.set({
            [AUDIO_ACTIVE]: true,
            [AUDIO]: "alert1.mp3",
            [SHOW_NOTIFICATION]: true,
            [VOLUME]: 100,
        });
    });
}
function sendNotification(study = null) {
    let title = TITLE;
    let message = MESSAGE;
    let id = Date.now().toString();
    if (study) {
        if (study.id) {
            id = `study-${study.id}`;
        }
        if (study.title && study.researcher) {
            title = `${study.title} by ${study.researcher}`;
        }
        if (study.reward && study.time && study.rewardPerHour && study.places) {
            message += `\nReward: ${study.reward}\nReward per hour: ${study.rewardPerHour}\nTime: ${study.time} | Places: ${study.places}`;
        }
    }
    const options = {
        type: 'basic',
        iconUrl: chrome.runtime.getURL(ICON_URL),
        title: title,
        message: message,
        buttons: [{ title: 'Open Study' }, { title: 'Dismiss' }],
    };
    chrome.notifications.create(id, options);
}
function updateBadge(counter) {
    return __awaiter(this, void 0, void 0, function* () {
        yield chrome.action.setBadgeText({ text: counter.toString() });
        yield chrome.action.setBadgeBackgroundColor({ color: "#9dec14" });
        setTimeout(() => __awaiter(this, void 0, void 0, function* () {
            yield chrome.action.setBadgeText({ text: '' });
        }), 20000);
    });
}
function updateCounterAndBadge() {
    return __awaiter(this, arguments, void 0, function* (count = 1) {
        yield updateBadge(count);
        let counter = (yield getValueFromStorage(COUNTER, 0)) + count;
        yield chrome.storage.sync.set({ [COUNTER]: counter });
    });
}
function setupOffscreenDocument(path) {
    return __awaiter(this, void 0, void 0, function* () {
        // Check all windows controlled by the service worker to see if one
        // of them is the offscreen document with the given path
        const offscreenUrl = chrome.runtime.getURL(path);
        const existingContexts = yield chrome.runtime.getContexts({
            contextTypes: [ContextType.OFFSCREEN_DOCUMENT],
            documentUrls: [offscreenUrl]
        });
        if (existingContexts.length > 0) {
            return;
        }
        if (creating) {
            yield creating;
        }
        else {
            creating = chrome.offscreen.createDocument({
                url: path,
                reasons: [Reason.AUDIO_PLAYBACK],
                justification: 'Audio playback'
            });
            yield creating;
            creating = null;
        }
    });
}
