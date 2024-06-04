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
function setVolume(volume) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield chrome.storage.sync.get("volume");
        const vol = result["volume"];
        if (vol !== undefined) {
            volume.value = String(vol);
        }
        volume.addEventListener("change", function () {
            return __awaiter(this, void 0, void 0, function* () {
                yield chrome.storage.sync.set({ ["volume"]: parseFloat(volume.value) });
                yield chrome.runtime.sendMessage({
                    type: 'volume-changed',
                    target: 'background',
                    data: parseFloat(volume.value) / 100
                });
            });
        });
    });
}
document.addEventListener('DOMContentLoaded', function () {
    return __awaiter(this, void 0, void 0, function* () {
        const autoAudio = document.getElementById("autoAudio");
        const selectAudio = document.getElementById("selectAudio");
        const counter = document.getElementById("counter");
        const playAudio = document.getElementById("playAudio");
        const showNotification = document.getElementById("showNotification");
        const volume = document.getElementById("volume");
        const openProlific = document.getElementById("openProlific");
        if (autoAudio) {
            yield setAudioCheckbox(autoAudio);
        }
        if (selectAudio) {
            yield setAudioOption(selectAudio);
        }
        if (counter) {
            yield setCounter(counter);
        }
        if (playAudio) {
            playAudio.addEventListener("click", playAlert);
        }
        if (showNotification) {
            yield setShowNotification(showNotification);
        }
        if (openProlific) {
            yield setOpenProlific(openProlific);
        }
        if (volume) {
            yield setVolume(volume);
        }
    });
});
function setCounter(counter) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield chrome.storage.sync.get("counter");
        const count = result["counter"];
        if (count !== undefined) {
            counter.innerText = count.toString();
        }
    });
}
function playAlert() {
    return __awaiter(this, void 0, void 0, function* () {
        yield chrome.runtime.sendMessage({
            type: 'play-sound',
            target: 'background',
        });
    });
}
function setAudioOption(selectAudio) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield chrome.storage.sync.get("audio");
        selectAudio.value = result["audio"];
        selectAudio.addEventListener("change", function () {
            return __awaiter(this, void 0, void 0, function* () {
                yield chrome.storage.sync.set({ ["audio"]: selectAudio.value });
                yield chrome.runtime.sendMessage({
                    type: 'audio-changed',
                    target: 'background',
                    data: selectAudio.value
                });
            });
        });
    });
}
function setAudioCheckbox(autoAudio) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield chrome.storage.sync.get("audioActive");
        autoAudio.checked = result["audioActive"];
        autoAudio.addEventListener("click", function () {
            return __awaiter(this, void 0, void 0, function* () {
                yield chrome.storage.sync.set({ ["audioActive"]: autoAudio.checked });
                yield chrome.runtime.sendMessage({
                    type: 'audioActive-changed',
                    target: 'background',
                    data: autoAudio.checked
                });
            });
        });
    });
}
function setShowNotification(showNotification) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield chrome.storage.sync.get("showNotification");
        showNotification.checked = result["showNotification"];
        showNotification.addEventListener("click", function () {
            return __awaiter(this, void 0, void 0, function* () {
                yield chrome.storage.sync.set({ ["showNotification"]: showNotification.checked });
                yield chrome.runtime.sendMessage({
                    type: 'showNotification-changed',
                    target: 'background',
                    data: showNotification.checked
                });
            });
        });
    });
}
function setOpenProlific(openProlific) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield chrome.storage.sync.get("openProlific");
        openProlific.checked = result["openProlific"];
        openProlific.addEventListener("click", function () {
            return __awaiter(this, void 0, void 0, function* () {
                yield chrome.storage.sync.set({ ["openProlific"]: openProlific.checked });
            });
        });
    });
}
