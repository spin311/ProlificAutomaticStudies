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
document.addEventListener('DOMContentLoaded', function () {
    return __awaiter(this, void 0, void 0, function* () {
        const autoAudio = document.getElementById("autoAudio");
        const selectAudio = document.getElementById("selectAudio");
        const counter = document.getElementById("counter");
        const playAudio = document.getElementById("playAudio");
        const showNotification = document.getElementById("showNotification");
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
    });
});
function setCounter(counter) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield chrome.storage.sync.get(COUNTER);
        const count = result[COUNTER];
        if (count !== undefined) {
            counter.innerText = count.toString();
        }
    });
}
function playAlert() {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield chrome.storage.sync.get(AUDIO);
        let audio = new Audio('../audio/' + result[AUDIO]);
        yield audio.play();
    });
}
function setAudioOption(selectAudio) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield chrome.storage.sync.get(AUDIO);
        selectAudio.value = result[AUDIO];
        selectAudio.addEventListener("change", function () {
            chrome.storage.sync.set({ [AUDIO]: selectAudio.value });
        });
    });
}
function setAudioCheckbox(autoAudio) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield chrome.storage.sync.get(AUDIO_ACTIVE);
        autoAudio.checked = result[AUDIO_ACTIVE];
        autoAudio.addEventListener("click", function () {
            chrome.storage.sync.set({ [AUDIO_ACTIVE]: autoAudio.checked });
        });
    });
}
function setShowNotification(showNotification) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield chrome.storage.sync.get(SHOW_NOTIFICATION);
        showNotification.checked = result[SHOW_NOTIFICATION];
        showNotification.addEventListener("click", function () {
            chrome.storage.sync.set({ [SHOW_NOTIFICATION]: showNotification.checked });
        });
    });
}
