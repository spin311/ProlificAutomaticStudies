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
            // Check immediately if element exists
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
                globalObserver === null || globalObserver === void 0 ? void 0 : globalObserver.disconnect();
                globalObserver = null;
            }
            break;
    }
}
browser.runtime.onMessage.addListener(handleContentMessages);
observeStudyChanges();
function observeStudyChanges() {
    if (globalObserver || isObserverInitializing)
        return;
    isObserverInitializing = true;
    waitForElement(targetSelector).then((targetNode) => __awaiter(this, void 0, void 0, function* () {
        isObserverInitializing = false;
        if (!targetNode || globalObserver)
            return;
        // Create observer for dynamic content
        globalObserver = new MutationObserver((mutations) => __awaiter(this, void 0, void 0, function* () {
            if (isProcessing)
                return;
            const hasChanges = mutations.some(mutation => mutation.addedNodes.length || mutation.removedNodes.length);
            if (hasChanges)
                yield extractAndSendStudies(targetNode);
        }));
        // Initial extraction
        yield extractAndSendStudies(targetNode);
        globalObserver.observe(targetNode, { childList: true, subtree: true });
    }));
}
function extractAndSendStudies(targetNode) {
    return __awaiter(this, void 0, void 0, function* () {
        if (isProcessing)
            return;
        isProcessing = true;
        try {
            const studies = yield extractStudies(targetNode);
            if (studies.length > 0) {
                yield browser.runtime.sendMessage({
                    target: "background",
                    type: "new-studies",
                    data: studies,
                });
            }
        }
        catch (error) {
            console.error("Error extracting studies:", error);
        }
        finally {
            isProcessing = false;
        }
    });
}
function extractStudies(targetNode) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e;
        const studyElements = targetNode.querySelectorAll("li[class='list-item']");
        if (!studyElements || studyElements.length === 0)
            return [];
        // Get all storage values in one call
        const storageValues = yield browser.storage.sync.get([
            "trackIds", "studyHistoryLen", "currentStudies",
            REWARD, REWARD_PER_HOUR, TIME,
            NAME_BLACKLIST, RESEARCHER_BLACKLIST
        ]);
        const shouldIgnoreOldStudies = (_a = storageValues["trackIds"]) !== null && _a !== void 0 ? _a : true;
        const numberOfStudiesToStore = (_b = storageValues["studyHistoryLen"]) !== null && _b !== void 0 ? _b : NUMBER_OF_STUDIES_TO_STORE;
        const reward = (_c = storageValues[REWARD]) !== null && _c !== void 0 ? _c : 0;
        const rewardPerHour = (_d = storageValues[REWARD_PER_HOUR]) !== null && _d !== void 0 ? _d : 0;
        const time = (_e = storageValues[TIME]) !== null && _e !== void 0 ? _e : 0;
        const nameBlacklist = (storageValues[NAME_BLACKLIST] || []).map((s) => s.toLowerCase());
        const researcherBlacklist = (storageValues[RESEARCHER_BLACKLIST] || []).map((s) => s.toLowerCase());
        let savedStudies = storageValues["currentStudies"] || [];
        const existingIds = new Set(savedStudies.map(study => study.id));
        const newStudies = [];
        studyElements.forEach(studyElement => {
            var _a, _b;
            const id = ((_a = studyElement.getAttribute("data-testid")) === null || _a === void 0 ? void 0 : _a.split("-")[1]) || null;
            if (!id || existingIds.has(id))
                return;
            const title = getTextContent(studyElement, '[data-testid="title"]');
            const researcherRaw = getTextContent(studyElement, '[data-testid="host"]');
            const researcher = (researcherRaw === null || researcherRaw === void 0 ? void 0 : researcherRaw.split(" ").slice(1).join(" ")) || null;
            const reward = getTextContent(studyElement, '[data-testid="study-tag-reward"]');
            const rewardPerHour = ((_b = getTextContent(studyElement, '[data-testid="study-tag-reward-per-hour"]')) === null || _b === void 0 ? void 0 : _b.replace("/hr", "")) || null;
            const time = getTextContent(studyElement, '[data-testid="study-tag-completion-time"]');
            const timeInMinutes = parseTimeContent(time);
            newStudies.push({
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
        // Apply filters
        const filteredStudies = newStudies.filter(study => {
            if (reward > 0 && study.reward && getFloatValueFromMoney(study.reward) < reward)
                return false;
            if (time > 0 && study.timeInMinutes && study.timeInMinutes < time)
                return false;
            if (rewardPerHour > 0 && study.rewardPerHour && getFloatValueFromMoney(study.rewardPerHour) < rewardPerHour)
                return false;
            if (study.title && nameBlacklist.some(name => study.title.toLowerCase().includes(name)))
                return false;
            return !(study.researcher && researcherBlacklist.some(res => study.researcher.toLowerCase().includes(res)));
        });
        // Update saved studies
        if (shouldIgnoreOldStudies) {
            savedStudies = [...savedStudies, ...filteredStudies];
            if (savedStudies.length > numberOfStudiesToStore) {
                savedStudies = savedStudies.slice(-numberOfStudiesToStore);
            }
            yield browser.storage.sync.set({ "currentStudies": savedStudies });
        }
        return filteredStudies;
    });
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
