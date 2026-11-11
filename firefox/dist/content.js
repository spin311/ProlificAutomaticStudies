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
let isObserverInitializing = false;
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
browser.runtime.onMessage.addListener(handleContentMessages);
observeStudyChanges();
function getValueFromStorage(key, defaultValue) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield browser.storage.sync.get(key);
        return result[key] !== undefined ? result[key] : defaultValue;
    });
}
function waitForElement(selector) {
    return __awaiter(this, void 0, void 0, function* () {
        const useOld = yield getValueFromStorage("useOld", false);
        if (useOld)
            return null;
        return new Promise((resolve) => {
            const observer = new MutationObserver(() => {
                const target = document.querySelector(selector);
                if (target) {
                    observer.disconnect();
                    resolve(target);
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            const existingElement = document.querySelector(selector);
            if (existingElement) {
                observer.disconnect();
                resolve(existingElement);
            }
        });
    });
}
function handleContentMessages(message) {
    if (message.target !== "content" && message.target !== 'everything')
        return;
    switch (message.type) {
        case "change-alert-type":
            if (message.data === "website") {
                observeStudyChanges();
            }
            else {
                disconnectObserver();
            }
            break;
    }
}
function disconnectObserver() {
    globalObserver === null || globalObserver === void 0 ? void 0 : globalObserver.disconnect();
    globalObserver = null;
    if (globalInterval !== null) {
        clearInterval(globalInterval);
        globalInterval = null;
    }
}
function isObserverActive() {
    return globalObserver !== null;
}
function observeStudyChanges() {
    return __awaiter(this, void 0, void 0, function* () {
        if (isObserverActive() || isObserverInitializing)
            return;
        isObserverInitializing = true;
        const targetNode = yield waitForElement(targetSelector);
        isObserverInitializing = false;
        if (!targetNode)
            return;
        globalObserver = new MutationObserver((mutations) => __awaiter(this, void 0, void 0, function* () {
            const hasChanges = mutations.some(m => m.addedNodes.length > 0 || m.removedNodes.length > 0);
            if (hasChanges)
                yield extractAndSendStudies(targetNode);
        }));
        globalObserver.observe(targetNode, { childList: true, subtree: true });
        // Project studies (see projectStudies.ts) change Prolific's tab-title count,
        // not the Studies list, so a title change is a reason to scan too.
        observeTitle(globalObserver);
        yield extractAndSendStudies(targetNode);
        const storage = yield browser.storage.sync.get(["refreshRate"]);
        const refreshRate = storage["refreshRate"];
        if (refreshRate && refreshRate > 0) {
            const intervalMs = refreshRate * 1000;
            globalInterval = setInterval(() => __awaiter(this, void 0, void 0, function* () {
                const node = yield waitForElement(targetSelector);
                if (node) {
                    yield extractAndSendStudies(node);
                }
            }), intervalMs);
        }
    });
}
// One scan at a time, but a page change during a scan is never dropped: the scan
// runs again when it ends. Otherwise a study rendered a moment after another waited
// for the next unrelated page change (up to Prolific's 2-minute refresh).
function extractAndSendStudies(targetNode) {
    return __awaiter(this, void 0, void 0, function* () {
        if (isProcessing) {
            isRescanNeeded = true;
            return;
        }
        isProcessing = true;
        try {
            do {
                isRescanNeeded = false;
                const studies = yield extractStudies(targetNode);
                if (studies.length > 0) {
                    yield browser.runtime.sendMessage({
                        target: "background",
                        type: "new-studies",
                        data: studies,
                    });
                }
            } while (isRescanNeeded);
        }
        catch (e) {
            console.error("Error extracting studies:", e);
        }
        finally {
            isProcessing = false;
        }
    });
}
function extractStudies(targetNode) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e;
        const studyElements = targetNode.querySelectorAll("li.list-item");
        // Read with the list, before any await, so both describe the same moment.
        const projectStudies = requestProjectStudies();
        const pageIds = getStudyIds(studyElements);
        const listedIds = [...pageIds, ...projectStudies.map(study => study.id).filter(id => !pageIds.includes(id))];
        const returnedIds = trackReturnedIds(listedIds);
        if (!studyElements.length && !projectStudies.length)
            return [];
        const storageValues = yield browser.storage.sync.get([
            "trackIds", "studyHistoryLen",
            REWARD, REWARD_PER_HOUR, TIME,
            NAME_BLACKLIST, RESEARCHER_BLACKLIST
        ]);
        const localValues = yield browser.storage.local.get(["currentStudies", SEEN_STUDY_IDS]);
        const shouldIgnoreOldStudies = (_a = storageValues["trackIds"]) !== null && _a !== void 0 ? _a : true;
        const numberOfStudiesToStore = (_b = storageValues["studyHistoryLen"]) !== null && _b !== void 0 ? _b : NUMBER_OF_STUDIES_TO_STORE;
        const reward = (_c = storageValues[REWARD]) !== null && _c !== void 0 ? _c : 0;
        const rewardPerHour = (_d = storageValues[REWARD_PER_HOUR]) !== null && _d !== void 0 ? _d : 0;
        const time = (_e = storageValues[TIME]) !== null && _e !== void 0 ? _e : 0;
        const nameBlacklist = (storageValues[NAME_BLACKLIST] || []).map((s) => s.toLowerCase());
        const researcherBlacklist = (storageValues[RESEARCHER_BLACKLIST] || []).map((s) => s.toLowerCase());
        let savedStudies = localValues["currentStudies"] || [];
        // Studies already seen on the page are never new, however short the history
        // is. Before this, studies trimmed from the history while still listed were
        // re-notified on every page mutation. The set only grows (up to its limit),
        // so an empty re-render or a second tab with an older list can't reset it.
        const storedSeenIds = localValues[SEEN_STUDY_IDS];
        // First scan after upgrading: adopt what is listed without notifying it again.
        const isFirstScanAfterUpgrade = storedSeenIds === undefined && savedStudies.length > 0;
        const seenIds = isFirstScanAfterUpgrade ? listedIds : storedSeenIds !== null && storedSeenIds !== void 0 ? storedSeenIds : [];
        // Off: a study that left the list and came back is new again.
        const knownIds = new Set(shouldIgnoreOldStudies ? seenIds : seenIds.filter(id => !returnedIds.has(id)));
        if (shouldIgnoreOldStudies) {
            savedStudies.forEach(study => knownIds.add(study.id));
        }
        const newStudies = [];
        studyElements.forEach(el => {
            var _a;
            const id = getStudyId(el);
            if (!id || knownIds.has(id))
                return;
            const title = getTextContent(el, '[data-testid="title"]');
            const researcherRaw = getTextContent(el, '[data-testid="host"]');
            const researcher = (researcherRaw === null || researcherRaw === void 0 ? void 0 : researcherRaw.split(" ").slice(1).join(" ")) || null;
            const reward = getTextContent(el, '[data-testid="study-tag-reward"]');
            const rewardPerHour = ((_a = getTextContent(el, '[data-testid="study-tag-reward-per-hour"]')) === null || _a === void 0 ? void 0 : _a.replace("/hr", "")) || null;
            const time = getTextContent(el, '[data-testid="study-tag-completion-time"]');
            const timeInMinutes = parseTimeContent(time);
            newStudies.push({
                id,
                title,
                researcher,
                reward,
                rewardPerHour,
                time,
                timeInMinutes,
                places: getPlaces(el),
                createdAt: new Date().toISOString(),
            });
        });
        projectStudies.forEach(study => {
            if (!knownIds.has(study.id) && !pageIds.includes(study.id))
                newStudies.push(study);
        });
        const filteredStudies = newStudies.filter(study => {
            if (reward > 0 && study.reward && getFloatValueFromMoney(study.reward) < reward)
                return false;
            if (time > 0 && study.timeInMinutes && study.timeInMinutes < time)
                return false;
            if (rewardPerHour > 0 && study.rewardPerHour && getFloatValueFromMoney(study.rewardPerHour) < rewardPerHour)
                return false;
            if (study.title && nameBlacklist.some((name) => study.title.toLowerCase().includes(name)))
                return false;
            return !(study.researcher && researcherBlacklist.some((res) => study.researcher.toLowerCase().includes(res)));
        });
        savedStudies = shouldIgnoreOldStudies
            ? [...savedStudies, ...filteredStudies]
            : filteredStudies;
        if (savedStudies.length > numberOfStudiesToStore) {
            savedStudies = savedStudies.slice(-numberOfStudiesToStore);
        }
        yield browser.storage.local.set({ "currentStudies": savedStudies });
        const updatedSeenIds = getUpdatedSeenIds(seenIds, listedIds, filteredStudies);
        if (!haveSameIds(storedSeenIds !== null && storedSeenIds !== void 0 ? storedSeenIds : [], updatedSeenIds)) {
            yield browser.storage.local.set({ [SEEN_STUDY_IDS]: updatedSeenIds });
        }
        return filteredStudies;
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
    return new Set(previous ? listedIds.filter(id => !previous.has(id)) : []);
}
// Moves still-listed seen ids to the end (most recent) and adds the newly
// notified ones. Filtered-out studies are not added, so relaxing a filter
// still notifies them.
function getUpdatedSeenIds(seenIds, listedIds, notified) {
    const seen = new Set(seenIds);
    const recent = new Set([
        ...listedIds.filter(id => seen.has(id)),
        ...notified.map(study => study.id).filter((id) => id !== null),
    ]);
    return [...seenIds.filter(id => !recent.has(id)), ...recent].slice(-SEEN_STUDY_IDS_LIMIT);
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
    const target = element.querySelector(selector);
    return ((_a = target === null || target === void 0 ? void 0 : target.textContent) === null || _a === void 0 ? void 0 : _a.trim()) || null;
}
function parseTimeContent(value) {
    if (!value)
        return 0;
    let minutes = 0;
    const hourMatch = value.match(/(\d+)\s*h/);
    const minMatch = value.match(/(\d+)\s*m/);
    if (hourMatch)
        minutes += parseInt(hourMatch[1], 10) * 60;
    if (minMatch)
        minutes += parseInt(minMatch[1], 10);
    return minutes;
}
function getFloatValueFromMoney(value) {
    if (!value)
        return 0;
    const amount = parseFloat(value.replace(/[£$]/g, ''));
    return value.startsWith('$') ? amount * 0.8 : amount;
}
