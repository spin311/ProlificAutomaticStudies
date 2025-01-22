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
Object.defineProperty(exports, "__esModule", { value: true });
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
function checkNewStudies() {
    return __awaiter(this, void 0, void 0, function* () {
        var _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        const targetNode = document.querySelector('ul.list'); // Prolific study list
        if (!targetNode) {
            console.log('Target node not found.');
            return;
        }
        // Fetch saved settings and storage values
        const savedStudiesIds = yield getValueFromStorage('studies', []);
        shouldSendNotification = yield getValueFromStorage(SHOW_NOTIFICATION, true);
        shouldPlayAudio = yield getValueFromStorage(AUDIO_ACTIVE, true);
        const audio = shouldPlayAudio ? yield getValueFromStorage(AUDIO, 'alert1.mp3') : null;
        const volume = shouldPlayAudio ? (yield getValueFromStorage(VOLUME, 100)) / 100 : null;
        const studyList = document.querySelectorAll('ul.list li');
        let newStudiesCount = 0;
        const currentStudies = [];
        // Iterate over all study items
        for (const study of studyList) {
            const id = (_c = study.getAttribute('data-testid')) === null || _c === void 0 ? void 0 : _c.split('-')[1];
            const title = (_d = study.querySelector('[data-testid="title"]')) === null || _d === void 0 ? void 0 : _d.textContent;
            const researcher = (_f = (_e = study.querySelector('[data-testid="host"]')) === null || _e === void 0 ? void 0 : _e.textContent) === null || _f === void 0 ? void 0 : _f.split(' ')[1];
            const places = parseInt(((_h = (_g = study.querySelector('[data-testid="study-tag-places"]')) === null || _g === void 0 ? void 0 : _g.textContent) === null || _h === void 0 ? void 0 : _h.split(' ')[0]) || '0');
            const reward = parseFloat(((_k = (_j = study.querySelector('[data-testid="study-tag-reward"]')) === null || _j === void 0 ? void 0 : _j.textContent) === null || _k === void 0 ? void 0 : _k.replace('$', '')) || '0');
            const rewardPerHour = parseFloat(((_m = (_l = study.querySelector('[data-testid="study-tag-reward-per-hour"]')) === null || _l === void 0 ? void 0 : _l.textContent) === null || _m === void 0 ? void 0 : _m.replace('$', '').replace('/hr', '')) || '0');
            const time = getTimeFromString(study);
            if (id) {
                const currentStudy = {
                    id,
                    researcher,
                    title,
                    reward,
                    places,
                    rewardPerHour,
                    time,
                    limitedCapacity: false,
                };
                // Check if the study is new
                if (!savedStudiesIds.includes(id)) {
                    newStudiesCount++;
                    if (shouldSendNotification) {
                        sendNotification(currentStudy);
                    }
                }
                currentStudies.push(currentStudy);
            }
            else {
                console.log('Study ID not found for an item.');
            }
        }
        // Handle updates for new studies
        if (newStudiesCount > 0) {
            if (shouldPlayAudio && audio) {
                yield playAudio(audio, volume);
            }
            yield updateCounterAndBadge(newStudiesCount);
            yield chrome.storage.sync.set({ "studies": currentStudies.map(study => study.id) });
        }
    });
}
chrome.tabs.onUpdated.addListener((_a, _b, tab) => __awaiter(void 0, void 0, void 0, function* () {
    if (tab.id && tab.url && tab.url.includes('https://app.prolific.com') && tab.status === 'complete') {
        yield chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: checkNewStudies,
        });
    }
}));
function getTimeFromString(study) {
    var _c;
    const timeText = (_c = study.querySelector('[data-testid="study-tag-completion-time"]')) === null || _c === void 0 ? void 0 : _c.textContent;
    let time = 0;
    if (timeText) {
        const timeParts = timeText.match(/(\d+)\s*h\s*(\d+)?\s*mins?/);
        if (timeParts) {
            const hours = parseInt(timeParts[1]) || 0;
            const minutes = parseInt(timeParts[2]) || 0;
            time = hours * 60 + minutes;
        }
        else {
            const minutesOnly = timeText.match(/(\d+)\s*mins?/);
            if (minutesOnly) {
                time = parseInt(minutesOnly[1]);
            }
        }
    }
    return time;
}
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
function sendNotification(study = null) {
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
