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
const AUDIO_ACTIVE = "audioActive";
const SHOW_NOTIFICATION = "showNotification";
const AUDIO = "audio";
const COUNTER = "counter";
const ICON_URL = '../images/logo.png';
const TITLE = 'Prolific Studies';
const MESSAGE = 'A new study has been posted on Prolific!';
chrome.runtime.onInstalled.addListener((details) => __awaiter(void 0, void 0, void 0, function* () {
    if (details.reason === "install") {
        yield setInitialValues();
        yield new Promise(resolve => setTimeout(resolve, 1000));
        yield chrome.browserAction.setBadgeText({ text: "1" });
        yield chrome.tabs.create({ url: "https://spin311.github.io/ProlificStudiesGoogle/", active: true });
    }
}));
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => __awaiter(void 0, void 0, void 0, function* () {
    if (tab.title && tab.title.toLowerCase().includes('prolific')) {
        if (changeInfo.title && changeInfo.title !== 'Prolific') {
            yield sendNotification();
            yield playAudioMessage(tabId);
            yield updateCounter();
        }
    }
}));
function setInitialValues() {
    return __awaiter(this, void 0, void 0, function* () {
        yield chrome.storage.sync.set({ [AUDIO_ACTIVE]: true });
        yield chrome.storage.sync.set({ [AUDIO]: "alert1.mp3" });
        yield chrome.storage.sync.set({ [SHOW_NOTIFICATION]: true });
    });
}
function sendNotification() {
    return __awaiter(this, void 0, void 0, function* () {
        chrome.notifications.create({
            type: 'basic',
            iconUrl: ICON_URL,
            title: TITLE,
            message: MESSAGE
        });
    });
}
function playAudioMessage(tabId) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield chrome.storage.sync.get(AUDIO_ACTIVE);
        if (result[AUDIO_ACTIVE]) {
            yield chrome.tabs.executeScript(tabId, { file: "playAlert.js" });
        }
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
        yield chrome.browserAction.setBadgeText({ text: counter.toString() });
    });
}
