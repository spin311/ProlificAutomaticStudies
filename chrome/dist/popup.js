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
const REVIEW_PROMPT_KEY = "reviewPrompt";
const REVIEW_PROMPT_ANSWERED_AT_KEY = "reviewPromptAnsweredAt";
const REVIEW_PROMPT_MIN_STUDIES = 10;
const SPONSOR_PROMPT_KEY = "sponsorPrompt";
const SPONSOR_PROMPT_MIN_STUDIES = 100;
const SPONSOR_PROMPT_DELAY_MS = 7 * 24 * 60 * 60 * 1000;
const SPONSOR_MILESTONE_URL = "https://github.com/sponsors/spin311?metadata_source=ProlificAutomaticStudies-milestone";
// Store review pages. Chrome: only the Web Store build gets the prompt, so unpacked
// dev builds and other listings (e.g. Edge Add-ons) never point at the wrong store.
const CHROME_STORE_EXTENSION_ID = "mlicfddkgjkeajfgkihplfbgpmbonbao";
const CHROME_REVIEW_URL = `https://chromewebstore.google.com/detail/prolific-studies-notifier/${CHROME_STORE_EXTENSION_ID}/reviews`;
function getReviewUrl(extensionId) {
    return extensionId === CHROME_STORE_EXTENSION_ID ? CHROME_REVIEW_URL : null;
}
// Ask once: any stored answer ('rated' or 'dismissed') hides the card for good.
function shouldShowReviewPrompt(notifiedCount, answer, reviewUrl) {
    if (reviewUrl === null || answer === "rated" || answer === "dismissed")
        return false;
    return typeof notifiedCount === "number" && notifiedCount >= REVIEW_PROMPT_MIN_STUDIES;
}
// The sponsor ask comes after the review ask is settled: either there is no review
// card for this build, or it was answered at least a week ago.
function shouldShowSponsorPrompt(state) {
    const { notifiedCount, reviewUrl, reviewAnswer, reviewAnsweredAt, sponsorAnswer, now } = state;
    if (sponsorAnswer === "clicked" || sponsorAnswer === "dismissed")
        return false;
    if (typeof notifiedCount !== "number" || notifiedCount < SPONSOR_PROMPT_MIN_STUDIES)
        return false;
    if (reviewUrl === null)
        return true;
    const isReviewAnswered = reviewAnswer === "rated" || reviewAnswer === "dismissed";
    return isReviewAnswered && typeof reviewAnsweredAt === "number" && now - reviewAnsweredAt >= SPONSOR_PROMPT_DELAY_MS;
}
// At most one card, so the popup never asks twice at once.
function getDuePrompt(state) {
    if (shouldShowReviewPrompt(state.notifiedCount, state.reviewAnswer, state.reviewUrl))
        return "review";
    return shouldShowSponsorPrompt(state) ? "sponsor" : null;
}
function setupPrompts(notifiedCount) {
    return __awaiter(this, void 0, void 0, function* () {
        // The prompts are optional: a failing storage read must not stop the rest of the popup.
        try {
            yield showDuePrompt(notifiedCount);
        }
        catch (error) {
            console.error("Could not set up the review and sponsor prompts", error);
        }
    });
}
function showDuePrompt(notifiedCount) {
    return __awaiter(this, void 0, void 0, function* () {
        const reviewUrl = getReviewUrl(chrome.runtime.id);
        const stored = yield chrome.storage.sync.get([REVIEW_PROMPT_KEY, REVIEW_PROMPT_ANSWERED_AT_KEY, SPONSOR_PROMPT_KEY]);
        // Decided once, at popup load, so answering one card never brings up the other.
        const due = getDuePrompt({
            notifiedCount,
            reviewUrl,
            reviewAnswer: stored[REVIEW_PROMPT_KEY],
            reviewAnsweredAt: stored[REVIEW_PROMPT_ANSWERED_AT_KEY],
            sponsorAnswer: stored[SPONSOR_PROMPT_KEY],
            now: Date.now(),
        });
        if (due === "review" && reviewUrl !== null) {
            const answerReview = (value) => chrome.storage.sync.set({ [REVIEW_PROMPT_KEY]: value, [REVIEW_PROMPT_ANSWERED_AT_KEY]: Date.now() });
            showPromptCard("review", notifiedCount, () => __awaiter(this, void 0, void 0, function* () {
                // Store the answer first: the popup can close as soon as the tab opens.
                yield answerReview("rated");
                yield chrome.tabs.create({ url: reviewUrl, active: true });
            }), () => answerReview("dismissed"));
        }
        else if (due === "sponsor") {
            showPromptCard("sponsor", notifiedCount, () => __awaiter(this, void 0, void 0, function* () {
                yield chrome.storage.sync.set({ [SPONSOR_PROMPT_KEY]: "clicked" });
                yield chrome.tabs.create({ url: SPONSOR_MILESTONE_URL, active: true });
            }), () => chrome.storage.sync.set({ [SPONSOR_PROMPT_KEY]: "dismissed" }));
        }
    });
}
// Shows one prompt card (element ids are "<name>Prompt", "<name>Start" or "reviewRate", ...)
// and hides the header Sponsor button meanwhile: one ask at a time.
function showPromptCard(name, notifiedCount, onPrimary, onDismiss) {
    const card = document.getElementById(`${name}Prompt`);
    const primary = document.getElementById(name === "review" ? "reviewRate" : "sponsorStart");
    const dismiss = document.getElementById(name === "review" ? "reviewDismiss" : "sponsorDismiss");
    if (!card || !primary || !dismiss)
        return;
    const countElement = document.getElementById(`${name}PromptCount`);
    if (countElement)
        countElement.textContent = String(notifiedCount);
    const sponsorButton = document.getElementById("sponsorButton");
    card.hidden = false;
    if (sponsorButton)
        sponsorButton.hidden = true;
    const close = () => {
        card.hidden = true;
        if (sponsorButton)
            sponsorButton.hidden = false;
    };
    primary.addEventListener("click", () => __awaiter(this, void 0, void 0, function* () {
        close();
        yield onPrimary();
    }));
    dismiss.addEventListener("click", () => __awaiter(this, void 0, void 0, function* () {
        close();
        yield onDismiss();
    }));
}
const OPENED_STUDY_IDS = "openedStudyIds";
// Weeks of studies; the oldest drop off first.
const OPENED_STUDY_IDS_LIMIT = 1000;
const MIDDLE_BUTTON = 1;
let openedStudyIds = [];
function addOpenedStudyId(ids, id) {
    return [...ids.filter((openedId) => openedId !== id), id].slice(-OPENED_STUDY_IDS_LIMIT);
}
// Starts the storage write before anything else: a left click opens a tab, and the
// popup can close as soon as it does.
function markStudyOpened(id, row) {
    openedStudyIds = addOpenedStudyId(openedStudyIds, id);
    const saved = chrome.storage.local.set({ [OPENED_STUDY_IDS]: openedStudyIds });
    row.classList.add("is-opened");
    return saved;
}
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
            const notifiedCount = yield setCounter(counter);
            yield setupPrompts(notifiedCount);
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
        return typeof count === "number" ? count : 0;
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
// New columns go last, so spreadsheets built on older exports keep working.
const CSV_COLUMNS = [
    "id", "title", "researcher", "reward", "rewardPerHour",
    "time", "timeInMinutes", "createdAt", "places"
];
function buildStudiesCsv(studies) {
    const rows = studies.map((study) => CSV_COLUMNS.map((column) => {
        const value = study[column];
        if (value === null || value === undefined)
            return "";
        return `"${String(value).replace(/"/g, '""')}"`;
    }).join(","));
    return [CSV_COLUMNS.join(","), ...rows].join("\n");
}
function downloadStudies() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const result = yield chrome.storage.local.get("currentStudies");
        const studies = (_a = result["currentStudies"]) !== null && _a !== void 0 ? _a : [];
        const csvContent = buildStudiesCsv(studies);
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
// Day/month and time: the history only holds recent studies, so the year adds nothing.
function formatDate(dateStr) {
    const date = new Date(dateStr);
    const pad = (value) => (value < 10 ? `0${value}` : String(value));
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
        var _a, _b;
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
        const result = yield chrome.storage.local.get(["currentStudies", OPENED_STUDY_IDS]);
        const savedStudies = (_a = result["currentStudies"]) !== null && _a !== void 0 ? _a : [];
        openedStudyIds = (_b = result[OPENED_STUDY_IDS]) !== null && _b !== void 0 ? _b : [];
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
            studiesContainer.append(createStudyCard(study, {
                isOpened: study.id !== null && openedStudyIds.includes(study.id),
                onDelete: () => __awaiter(this, void 0, void 0, function* () {
                    // Delete from everything saved, not only the studies the search shows.
                    const remaining = savedStudies.filter((saved) => saved.id !== study.id);
                    yield chrome.storage.local.set({ currentStudies: remaining });
                    yield populateStudies();
                }),
            }));
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
function getStudyUrl(study) {
    var _a;
    return `https://app.prolific.com/studies/${encodeURIComponent((_a = study.id) !== null && _a !== void 0 ? _a : "")}`;
}
// A real link, so right-click > Copy link and middle-click work on it.
function createStudyLink(study, className, text) {
    const link = document.createElement("a");
    link.className = className;
    link.href = getStudyUrl(study);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = text;
    return link;
}
function getStudyMeta(study) {
    const rewardPerHour = study.rewardPerHour ? `${study.rewardPerHour}/hr` : null;
    return [study.reward, rewardPerHour, study.time, study.places].filter(Boolean).join(" · ");
}
function watchStudyOpened(link, study, row) {
    const id = study.id;
    if (!id)
        return;
    link.addEventListener("click", () => markStudyOpened(id, row));
    link.addEventListener("auxclick", (event) => {
        if (event.button === MIDDLE_BUTTON)
            return markStudyOpened(id, row);
    });
}
function createStudyCard(study, options) {
    const row = document.createElement("div");
    row.className = options.isOpened ? "study-card is-opened" : "study-card";
    const title = createStudyLink(study, "study-title", study.title || "Untitled");
    title.title = study.title || "";
    const openLink = createStudyLink(study, "btn open-btn normal-link", "Open");
    watchStudyOpened(title, study, row);
    watchStudyOpened(openLink, study, row);
    const details = document.createElement("div");
    details.className = "study-sub";
    details.append(createTextElement("span", "study-researcher", study.researcher || "Unknown"), createTextElement("span", "study-created-at", study.createdAt ? formatDate(study.createdAt) : ""));
    const deleteButton = document.createElement("button");
    deleteButton.className = "icon-btn delete-btn";
    deleteButton.title = "Delete";
    deleteButton.setAttribute("aria-label", `Delete ${study.title || "study"}`);
    const trashIcon = document.createElement("img");
    trashIcon.src = "/svgs/trash.svg";
    trashIcon.alt = "";
    deleteButton.append(trashIcon);
    deleteButton.addEventListener("click", options.onDelete);
    const actions = document.createElement("div");
    actions.className = "study-actions";
    actions.append(openLink, deleteButton);
    row.append(title, createTextElement("div", "study-meta", getStudyMeta(study)), details, actions);
    return row;
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
