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
        yield chrome.action.setBadgeText({ text: '' });
        const counter = document.getElementById("counter");
        const playAudio = document.getElementById("playAudio");
        const resetValuesBtn = document.getElementById("resetValues");
        const donateText = document.getElementById('donateText');
        const donateImg = document.getElementById('donateImg');
        const downloadCSVButton = document.getElementById("downloadCSV");
        if (donateImg && donateText) {
            donateText.addEventListener('mouseover', function () {
                donateImg.style.visibility = 'visible';
            });
        }
        yield renderPopup();
        setTabState("settings-tab", "settings");
        setTabState("filters-tab", "filters");
        setTabState("studies-tab", "studies");
        yield setCurrentActiveTab();
        yield setBlacklist();
        yield setupSearch();
        if (counter) {
            yield setCounter(counter);
        }
        if (playAudio) {
            playAudio.addEventListener("click", playAlert);
        }
        if (resetValuesBtn) {
            resetValuesBtn.addEventListener("dblclick", resetValues);
        }
        if (downloadCSVButton) {
            downloadCSVButton.addEventListener("click", downloadStudies);
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
function resetValues() {
    return __awaiter(this, void 0, void 0, function* () {
        yield chrome.runtime.sendMessage({
            type: 'resetValues',
            target: 'background',
        });
        yield new Promise(resolve => setTimeout(resolve, 150));
        yield renderPopup();
    });
}
function downloadStudies() {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield chrome.storage.local.get("currentStudies");
        const studies = result["currentStudies"];
        const headers = [
            "id", "title", "researcher", "reward", "rewardPerHour",
            "time", "timeInMinutes", "createdAt"
        ];
        const csvRows = [headers.join(",")];
        studies.forEach(study => {
            const values = headers.map(header => {
                const value = study[header];
                if (value === null || value === undefined)
                    return "";
                return `"${String(value).replace(/"/g, '""')}"`;
            });
            csvRows.push(values.join(","));
        });
        const csvContent = csvRows.join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", "studies.csv");
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
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
function setSelectState(elementId, storageKey, callback) {
    return __awaiter(this, void 0, void 0, function* () {
        const element = document.getElementById(elementId);
        if (!element)
            return;
        const result = yield chrome.storage.sync.get(storageKey);
        element.value = result[storageKey];
        element.addEventListener("change", () => __awaiter(this, void 0, void 0, function* () {
            yield chrome.storage.sync.set({ [storageKey]: element.value });
            if (callback) {
                callback();
            }
        }));
    });
}
function parseMoney(value) {
    return parseFloat((value === null || value === void 0 ? void 0 : value.replace(/[^\d.]/g, "")) || "0");
}
function parseTime(value) {
    if (!value)
        return 0;
    const hourMatch = value.match(/(\d+)\s*hour/);
    const minMatch = value.match(/(\d+)\s*min/);
    const hours = hourMatch ? parseInt(hourMatch[1], 10) : 0;
    const minutes = minMatch ? parseInt(minMatch[1], 10) : 0;
    return hours * 60 + minutes;
}
function parseDate(value) {
    return new Date(value || "").getTime() || 0;
}
function setTabState(elementId, storageValue) {
    const element = document.getElementById(elementId);
    if (!element)
        return;
    element.addEventListener("click", function () {
        return __awaiter(this, void 0, void 0, function* () {
            yield chrome.storage.sync.set({ ["activeTab"]: storageValue });
            yield changeTab(storageValue);
        });
    });
}
function setCurrentActiveTab() {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield chrome.storage.sync.get("activeTab");
        yield changeTab(result["activeTab"]);
    });
}
function populateStudies() {
    return __awaiter(this, arguments, void 0, function* (search = '', sort = "") {
        if (!search) {
            const searchInput = document.getElementById("search-studies");
            search = searchInput.value;
        }
        if (!sort) {
            const result = yield chrome.storage.sync.get("sortStudies");
            sort = result["sortStudies"];
        }
        const studiesContainer = document.getElementById("studies-container");
        studiesContainer.innerHTML = ""; // clear previous content
        const result = yield chrome.storage.local.get("currentStudies");
        let currentStudies = result["currentStudies"];
        if (!currentStudies || currentStudies.length === 0) {
            studiesContainer.innerHTML = "<p class='text-center'>No studies available.</p>";
            return;
        }
        if (search.trim() !== "") {
            const searchLower = search.toLowerCase();
            currentStudies = currentStudies.filter(study => {
                var _a, _b;
                const title = ((_a = study.title) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || "";
                const researcher = ((_b = study.researcher) === null || _b === void 0 ? void 0 : _b.toLowerCase()) || "";
                return title.includes(searchLower) || researcher.includes(searchLower);
            });
        }
        currentStudies.sort((a, b) => {
            switch (sort) {
                case "created+":
                    return parseDate(b.createdAt) - parseDate(a.createdAt);
                case "created-":
                    return parseDate(a.createdAt) - parseDate(b.createdAt);
                case "pay+":
                    return parseMoney(b.reward) - parseMoney(a.reward);
                case "pay-":
                    return parseMoney(a.reward) - parseMoney(b.reward);
                case "payH+":
                    return parseMoney(b.rewardPerHour) - parseMoney(a.rewardPerHour);
                case "payH-":
                    return parseMoney(a.rewardPerHour) - parseMoney(b.rewardPerHour);
                case "time+":
                    if (a.timeInMinutes && b.timeInMinutes) {
                        return a.timeInMinutes - b.timeInMinutes;
                    }
                    return parseTime(a.time) - parseTime(b.time);
                case "time-":
                    if (a.timeInMinutes && b.timeInMinutes) {
                        return b.timeInMinutes - a.timeInMinutes;
                    }
                    return parseTime(b.time) - parseTime(a.time);
                default:
                    return 0;
            }
        });
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
        <div class="study-researcher">${study.researcher || "Unknown"}</div>
        <div class="study-reward"><strong>Pay:</strong> ${study.reward || "N/A"}</div>
        <div class="study-reward-hour">${study.rewardPerHour || "N/A"} &#47;hr</div>
        <div class="study-time"><strong>Time:</strong> ${study.time || "N/A"}</div>
        <div class="study-created-at">${formattedDate}</div>
        <button class="btn btn-success open-btn" data-index="${index}">
          <a href="${link}" target="_blank" rel="noopener noreferrer" class="normal-link white">Open</a>
        </button>
        <button class="btn delete-btn" data-index="${index}">
          <img src="/svgs/trash.svg" alt="trash"> Delete
        </button>
      </div>
    `;
            studiesContainer.appendChild(studyCard);
        });
        studiesContainer.querySelectorAll(".delete-btn").forEach(button => {
            button.addEventListener("click", (e) => {
                const target = e.currentTarget;
                const index = parseInt(target.getAttribute("data-index") || "", 10);
                currentStudies.splice(index, 1);
                chrome.storage.local.set({ currentStudies });
                populateStudies();
            });
        });
    });
}
function setupSearch() {
    return __awaiter(this, void 0, void 0, function* () {
        const searchInput = document.getElementById("search-studies");
        if (!searchInput)
            return;
        searchInput.addEventListener("input", function () {
            return __awaiter(this, void 0, void 0, function* () {
                const searchValue = searchInput.value;
                yield populateStudies(searchValue);
            });
        });
        const result = yield chrome.storage.sync.get("searchStudies");
        searchInput.value = result["searchStudies"] || "";
    });
}
function changeTab(activeTab) {
    return __awaiter(this, void 0, void 0, function* () {
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
            yield populateStudies();
        }
        else if (activeTab === 'filters') {
            yield populateBlacklists();
        }
    });
}
function setAlertState() {
    return __awaiter(this, void 0, void 0, function* () {
        const websiteButton = document.getElementById("websiteBtn");
        const titleButton = document.getElementById("titleBtn");
        const trackIds = document.getElementById("trackIds");
        const trackIdsLabel = document.getElementById("trackIdsLabel");
        const history = document.getElementById("studyHistoryLen");
        const historyLabel = document.getElementById("study-history-len-label");
        const refreshRate = document.getElementById("refreshRate");
        const refreshRateLabel = document.getElementById("refreshRate-label");
        const enableControls = () => {
            [historyLabel, refreshRateLabel, trackIdsLabel].forEach(el => el.classList.remove("disabled-text"));
            [history, refreshRate, trackIds].forEach(el => el.disabled = false);
        };
        const disableControls = () => {
            [historyLabel, refreshRateLabel, trackIdsLabel].forEach(el => el.classList.add("disabled-text"));
            [history, refreshRate, trackIds].forEach(el => el.disabled = true);
        };
        const setActiveButton = (activeBtn, inactiveBtn) => {
            activeBtn.classList.add("active");
            inactiveBtn.classList.remove("active");
        };
        const result = yield chrome.storage.sync.get("useOld");
        if (result["useOld"]) {
            disableControls();
            setActiveButton(titleButton, websiteButton);
        }
        else {
            enableControls();
            setActiveButton(websiteButton, titleButton);
        }
        websiteButton.addEventListener("click", () => __awaiter(this, void 0, void 0, function* () {
            enableControls();
            setActiveButton(websiteButton, titleButton);
            yield chrome.storage.sync.set({ useOld: false });
            const tabs = yield chrome.tabs.query({ url: "*://app.prolific.com/*" });
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {
                    type: 'change-alert-type',
                    target: 'everything',
                    data: "website"
                });
            });
        }));
        titleButton.addEventListener("click", () => __awaiter(this, void 0, void 0, function* () {
            disableControls();
            setActiveButton(titleButton, websiteButton);
            yield chrome.storage.sync.set({ useOld: true });
            const tabs = yield chrome.tabs.query({ url: "*://app.prolific.com/*" });
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {
                    type: 'change-alert-type',
                    target: 'content',
                    data: "title"
                });
            });
            chrome.runtime.sendMessage({
                type: 'change-alert-type',
                target: 'background',
                data: "title"
            });
        }));
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
function populateBlacklists() {
    return __awaiter(this, void 0, void 0, function* () {
        yield populateBlacklist("name-list", "nameBlacklist");
        yield populateBlacklist("researcher-list", "researcherBlacklist");
    });
}
function populateBlacklist(listId_1, storageKey_1) {
    return __awaiter(this, arguments, void 0, function* (listId, storageKey, values = []) {
        const blacklistContainer = document.getElementById(listId);
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
        <span>${item}</span> <span class="remove-btn" data-index="${index}">x</span>
        `;
            blacklistContainer.appendChild(itemCard);
        });
        blacklistContainer.querySelectorAll(".remove-btn").forEach((btn) => {
            btn.addEventListener("click", (e) => {
                const target = e.target;
                const index = parseInt(target.getAttribute("data-index") || "");
                currentItems.splice(index, 1);
                chrome.storage.sync.set({ [storageKey]: currentItems });
                populateBlacklist(listId, storageKey, currentItems);
            });
        });
    });
}
function renderPopup() {
    return __awaiter(this, void 0, void 0, function* () {
        yield setCheckboxState("autoAudio", "audioActive");
        yield setCheckboxState("showNotification", "showNotification");
        yield setCheckboxState("openProlific", "openProlific");
        yield setCheckboxState("focusProlific", "focusProlific");
        yield setCheckboxState("trackIds", "trackIds");
        yield setInputState("reward", "reward");
        yield setInputState("rewardPerHour", "rewardPerHour");
        yield setInputState("time", "time");
        yield setInputState("studyHistoryLen", "studyHistoryLen");
        yield setInputState("refreshRate", "refreshRate");
        yield setAlertState();
        yield setSelectState("selectAudio", "audio");
        yield setSelectState("sort-studies", "sortStudies", populateStudies);
        const volume = document.getElementById("volume");
        if (volume) {
            yield setVolume(volume);
        }
    });
}
