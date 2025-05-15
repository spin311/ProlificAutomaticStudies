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
        if (donateImg && donateText) {
            donateText.addEventListener('mouseover', function () {
                donateImg.style.visibility = 'visible';
            });
        }
        yield setCheckboxState("autoAudio", "audioActive");
        yield setCheckboxState("showNotification", "showNotification");
        yield setCheckboxState("openProlific", "openProlific");
        yield setCheckboxState("focusProlific", "focusProlific");
        yield setCheckboxState("trackIds", "trackIds");
        yield setInputState("reward", "reward");
        yield setInputState("rewardPerHour", "rewardPerHour");
        yield setInputState("studyHistoryLen", "studyHistoryLen");
        setTabState("settings-tab", "settings");
        setTabState("filters-tab", "filters");
        setTabState("studies-tab", "studies");
        yield setCurrentActiveTab();
        yield setAlertState();
        yield setBlacklist();
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
function formatDate(dateStr) {
    const date = new Date(dateStr);
    const day = date.getDate() < 10 ? '0' + date.getDate() : date.getDate().toString();
    const month = (date.getMonth() + 1) < 10 ? '0' + (date.getMonth() + 1) : (date.getMonth() + 1).toString();
    const year = date.getFullYear();
    const hours = date.getHours() < 10 ? '0' + date.getHours() : date.getHours().toString();
    const minutes = date.getMinutes() < 10 ? '0' + date.getMinutes() : date.getMinutes().toString();
    return `${day}/${month}/${year} ${hours}:${minutes}`;
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
function setTabState(elementId, storageValue) {
    const element = document.getElementById(elementId);
    if (!element)
        return;
    element.addEventListener("click", function () {
        return __awaiter(this, void 0, void 0, function* () {
            yield chrome.storage.sync.set({ ["activeTab"]: storageValue });
            changeTab(storageValue);
        });
    });
}
function setCurrentActiveTab() {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield chrome.storage.sync.get("activeTab");
        changeTab(result["activeTab"]);
    });
}
function populateStudies() {
    return __awaiter(this, void 0, void 0, function* () {
        const studiesContainer = document.getElementById("studies");
        studiesContainer.innerHTML = ""; // clear previous content
        const result = yield chrome.storage.sync.get("currentStudies");
        const currentStudies = result["currentStudies"];
        if (!currentStudies || currentStudies.length === 0) {
            studiesContainer.innerHTML = "<p class='text-center'>No studies available.</p>";
            return;
        }
        currentStudies.forEach((study, index) => {
            const studyCard = document.createElement("div");
            const link = `https://app.prolific.com/studies/${study.id}`;
            const formattedDate = study.createdAt ? formatDate(study.createdAt) : 'N/A';
            studyCard.classList.add("study-card");
            studyCard.innerHTML = `
            <div class="study-info">
            <div class="study-header">
                 <img src="/imgs/logo.png" alt="Study Image" class="study-img">
                <div class="study-title">${study.title || "Untitled"}</div>      
            </div>
                    <div class="study-researcher">By: ${study.researcher || "Unknown"}</div>
                    <div class="study-reward"><strong>Pay:</strong> ${study.reward || "N/A"}</div>
                    <div class="study-reward-hour">${study.rewardPerHour || "N/A"}  &#47;hr</div>
                    <div class="study-time"><strong>Time:</strong> ${study.time || "N/A"}</div>
                    <div class="study-created-at"><strong>Created:</strong> ${formattedDate}</div>
                    <button class="btn btn-success open-btn" data-index="${index}"><a href=${link} target="_blank" rel="noopener noreferrer" class="normal-link white">Open</a></button>
                    <button class="btn btn-fail delete-btn" data-index="${index}">Delete</button>
            </div>

        `;
            studiesContainer === null || studiesContainer === void 0 ? void 0 : studiesContainer.appendChild(studyCard);
        });
        studiesContainer.querySelectorAll(".delete-btn").forEach(button => {
            button.addEventListener("click", (e) => {
                const target = e.target;
                const index = parseInt(target.getAttribute("data-index") || "");
                currentStudies.splice(index, 1);
                chrome.storage.sync.set({ currentStudies });
                populateStudies();
            });
        });
    });
}
function changeTab(activeTab) {
    const windows = [{ tab: "settings", item: "settings-tab" },
        { tab: "filters", item: "filters-tab" },
        { tab: "studies", item: "studies-tab" }
    ];
    windows.forEach(window => {
        const currentTab = window.tab;
        const currentItem = window.item;
        const currentTabElement = document.getElementById(currentTab);
        const currentItemElement = document.getElementById(currentItem);
        if (activeTab === currentTab) {
            currentTabElement.style.display = "block";
            currentItemElement.classList.add("active");
        }
        else {
            currentTabElement.style.display = "none";
            currentItemElement.classList.remove("active");
        }
    });
    if (activeTab === 'studies') {
        populateStudies();
    }
}
function setAlertState() {
    return __awaiter(this, void 0, void 0, function* () {
        const websiteButton = document.getElementById("websiteBtn");
        const titleButton = document.getElementById("titleBtn");
        const trackIds = document.getElementById("trackIds");
        const trackIdsLabel = document.getElementById("trackIdsLabel");
        const history = document.getElementById("studyHistoryLen");
        const historyLabel = document.getElementById("study-history-len-label");
        const result = yield chrome.storage.sync.get("useOld");
        if (result["useOld"]) {
            trackIdsLabel.classList.add("disabled-text");
            historyLabel.classList.add("disabled-text");
            history.disabled = true;
            trackIds.disabled = true;
            titleButton.classList.add("active");
        }
        else {
            historyLabel.classList.remove("disabled-text");
            history.disabled = false;
            trackIdsLabel.classList.remove("disabled-text");
            trackIds.disabled = false;
            websiteButton.classList.add("active");
        }
        websiteButton.addEventListener("click", function () {
            return __awaiter(this, void 0, void 0, function* () {
                historyLabel.classList.remove("disabled-text");
                history.disabled = false;
                trackIdsLabel.classList.remove("disabled-text");
                trackIds.disabled = false;
                websiteButton.classList.add("active");
                titleButton.classList.remove("active");
                yield chrome.storage.sync.set({ ["useOld"]: false });
                const tabs = yield chrome.tabs.query({ url: "*://app.prolific.com/*" });
                tabs.forEach(tab => {
                    chrome.tabs.sendMessage(tab.id, {
                        type: 'change-alert-type',
                        target: 'everything',
                        data: "website"
                    });
                });
            });
        });
        titleButton.addEventListener("click", function () {
            return __awaiter(this, void 0, void 0, function* () {
                historyLabel.classList.add("disabled-text");
                trackIdsLabel.classList.add("disabled-text");
                history.disabled = true;
                trackIds.disabled = true;
                titleButton.classList.add("active");
                websiteButton.classList.remove("active");
                yield chrome.storage.sync.set({ ["useOld"]: true });
                const tabs = yield chrome.tabs.query({ url: "*://app.prolific.com/*" });
                tabs.forEach(tab => {
                    chrome.tabs.sendMessage(tab.id, {
                        type: 'change-alert-type',
                        target: 'content',
                        data: "title"
                    });
                });
                yield chrome.runtime.sendMessage({
                    type: 'change-alert-type',
                    target: 'background',
                    data: "title"
                });
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
        if (result[storageKey] !== undefined) {
            element.checked = result[storageKey];
        }
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
        if (result[storageKey] !== undefined) {
            element.value = result[storageKey];
        }
        element.addEventListener("change", function () {
            return __awaiter(this, void 0, void 0, function* () {
                yield chrome.storage.sync.set({ [storageKey]: parseFloat(element.value) });
            });
        });
    });
}
function handleBlacklistInputs() {
    return __awaiter(this, void 0, void 0, function* () {
        yield handleBlacklistInput("blacklist-name", "nameBlacklist", "name-list");
        yield handleBlacklistInput("blacklist-researcher", "researcherBlacklist", "researcher-list");
    });
}
function handleBlacklistInput(inputId, storageKey, listId) {
    return __awaiter(this, void 0, void 0, function* () {
        const blacklistInput = document.getElementById(inputId);
        yield appendBlacklistInput(blacklistInput === null || blacklistInput === void 0 ? void 0 : blacklistInput.value, storageKey);
        blacklistInput.value = '';
        yield populateBlacklist(listId, storageKey);
    });
}
function setBlacklist() {
    return __awaiter(this, void 0, void 0, function* () {
        const blacklistButton = document.getElementById("submit-blacklist");
        const blacklistNameInput = document.getElementById("blacklist-name");
        const blacklistResearcherInput = document.getElementById("blacklist-researcher");
        blacklistNameInput.addEventListener("keydown", (e) => __awaiter(this, void 0, void 0, function* () {
            if (e.key === "Enter") {
                yield handleBlacklistInput("blacklist-name", "nameBlacklist", "name-list");
            }
        }));
        blacklistResearcherInput.addEventListener("keydown", (e) => __awaiter(this, void 0, void 0, function* () {
            if (e.key === "Enter") {
                yield handleBlacklistInput("blacklist-researcher", "researcherBlacklist", "researcher-list");
            }
        }));
        if (!blacklistButton)
            return;
        blacklistButton.addEventListener("click", function () {
            return __awaiter(this, void 0, void 0, function* () {
                yield handleBlacklistInputs();
            });
        });
    });
}
function appendBlacklistInput(value, storageKey) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!value)
            return;
        const currentValue = value.toLowerCase();
        let newValues;
        const currentValues = yield chrome.storage.sync.get(storageKey);
        const result = currentValues[storageKey];
        if (result !== undefined && !result.includes(currentValue)) {
            newValues = [...result, currentValue];
        }
        else {
            newValues = [currentValue];
        }
        yield chrome.storage.sync.set({ [storageKey]: newValues });
    });
}
function populateBlacklist(elementId_1, storageKey_1) {
    return __awaiter(this, arguments, void 0, function* (elementId, storageKey, values = []) {
        const blacklistContainer = document.getElementById(elementId);
        blacklistContainer.innerHTML = "";
        let currentItems;
        if (values.length === 0) {
            const result = yield chrome.storage.sync.get(storageKey);
            currentItems = result[storageKey] || [];
        }
        else {
            currentItems = values;
        }
        currentItems.forEach((item, index) => {
            const itemCard = document.createElement('div');
            itemCard.classList.add("blacklist-card");
            itemCard.innerHTML = `
        <span>${item}</span> <span class="remove-btn" data-index="${index}">X</span>
        `;
            blacklistContainer.appendChild(itemCard);
        });
        blacklistContainer.querySelectorAll(".remove-btn").forEach((btn) => {
            btn.addEventListener("click", (e) => {
                const target = e.target;
                const index = parseInt(target.getAttribute("data-index") || "");
                currentItems.splice(index, 1);
                chrome.storage.sync.set({ [storageKey]: currentItems });
                populateBlacklist(elementId, storageKey, currentItems);
            });
        });
    });
}
