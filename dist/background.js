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
chrome.runtime.onInstalled.addListener((details) => __awaiter(void 0, void 0, void 0, function* () {
    if (details.reason === "install") {
        yield chrome.storage.sync.set({ "audioActive": true });
        yield chrome.storage.sync.set({ "audio": "alert1.mp3" });
        yield new Promise(resolve => setTimeout(resolve, 1000));
        yield chrome.tabs.create({ url: "https://spin311.github.io/ProlificStudiesGoogle/", active: true });
    }
}));
//if title of tab changes, check if it is a prolific study
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    if (tab.title && tab.title.toLowerCase().includes('prolific')) {
        if (changeInfo.title && changeInfo.title !== 'Prolific') {
            //send a notification
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'images/icon.png',
                title: 'Prolific Studies',
                message: 'A new study has been posted on Prolific!'
            });
            //play a sound
            chrome.storage.sync.get("audioActive", function (result) {
                if (result.audioActive) {
                    playAudioMessage();
                }
            });
            //increment counter
            updateCounter();
        }
    }
});
function playAudioMessage() {
    chrome.runtime.sendMessage({ action: "playAudio" });
}
function updateCounter() {
    return __awaiter(this, void 0, void 0, function* () {
        chrome.storage.sync.get("counter", function (result) {
            let counter = result.counter;
            if (counter === undefined) {
                counter = 1;
            }
            else {
                counter++;
            }
            chrome.storage.sync.set({ "counter": counter }, function () {
                if (chrome.runtime.lastError) {
                    console.error(chrome.runtime.lastError);
                }
                else {
                    chrome.browserAction.setBadgeText({ text: counter.toString() });
                }
            });
        });
    });
}
