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
        // Turn on switch animations only once the saved states are drawn, so opening
        // the popup shows them in place instead of sliding every enabled switch on.
        requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.add("is-ready")));
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
        if (result[storageKey] !== undefined) {
            element.value = result[storageKey];
        }
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
const POPUP_TABS = ["settings", "studies", "filters"];
function setCurrentActiveTab() {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield chrome.storage.sync.get("activeTab");
        const savedTab = result["activeTab"];
        // A missing or unknown tab would hide every section, leaving only the tab bar.
        yield changeTab(POPUP_TABS.includes(savedTab) ? savedTab : "settings");
    });
}
function populateStudies() {
    return __awaiter(this, arguments, void 0, function* (search = '', sort = "") {
        var _a;
        if (!search) {
            const searchInput = document.getElementById("search-studies");
            search = searchInput.value;
        }
        if (!sort) {
            const result = yield chrome.storage.sync.get("sortStudies");
            sort = result["sortStudies"];
        }
        const studiesContainer = document.getElementById("studies-container");
        studiesContainer.replaceChildren();
        const result = yield chrome.storage.local.get("currentStudies");
        const savedStudies = (_a = result["currentStudies"]) !== null && _a !== void 0 ? _a : [];
        let currentStudies = [...savedStudies];
        if (currentStudies.length === 0) {
            studiesContainer.append(createTextElement("p", "text-center", "No studies available."));
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
        currentStudies.forEach((study) => {
            studiesContainer.append(createStudyCard(study, () => __awaiter(this, void 0, void 0, function* () {
                // Delete from everything saved, not only the studies the search shows.
                const remaining = savedStudies.filter((saved) => saved.id !== study.id);
                yield chrome.storage.local.set({ currentStudies: remaining });
                yield populateStudies();
            })));
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
        const fastMode = document.getElementById("fastMode");
        const fastModeLabel = document.getElementById("fastMode-label");
        const fastModeInterval = document.getElementById("fastModeInterval");
        const fastModeIntervalLabel = document.getElementById("fastModeInterval-label");
        const labels = [historyLabel, trackIdsLabel, fastModeLabel, fastModeIntervalLabel].filter(Boolean);
        const inputs = [history, trackIds, fastMode, fastModeInterval].filter(Boolean);
        const enableControls = () => {
            labels.forEach(el => el.classList.remove("disabled-text"));
            inputs.forEach(el => el.disabled = false);
        };
        const disableControls = () => {
            labels.forEach(el => el.classList.add("disabled-text"));
            inputs.forEach(el => el.disabled = true);
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
function setCheckboxState(elementId_1, storageKey_1) {
    return __awaiter(this, arguments, void 0, function* (elementId, storageKey, storageArea = chrome.storage.sync) {
        const element = document.getElementById(elementId);
        if (!element)
            return;
        const result = yield storageArea.get(storageKey);
        if (result[storageKey] !== undefined) {
            element.checked = result[storageKey];
        }
        element.addEventListener("click", function () {
            return __awaiter(this, void 0, void 0, function* () {
                yield storageArea.set({ [storageKey]: element.checked });
            });
        });
    });
}
function setInputState(elementId_1, storageKey_1) {
    return __awaiter(this, arguments, void 0, function* (elementId, storageKey, storageArea = chrome.storage.sync) {
        const element = document.getElementById(elementId);
        if (!element)
            return;
        const result = yield storageArea.get(storageKey);
        if (result[storageKey] !== undefined) {
            element.value = result[storageKey];
        }
        element.addEventListener("change", function () {
            return __awaiter(this, void 0, void 0, function* () {
                yield storageArea.set({ [storageKey]: parseFloat(element.value) });
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
        blacklistContainer.replaceChildren();
        let currentItems;
        if (values.length === 0) {
            const result = yield chrome.storage.sync.get(storageKey);
            currentItems = result[storageKey] || [];
        }
        else {
            currentItems = values;
        }
        currentItems.forEach((item, index) => {
            blacklistContainer.append(createBlacklistChip(item, () => __awaiter(this, void 0, void 0, function* () {
                const remaining = currentItems.filter((_, i) => i !== index);
                yield chrome.storage.sync.set({ [storageKey]: remaining });
                yield populateBlacklist(listId, storageKey, remaining);
            })));
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
        yield setCheckboxState("fastMode", "fastMode", chrome.storage.local);
        yield setInputState("reward", "reward");
        yield setInputState("rewardPerHour", "rewardPerHour");
        yield setInputState("time", "time");
        yield setInputState("studyHistoryLen", "studyHistoryLen");
        yield setInputState("fastModeInterval", "fastModeInterval", chrome.storage.local);
        yield setAlertState();
        yield setSelectState("selectAudio", "audio");
        yield setSelectState("sort-studies", "sortStudies", populateStudies);
        const volume = document.getElementById("volume");
        if (volume) {
            yield setVolume(volume);
        }
    });
}
// Study text comes from Prolific's page (researchers write it) and blacklist words
// from the user, so both are only ever inserted as text, never parsed as HTML.
function createTextElement(tagName, className, text) {
    const element = document.createElement(tagName);
    element.className = className;
    element.textContent = text;
    return element;
}
function createLabeledText(className, label, value) {
    const element = document.createElement("div");
    element.className = className;
    const labelElement = document.createElement("strong");
    labelElement.textContent = label;
    element.append(labelElement, ` ${value}`);
    return element;
}
function createStudyCard(study, onDelete) {
    var _a;
    const header = document.createElement("div");
    header.className = "study-header";
    const image = document.createElement("img");
    image.src = "/imgs/logo.png";
    image.alt = "";
    image.className = "study-img";
    header.append(image, createTextElement("div", "study-title", study.title || "Untitled"));
    const openLink = document.createElement("a");
    openLink.className = "btn btn-success open-btn normal-link";
    openLink.href = `https://app.prolific.com/studies/${encodeURIComponent((_a = study.id) !== null && _a !== void 0 ? _a : "")}`;
    openLink.target = "_blank";
    openLink.rel = "noopener noreferrer";
    openLink.textContent = "Open";
    const deleteButton = document.createElement("button");
    deleteButton.className = "btn delete-btn";
    const trashIcon = document.createElement("img");
    trashIcon.src = "/svgs/trash.svg";
    trashIcon.alt = "";
    deleteButton.append(trashIcon, " Delete");
    deleteButton.addEventListener("click", onDelete);
    const info = document.createElement("div");
    info.className = "study-info";
    info.append(header, createTextElement("div", "study-researcher", study.researcher || "Unknown"), createLabeledText("study-reward", "Pay:", study.reward || "N/A"), createTextElement("div", "study-reward-hour", `${study.rewardPerHour || "N/A"} /hr`), createLabeledText("study-time", "Time:", study.time || "N/A"), createTextElement("div", "study-created-at", study.createdAt ? formatDate(study.createdAt) : "N/A"), openLink, deleteButton);
    const card = document.createElement("div");
    card.className = "study-card";
    card.append(info);
    return card;
}
function createBlacklistChip(item, onRemove) {
    const chip = document.createElement("div");
    chip.className = "blacklist-card";
    const removeButton = document.createElement("button");
    removeButton.className = "remove-btn";
    removeButton.textContent = "×";
    removeButton.setAttribute("aria-label", `Remove ${item}`);
    removeButton.addEventListener("click", onRemove);
    chip.append(createTextElement("span", "", item), removeButton);
    return chip;
}
