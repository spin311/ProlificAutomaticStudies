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
            });
        });
    });
}
document.addEventListener('DOMContentLoaded', function () {
    return __awaiter(this, void 0, void 0, function* () {
        yield chrome.runtime.sendMessage({
            type: 'clear-badge',
            target: 'background',
        });
        const selectAudio = document.getElementById("selectAudio");
        const counter = document.getElementById("counter");
        const playAudio = document.getElementById("playAudio");
        const volume = document.getElementById("volume");
        const donateText = document.getElementById('donateText');
        const donateImg = document.getElementById('donateImg');
        const settingsTab = document.getElementById('settings-tab');
        const filterTab = document.getElementById('filters-tab');
        if (donateImg && donateText) {
            donateText.addEventListener('mouseover', function () {
                donateImg.style.visibility = 'visible';
            });
        }
        yield setCheckboxState("autoAudio", "audioActive");
        yield setCheckboxState("showNotification", "showNotification");
        yield setCheckboxState("openProlific", "openProlific");
        yield setCheckboxState("focusProlific", "focusProlific");
        yield setInputState("nuPlaces", "nuPlaces");
        yield setInputState("reward", "reward");
        yield setInputState("rewardPerHour", "rewardPerHour");
        if (selectAudio) {
            yield setAudioOption(selectAudio);
        }
        if (counter) {
            yield setCounter(counter);
        }
        if (playAudio) {
            playAudio.addEventListener("click", playAlert);
        }
        if (volume) {
            yield setVolume(volume);
        }
        if (settingsTab) {
            yield setSettingsTab(settingsTab);
        }
        if (filterTab) {
            yield setFiltersTab(filterTab);
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
        const playAudio = document.getElementById("playAudio");
        playAudio.disabled = true;
        playAudio.classList.remove("btn-success");
        playAudio.classList.add("btn-fail");
        setTimeout(() => {
            playAudio.disabled = false;
            playAudio.classList.remove("btn-fail");
            playAudio.classList.add("btn-success");
        }, 500);
    });
}
function setAudioOption(selectAudio) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield chrome.storage.sync.get("audio");
        selectAudio.value = result["audio"];
        selectAudio.addEventListener("change", function () {
            return __awaiter(this, void 0, void 0, function* () {
                yield chrome.storage.sync.set({ ["audio"]: selectAudio.value });
            });
        });
    });
}
function setSettingsTab(settingsTab) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield chrome.storage.sync.get("activeTab");
        settingsTab.addEventListener("click", function () {
            return __awaiter(this, void 0, void 0, function* () {
                yield chrome.storage.sync.set({ ["activeTab"]: "settings" });
            });
        });
    });
}
function setFiltersTab(filterTab) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield chrome.storage.sync.get("activeTab");
        filterTab.addEventListener("click", function () {
            return __awaiter(this, void 0, void 0, function* () {
                yield chrome.storage.sync.set({ ["activeTab"]: "filters" });
            });
        });
    });
}
function setCheckboxState(elementId, storageKey) {
    return __awaiter(this, void 0, void 0, function* () {
        const element = document.getElementById(elementId);
        if (!element)
            return;
        const result = yield chrome.storage.sync.get(storageKey);
        element.checked = result[storageKey];
        element.addEventListener("click", function () {
            return __awaiter(this, void 0, void 0, function* () {
                yield chrome.storage.sync.set({ [storageKey]: element.checked });
            });
        });
    });
}
function setInputState(elementId, storageKey) {
    return __awaiter(this, void 0, void 0, function* () {
        const element = document.getElementById(elementId);
        if (!element)
            return;
        const result = yield chrome.storage.sync.get(storageKey);
        element.value = result[storageKey];
        element.addEventListener("change", function () {
            return __awaiter(this, void 0, void 0, function* () {
                yield chrome.storage.sync.set({ [storageKey]: parseFloat(element.value) });
            });
        });
    });
}
