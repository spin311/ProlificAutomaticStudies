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
const targetSelector = 'div[data-testid="studies-list"]';
let globalObserver = null;
let globalInterval = null;
let isProcessing = false;
// Set when the page changes during a scan, so the scan runs once more right after.
let isRescanNeeded = false;
// Ids this page listed at its last scan; null until the first scan. With "Notify
// once per study" off, a study this page saw leave the list and come back is
// notified again. Prolific removes its list while it refreshes (every 2 minutes),
// so listed studies come back after each refresh, as they did before 3.6.1.
// Kept per page, not in storage, so a second tab with an older list can't make
// this tab's studies look returned on every mutation.
let previouslyListedIds = null;
const NUMBER_OF_STUDIES_TO_STORE = 100;
const REWARD = "reward";
const REWARD_PER_HOUR = "rewardPerHour";
const TIME = 'time';
const NAME_BLACKLIST = "nameBlacklist";
const RESEARCHER_BLACKLIST = "researcherBlacklist";
const SEEN_STUDY_IDS = "seenStudyIds";
// Well above the number of studies Prolific lists at once, so a listed study
// is never dropped while it is still on the page.
const SEEN_STUDY_IDS_LIMIT = 1000;
function handleContentMessages(message) {
    if (message.target !== "content" && message.target !== 'everything') {
        return Promise.resolve();
    }
    switch (message.type) {
        case "change-alert-type":
            if (message.data === "website") {
                observeStudyChanges();
            }
            else {
                disconnectObserver();
            }
            return Promise.resolve();
        default:
            return Promise.resolve();
    }
}
function isObserverActive() {
    return globalObserver !== null;
}
function disconnectObserver() {
    globalObserver === null || globalObserver === void 0 ? void 0 : globalObserver.disconnect();
    globalObserver = null;
    if (globalInterval !== null) {
        clearInterval(globalInterval);
        globalInterval = null;
    }
}
chrome.runtime.onMessage.addListener(handleContentMessages);
void observeStudyChanges();
function observeStudyChanges() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        if (isObserverActive())
            return;
        globalObserver = new MutationObserver((mutationsList) => __awaiter(this, void 0, void 0, function* () {
            if (!document.querySelector(targetSelector))
                return;
            const hasChanges = mutationsList.some(mutation => mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0 || mutation.type === 'childList');
            if (hasChanges) {
                yield extractAndSendStudies();
            }
        }));
        globalObserver.observe(document.body, { childList: true, subtree: true });
        // Project studies (see projectStudies.ts) change Prolific's tab-title count,
        // not the Studies list, so a title change is a reason to scan too.
        observeTitle(globalObserver);
        // Studies already listed when the script starts cause no mutation.
        void extractAndSendStudies();
        // Setup polling fallback
        const result = yield chrome.storage.sync.get(["refreshRate"]);
        const refreshRate = result["refreshRate"];
        if (refreshRate && refreshRate > 0) {
            const timer = ((_a = result["refreshRate"]) !== null && _a !== void 0 ? _a : 5) * 1000;
            globalInterval = setInterval(() => __awaiter(this, void 0, void 0, function* () {
                const node = yield waitForElement(targetSelector);
                if (node) {
                    yield extractAndSendStudies();
                }
            }), timer);
        }
    });
}
// One scan at a time, but a page change during a scan is never dropped: the scan
// runs again when it ends. Otherwise a study rendered a moment after another waited
// for the next unrelated page change (up to Prolific's 2-minute refresh).
function extractAndSendStudies() {
    return __awaiter(this, void 0, void 0, function* () {
        if (isProcessing) {
            isRescanNeeded = true;
            return;
        }
        isProcessing = true;
        try {
            do {
                isRescanNeeded = false;
                // Read the list afresh each time: Prolific may have re-rendered it.
                const targetNode = document.querySelector(targetSelector);
                if (!targetNode)
                    return;
                const studies = yield extractStudies(targetNode);
                if (studies.length > 0) {
                    void chrome.runtime.sendMessage({
                        target: "background",
                        type: "new-studies",
                        data: studies,
                    });
                }
            } while (isRescanNeeded);
        }
        finally {
            isProcessing = false;
        }
    });
}
function waitForElement(selector) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve) => {
            const observer = new MutationObserver(() => {
                const target = document.querySelector(selector);
                if (target) {
                    observer.disconnect();
                    resolve(target);
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            const target = document.querySelector(selector);
            if (target) {
                observer.disconnect();
                resolve(target);
            }
        });
    });
}
function extractStudies(targetNode) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        const studyElements = targetNode.querySelectorAll("li[class='list-item']");
        // Read with the list, before any await, so both describe the same moment.
        const projectStudies = requestProjectStudies();
        const pageIds = getStudyIds(studyElements);
        const listedIds = [...pageIds, ...projectStudies.map((study) => study.id).filter((id) => !pageIds.includes(id))];
        const returnedIds = trackReturnedIds(listedIds);
        // Prolific blanks the list while it refreshes; the history keeps what it had.
        if (listedIds.length === 0)
            return [];
        const storageValues = yield chrome.storage.sync.get([
            "trackIds",
            "studyHistoryLen",
            REWARD,
            REWARD_PER_HOUR,
            TIME,
            NAME_BLACKLIST,
            RESEARCHER_BLACKLIST,
        ]);
        const localValues = yield chrome.storage.local.get([
            "currentStudies",
            SEEN_STUDY_IDS,
        ]);
        const shouldIgnoreOldStudies = (_a = storageValues["trackIds"]) !== null && _a !== void 0 ? _a : true;
        let studies = [];
        const numberOfStudiesToStore = (_b = storageValues["studyHistoryLen"]) !== null && _b !== void 0 ? _b : NUMBER_OF_STUDIES_TO_STORE;
        let savedStudies = (_c = localValues["currentStudies"]) !== null && _c !== void 0 ? _c : [];
        const reward = (_d = storageValues[REWARD]) !== null && _d !== void 0 ? _d : 0;
        const rewardPerHour = (_e = storageValues[REWARD_PER_HOUR]) !== null && _e !== void 0 ? _e : 0;
        const time = (_f = storageValues[TIME]) !== null && _f !== void 0 ? _f : 0;
        const nameBlacklist = (_g = storageValues[NAME_BLACKLIST]) !== null && _g !== void 0 ? _g : [];
        const researcherBlacklist = (_h = storageValues[RESEARCHER_BLACKLIST]) !== null && _h !== void 0 ? _h : [];
        // Studies already seen on the page are never new, however short the history
        // is. Before this, studies trimmed from the history while still listed were
        // re-notified on every page mutation. The set only grows (up to its limit),
        // so an empty re-render or a second tab with an older list can't reset it.
        const storedSeenIds = localValues[SEEN_STUDY_IDS];
        // First scan after upgrading: adopt what is listed without notifying it again.
        const isFirstScanAfterUpgrade = storedSeenIds === undefined && savedStudies.length > 0;
        const seenIds = isFirstScanAfterUpgrade ? listedIds : storedSeenIds !== null && storedSeenIds !== void 0 ? storedSeenIds : [];
        // Off: a study that left the list and came back is new again.
        const knownIds = new Set(shouldIgnoreOldStudies ? seenIds : seenIds.filter((id) => !returnedIds.has(id)));
        if (shouldIgnoreOldStudies) {
            savedStudies.forEach((study) => knownIds.add(study.id));
        }
        function shouldIncludeStudy(study) {
            if (reward && study.reward && getFloatValueFromMoneyStringContent(study.reward) < reward)
                return false;
            if (time && study.timeInMinutes && study.timeInMinutes < time)
                return false;
            if (nameBlacklist.some((name) => { var _a; return (_a = study.title) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes(name); }))
                return false;
            if (researcherBlacklist.some((researcher) => { var _a; return (_a = study.researcher) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes(researcher); }))
                return false;
            return !(rewardPerHour && study.rewardPerHour && getFloatValueFromMoneyStringContent(study.rewardPerHour) < rewardPerHour);
        }
        function shouldFilterStudies() {
            return reward > 0 || rewardPerHour > 0 || time > 0 || nameBlacklist.length > 0 || researcherBlacklist.length > 0;
        }
        studyElements.forEach((study) => {
            var _a, _b;
            const id = getStudyId(study);
            if (!id || knownIds.has(id))
                return;
            const title = getTextContent(study, '[data-testid="title"]');
            const researcher = ((_a = getTextContent(study, '[data-testid="host"]')) === null || _a === void 0 ? void 0 : _a.split(" ").slice(1).join(" ")) || null;
            const reward = getTextContent(study, '[data-testid="study-tag-reward"]');
            const rewardPerHour = ((_b = getTextContent(study, '[data-testid="study-tag-reward-per-hour"]')) === null || _b === void 0 ? void 0 : _b.replace("/hr", "")) || null;
            const time = getTextContent(study, '[data-testid="study-tag-completion-time"]');
            const timeInMinutes = parseTimeContent(time);
            studies.push({
                id,
                title,
                researcher,
                reward,
                rewardPerHour,
                time,
                timeInMinutes,
                places: getPlaces(study),
                createdAt: new Date().toISOString(),
            });
        });
        projectStudies.forEach((study) => {
            if (!knownIds.has(study.id) && !pageIds.includes(study.id))
                studies.push(study);
        });
        if (shouldFilterStudies()) {
            studies = studies.filter((study) => shouldIncludeStudy(study));
        }
        savedStudies = addToHistory(savedStudies, studies);
        if (savedStudies.length > numberOfStudiesToStore) {
            savedStudies = savedStudies.slice(-numberOfStudiesToStore);
        }
        if (studies.length > 0) {
            yield chrome.storage.local.set({ "currentStudies": savedStudies });
        }
        const updatedSeenIds = getUpdatedSeenIds(seenIds, listedIds, studies);
        if (!haveSameIds(storedSeenIds !== null && storedSeenIds !== void 0 ? storedSeenIds : [], updatedSeenIds)) {
            yield chrome.storage.local.set({ [SEEN_STUDY_IDS]: updatedSeenIds });
        }
        return studies;
    });
}
function observeTitle(observer) {
    const title = document.querySelector("title");
    if (title)
        observer.observe(title, { childList: true });
}
function getStudyId(study) {
    var _a;
    return ((_a = study.getAttribute("data-testid")) === null || _a === void 0 ? void 0 : _a.split("-")[1]) || null;
}
function getStudyIds(studyElements) {
    return Array.from(studyElements)
        .map(getStudyId)
        .filter((id) => id !== null);
}
// Records what this page lists now and returns the ids it did not list at its
// previous scan. None on the first scan: what is listed when the script
// starts has not come back.
function trackReturnedIds(listedIds) {
    const previous = previouslyListedIds;
    previouslyListedIds = new Set(listedIds);
    return new Set(previous ? listedIds.filter((id) => !previous.has(id)) : []);
}
// The popup's list is a history with either "Notify once per study" setting:
// new studies go to the end, and a study notified again because it came back
// (setting off) keeps its first entry instead of being listed twice.
function addToHistory(history, notified) {
    const historyIds = new Set(history.map((study) => study.id));
    return [...history, ...notified.filter((study) => !historyIds.has(study.id))];
}
// Moves still-listed seen ids to the end (most recent) and adds the newly
// notified ones. Filtered-out studies are not added, so relaxing a filter
// still notifies them.
function getUpdatedSeenIds(seenIds, listedIds, notified) {
    const seen = new Set(seenIds);
    const recent = new Set([
        ...listedIds.filter((id) => seen.has(id)),
        ...notified.map((study) => study.id).filter((id) => id !== null),
    ]);
    return [...seenIds.filter((id) => !recent.has(id)), ...recent].slice(-SEEN_STUDY_IDS_LIMIT);
}
function haveSameIds(previous, current) {
    return previous.length === current.length && previous.every((id, index) => id === current[index]);
}
// Prolific shows places left as "120 places", or an infinity sign when a study has no limit.
// It is the count when the study was first seen, so it goes stale.
function getPlaces(study) {
    var _a;
    if (study.querySelector('[data-testid="study-tag-places-infinite"]'))
        return "∞ places";
    return ((_a = getTextContent(study, '[data-testid="study-tag-places"]')) === null || _a === void 0 ? void 0 : _a.trim()) || null;
}
function getTextContent(element, selector) {
    var _a;
    return ((_a = element === null || element === void 0 ? void 0 : element.querySelector(selector)) === null || _a === void 0 ? void 0 : _a.textContent) || null;
}
function parseTimeContent(value) {
    if (!value)
        return 0;
    const hourMatch = value.match(/(\d+)\s*hour/);
    const minMatch = value.match(/(\d+)\s*min/);
    const hours = hourMatch ? parseInt(hourMatch[1], 10) : 0;
    const minutes = minMatch ? parseInt(minMatch[1], 10) : 0;
    return hours * 60 + minutes;
}
function getFloatValueFromMoneyStringContent(value) {
    const firstWord = value.split(" ")[0];
    if (firstWord.charAt(0) === '£') {
        return parseFloat(firstWord.slice(1));
    }
    else if (firstWord.charAt(0) === '$') {
        return parseFloat(firstWord.slice(1)) * 0.8;
    }
    else {
        return 0;
    }
}
