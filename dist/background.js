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
const AUDIO = "audio";
const COUNTER = "counter";
const ICON_URL = 'imgs/logo.png';
const TITLE = 'Prolific Studies';
const MESSAGE = 'A new study has been posted on Prolific!';
let creating; // A global promise to avoid concurrency issues
let docExists = false;
chrome.runtime.onInstalled.addListener((details) => __awaiter(void 0, void 0, void 0, function* () {
    if (details.reason === "install") {
        yield setInitialValues();
        yield new Promise(resolve => setTimeout(resolve, 1000));
        yield chrome.tabs.create({ url: "https://spin311.github.io/ProlificStudiesGoogle/", active: true });
    }
}));
function playAudio() {
    return __awaiter(this, arguments, void 0, function* (audio = 'alert1.mp3', volume = 1.0) {
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
    if (tab.url && tab.url.includes('https://app.prolific.com/') && changeInfo.title && !(changeInfo.title.trim() === 'Prolific')) {
        const resultAudio = yield chrome.storage.sync.get(AUDIO_ACTIVE);
        if (resultAudio[AUDIO_ACTIVE]) {
            if (!docExists)
                yield setupOffscreenDocument('audio/audio.html');
            const audioFile = yield chrome.storage.sync.get(AUDIO);
            const volume = yield chrome.storage.sync.get('volume');
            yield playAudio(audioFile[AUDIO], volume['volume']);
            yield updateCounter();
        }
        const resultNotification = yield chrome.storage.sync.get(SHOW_NOTIFICATION);
        if (resultNotification[SHOW_NOTIFICATION]) {
            sendNotification();
        }
    }
}));
function setInitialValues() {
    return __awaiter(this, void 0, void 0, function* () {
        yield Promise.all([
            chrome.storage.sync.set({ [AUDIO_ACTIVE]: true }),
            chrome.storage.sync.set({ [AUDIO]: "alert1.mp3" }),
            chrome.storage.sync.set({ [SHOW_NOTIFICATION]: true })
        ]);
    });
}
function sendNotification() {
    chrome.notifications.create({
        type: 'basic',
        iconUrl: chrome.runtime.getURL(ICON_URL),
        title: TITLE,
        message: MESSAGE
    }, (notificationId) => {
        if (chrome.runtime.lastError) {
            console.log(`Notification Error: ${chrome.runtime.lastError.message}`);
        }
        else {
            console.log(`Notification created with ID: ${notificationId}`);
        }
    });
}
function updateBadge(counter) {
    return __awaiter(this, void 0, void 0, function* () {
        yield chrome.action.setBadgeText({ text: counter.toString() });
        yield chrome.action.setBadgeBackgroundColor({ color: "#FF0000" });
    });
}
function updateCounter() {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield chrome.storage.sync.get(COUNTER);
        let counter = result[COUNTER];
        if (counter === undefined) {
            counter = 1;
        }
        else {
            counter++;
        }
        yield chrome.storage.sync.set({ [COUNTER]: counter });
        yield updateBadge(counter);
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
            docExists = true;
            return;
        }
        if (creating) {
            yield creating;
        }
        else {
            creating = chrome.offscreen.createDocument({
                url: path,
                reasons: [Reason.AUDIO_PLAYBACK],
                justification: 'Notification'
            });
            yield creating;
            creating = null;
            docExists = true;
        }
    });
}
