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
let isProcessing = false;
let isObserverInitializing = false;
const NUMBER_OF_STUDIES_TO_STORE = 100;
const REWARD = "reward";
const REWARD_PER_HOUR = "rewardPerHour";
const TIME = 'time';
const NAME_BLACKLIST = "nameBlacklist";
const RESEARCHER_BLACKLIST = "researcherBlacklist";
function waitForElement(selector) {
    return __awaiter(this, void 0, void 0, function* () {
        const useOld = yield getValueFromStorageContentScript("useOld", false);
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
            const target = document.querySelector(selector);
            if (target) {
                observer.disconnect();
                resolve(target);
            }
        });
    });
}
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
                globalObserver === null || globalObserver === void 0 ? void 0 : globalObserver.disconnect();
                globalObserver = null;
            }
            return Promise.resolve();
        default:
            return Promise.resolve();
    }
}
function isObserverActive() {
    return globalObserver !== null;
}
chrome.runtime.onMessage.addListener(handleContentMessages);
observeStudyChanges();
function observeStudyChanges() {
    if (isObserverActive() || isObserverInitializing)
        return;
    isObserverInitializing = true;
    waitForElement(targetSelector).then((targetNode) => __awaiter(this, void 0, void 0, function* () {
        isObserverInitializing = false;
        if (!targetNode || isObserverActive()) {
            return;
        }
        // Observe for dynamic content updates within the target element
        globalObserver = new MutationObserver((mutationsList) => __awaiter(this, void 0, void 0, function* () {
            if (isProcessing)
                return;
            let newChanges = false;
            for (const mutation of mutationsList) {
                if (mutation.addedNodes.length || mutation.removedNodes.length || mutation.type === "childList") {
                    newChanges = true;
                }
            }
            if (newChanges) {
                yield extractAndSendStudies(targetNode);
            }
        }));
        // Initial check if studies are already loaded
        yield extractAndSendStudies(targetNode);
        globalObserver.observe(targetNode, { childList: true, subtree: true });
    }));
}
function extractAndSendStudies(targetNode) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            if (isProcessing)
                return;
            isProcessing = true;
            const studies = yield extractStudies(targetNode);
            if (studies.length > 0) {
                chrome.runtime.sendMessage({
                    target: "background",
                    type: "new-studies",
                    data: studies,
                });
            }
            isProcessing = false;
        }
        finally {
            isProcessing = false;
        }
    });
}
function extractStudies(targetNode) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        function shouldIncludeStudy(study) {
            if (reward && study.reward && getFloatValueFromMoneyStringContent(study.reward) < reward) {
                return false;
            }
            if (time && study.timeInMinutes && study.timeInMinutes < time) {
                return false;
            }
            if (nameBlacklist.some((name) => { var _a; return (_a = study.title) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes(name); })) {
                return false;
            }
            if (researcherBlacklist.some((researcher) => { var _a; return (_a = study.researcher) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes(researcher); })) {
                return false;
            }
            return !(rewardPerHour && study.rewardPerHour && getFloatValueFromMoneyStringContent(study.rewardPerHour) < rewardPerHour);
        }
        function shouldFilterStudies() {
            return reward > 0 || rewardPerHour > 0 || time > 0 || nameBlacklist.length > 0 || researcherBlacklist.length > 0;
        }
        const studyElements = targetNode.querySelectorAll("li[class='list-item']");
        const storageValues = yield chrome.storage.sync.get([
            "trackIds",
            "studyHistoryLen",
            "currentStudies",
            REWARD,
            REWARD_PER_HOUR,
            TIME,
            NAME_BLACKLIST,
            RESEARCHER_BLACKLIST,
        ]);
        const shouldIgnoreOldStudies = (_a = storageValues["trackIds"]) !== null && _a !== void 0 ? _a : true;
        if (!studyElements || studyElements.length === 0) {
            if (!shouldIgnoreOldStudies) {
                yield chrome.storage.sync.set({ ["currentStudies"]: [] });
            }
            return [];
        }
        let studies = [];
        const numberOfStudiesToStore = (_b = storageValues["studyHistoryLen"]) !== null && _b !== void 0 ? _b : NUMBER_OF_STUDIES_TO_STORE;
        let savedStudies = (_c = storageValues["currentStudies"]) !== null && _c !== void 0 ? _c : [];
        const reward = (_d = storageValues[REWARD]) !== null && _d !== void 0 ? _d : 0;
        const rewardPerHour = (_e = storageValues[REWARD_PER_HOUR]) !== null && _e !== void 0 ? _e : 0;
        const time = (_f = storageValues[TIME]) !== null && _f !== void 0 ? _f : 0;
        const nameBlacklist = (_g = storageValues[NAME_BLACKLIST]) !== null && _g !== void 0 ? _g : [];
        const researcherBlacklist = (_h = storageValues[RESEARCHER_BLACKLIST]) !== null && _h !== void 0 ? _h : [];
        const studyIds = savedStudies.map((study) => study.id);
        studyElements.forEach((study) => {
            var _a, _b, _c;
            const id = (_a = study.getAttribute("data-testid")) === null || _a === void 0 ? void 0 : _a.split("-")[1];
            if (!id || (studyIds === null || studyIds === void 0 ? void 0 : studyIds.includes(id)))
                return;
            const title = getTextContent(study, '[data-testid="title"]');
            const researcher = ((_b = getTextContent(study, '[data-testid="host"]')) === null || _b === void 0 ? void 0 : _b.split(" ").slice(1).join(" ")) || null;
            const reward = getTextContent(study, '[data-testid="study-tag-reward"]');
            const rewardPerHour = ((_c = getTextContent(study, '[data-testid="study-tag-reward-per-hour"]')) === null || _c === void 0 ? void 0 : _c.replace("/hr", "")) || null;
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
                limitedCapacity: false,
                createdAt: new Date().toISOString(),
            });
        });
        if (shouldFilterStudies()) {
            studies = studies.filter((study) => {
                return shouldIncludeStudy(study);
            });
        }
        if (shouldIgnoreOldStudies) {
            savedStudies = [...savedStudies, ...studies];
        }
        if (savedStudies.length > numberOfStudiesToStore) {
            savedStudies = savedStudies.slice(-numberOfStudiesToStore);
        }
        yield chrome.storage.sync.set({ "currentStudies": savedStudies });
        return studies;
    });
}
function getValueFromStorageContentScript(key, defaultValue) {
    return new Promise((resolve) => {
        chrome.storage.sync.get(key, function (result) {
            resolve((result[key] !== undefined) ? result[key] : defaultValue);
        });
    });
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
