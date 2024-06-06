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
const ICON_URL = 'imgs/logo.png';
const TITLE = 'Prolific Automatic Studies';
const MESSAGE = 'A new study has been posted on Prolific!';
let creating; // A global promise to avoid concurrency issues
let volume;
let audio;
let shouldSendNotification;
let shouldPlayAudio;
let previousTitle = null;
chrome.runtime.onMessage.addListener(handleMessages);
chrome.notifications.onClicked.addListener(function (notificationId) {
    chrome.tabs.create({ url: "https://app.prolific.com/", active: true });
    chrome.notifications.clear(notificationId);
});
chrome.notifications.onButtonClicked.addListener(function (notificationId, buttonIndex) {
    if (buttonIndex === 0) {
        chrome.tabs.create({ url: "https://app.prolific.com/", active: true });
    }
    chrome.notifications.clear(notificationId);
});
chrome.runtime.onInstalled.addListener((details) => __awaiter(void 0, void 0, void 0, function* () {
    if (details.reason === "install") {
        yield setInitialValues();
        yield new Promise(resolve => setTimeout(resolve, 1000));
        yield chrome.tabs.create({ url: "https://spin311.github.io/ProlificStudiesGoogle/", active: true });
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
        }
    });
}
chrome.runtime.onStartup.addListener(function () {
    chrome.storage.sync.get(OPEN_PROLIFIC, function (result) {
        if (result && result[OPEN_PROLIFIC]) {
            chrome.tabs.create({ url: "https://app.prolific.com/", active: false });
        }
    });
});
function playAudio() {
    return __awaiter(this, arguments, void 0, function* (audio = 'alert1.mp3', volume = 1.0) {
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
chrome.tabs.onUpdated.addListener((_, changeInfo, tab) => __awaiter(void 0, void 0, void 0, function* () {
    if (tab.url && tab.url.includes('https://app.prolific.com/') && changeInfo.title && changeInfo.title !== previousTitle) {
        //
        previousTitle = changeInfo.title;
        if (!(changeInfo.title.trim() === 'Prolific')) {
            shouldSendNotification = yield getValueFromStorage(SHOW_NOTIFICATION, true);
            if (shouldSendNotification) {
                sendNotification();
            }
            shouldPlayAudio = yield getValueFromStorage(AUDIO_ACTIVE, true);
            if (shouldPlayAudio) {
                audio = yield getValueFromStorage(AUDIO, 'alert1.mp3');
                volume = (yield getValueFromStorage(VOLUME, 100)) / 100;
                yield playAudio(audio, volume);
            }
        }
        yield updateCounter();
    }
}));
function setInitialValues() {
    return __awaiter(this, void 0, void 0, function* () {
        yield Promise.all([
            chrome.storage.sync.set({ [AUDIO_ACTIVE]: true }),
            chrome.storage.sync.set({ [AUDIO]: "alert1.mp3" }),
            chrome.storage.sync.set({ [SHOW_NOTIFICATION]: true }),
            chrome.storage.sync.set({ [VOLUME]: 100 }),
        ]);
    });
}
function sendNotification() {
    chrome.notifications.create({
        type: 'basic',
        iconUrl: chrome.runtime.getURL(ICON_URL),
        title: TITLE,
        message: MESSAGE,
        buttons: [{ title: 'Open Prolific' }, { title: 'Dismiss' }],
    });
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
function updateCounter() {
    return __awaiter(this, void 0, void 0, function* () {
        let counter = (yield getValueFromStorage(COUNTER, 0)) + 1;
        yield chrome.storage.sync.set({ [COUNTER]: counter });
        yield updateBadge(1);
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
