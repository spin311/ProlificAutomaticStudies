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
let volume = 1.0;
let audio = 'alert1.mp3';
let shouldSendNotification = true;
let shouldPlayAudio = true;
// todo: setvalues on window load, onchange read values
chrome.runtime.onMessage.addListener(handleMessages);
chrome.runtime.onInstalled.addListener((details) => __awaiter(void 0, void 0, void 0, function* () {
    if (details.reason === "install") {
        yield setInitialValues();
        yield new Promise(resolve => setTimeout(resolve, 1000));
        yield chrome.tabs.create({ url: "https://spin311.github.io/ProlificStudiesGoogle/", active: true });
    }
}));
function handleMessages(message) {
    return __awaiter(this, void 0, void 0, function* () {
        // Return early if this message isn't meant for the offscreen document.
        if (message.target !== 'background') {
            return;
        }
        // Dispatch the message to an appropriate handler.
        switch (message.type) {
            case 'play-sound':
                yield playAudio(audio, volume);
                break;
            case 'show-notification':
                sendNotification();
                break;
            case 'audio-changed':
                audio = message.data;
                break;
            case 'volume-changed':
                volume = message.data;
                break;
            case 'showNotification-changed':
                shouldSendNotification = message.data;
                break;
            case 'audioActive-changed':
                shouldPlayAudio = message.data;
                break;
        }
    });
}
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
    if (tab.url && tab.url.includes('https://app.prolific.com/') && changeInfo.title && !(changeInfo.title.trim() === 'Prolific')) {
        if (shouldSendNotification) {
            sendNotification();
        }
        if (shouldPlayAudio) {
            yield playAudio(audio, volume);
            yield updateCounter();
        }
    }
}));
function setInitialValues() {
    return __awaiter(this, void 0, void 0, function* () {
        yield Promise.all([
            chrome.storage.sync.set({ [AUDIO_ACTIVE]: true }),
            chrome.storage.sync.set({ [AUDIO]: "alert1.mp3" }),
            chrome.storage.sync.set({ [SHOW_NOTIFICATION]: true }),
            chrome.storage.sync.set({ ['volume']: 100 }),
        ]);
    });
}
chrome.runtime.onStartup.addListener(function () {
    chrome.storage.sync.get(null, function (result) {
        if (result) {
            if (result[AUDIO_ACTIVE] !== undefined) {
                shouldPlayAudio = result[AUDIO_ACTIVE];
            }
            if (result[AUDIO] !== undefined) {
                audio = result[AUDIO];
            }
            if (result[SHOW_NOTIFICATION] !== undefined) {
                shouldSendNotification = result[SHOW_NOTIFICATION];
            }
            if (result['volume'] !== undefined) {
                volume = result['volume'] / 100;
            }
        }
    });
});
function sendNotification() {
    chrome.notifications.create({
        type: 'basic',
        iconUrl: chrome.runtime.getURL(ICON_URL),
        title: TITLE,
        message: MESSAGE
    });
}
function updateBadge(counter) {
    return __awaiter(this, void 0, void 0, function* () {
        yield chrome.action.setBadgeText({ text: counter.toString() });
        yield chrome.action.setBadgeBackgroundColor({ color: "#FF0000" });
        setTimeout(() => __awaiter(this, void 0, void 0, function* () {
            yield chrome.action.setBadgeText({ text: '' });
        }), 60000);
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
                justification: 'Audio playback'
            });
            yield creating;
            creating = null;
            docExists = true;
        }
    });
}
