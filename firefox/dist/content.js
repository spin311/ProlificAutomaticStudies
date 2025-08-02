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
let isObserverInitializing = false;
const NUMBER_OF_STUDIES_TO_STORE = 100;
const REWARD = "reward";
const REWARD_PER_HOUR = "rewardPerHour";
const TIME = 'time';
const NAME_BLACKLIST = "nameBlacklist";
const RESEARCHER_BLACKLIST = "researcherBlacklist";
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
            if (isProcessing)
                return;
            const hasChanges = mutations.some(m => m.addedNodes.length > 0 || m.removedNodes.length > 0);
            if (hasChanges)
                yield extractAndSendStudies(targetNode);
        }));
        globalObserver.observe(targetNode, { childList: true, subtree: true });
        yield extractAndSendStudies(targetNode);
        const storage = yield browser.storage.sync.get(["refreshRate"]);
        const refreshRate = storage["refreshRate"];
        if (refreshRate && refreshRate > 0) {
            const intervalMs = refreshRate * 1000;
            globalInterval = setInterval(() => __awaiter(this, void 0, void 0, function* () {
                const node = yield waitForElement(targetSelector);
                if (node && !isProcessing) {
                    yield extractAndSendStudies(node);
                }
            }), intervalMs);
        }
    });
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
        if (!studyElements.length)
            return [];
        const storageValues = yield browser.storage.sync.get([
            "trackIds", "studyHistoryLen",
            REWARD, REWARD_PER_HOUR, TIME,
            NAME_BLACKLIST, RESEARCHER_BLACKLIST
        ]);
        const localValues = yield browser.storage.local.get(["currentStudies"]);
        const shouldIgnoreOldStudies = (_a = storageValues["trackIds"]) !== null && _a !== void 0 ? _a : true;
        const numberOfStudiesToStore = (_b = storageValues["studyHistoryLen"]) !== null && _b !== void 0 ? _b : NUMBER_OF_STUDIES_TO_STORE;
        const reward = (_c = storageValues[REWARD]) !== null && _c !== void 0 ? _c : 0;
        const rewardPerHour = (_d = storageValues[REWARD_PER_HOUR]) !== null && _d !== void 0 ? _d : 0;
        const time = (_e = storageValues[TIME]) !== null && _e !== void 0 ? _e : 0;
        const nameBlacklist = (storageValues[NAME_BLACKLIST] || []).map((s) => s.toLowerCase());
        const researcherBlacklist = (storageValues[RESEARCHER_BLACKLIST] || []).map((s) => s.toLowerCase());
        let savedStudies = localValues["currentStudies"] || [];
        const existingIds = new Set(savedStudies.map(study => study.id));
        const newStudies = [];
        studyElements.forEach(el => {
            var _a, _b;
            const id = ((_a = el.getAttribute("data-testid")) === null || _a === void 0 ? void 0 : _a.split("-")[1]) || null;
            if (!id || existingIds.has(id))
                return;
            const title = getTextContent(el, '[data-testid="title"]');
            const researcherRaw = getTextContent(el, '[data-testid="host"]');
            const researcher = (researcherRaw === null || researcherRaw === void 0 ? void 0 : researcherRaw.split(" ").slice(1).join(" ")) || null;
            const reward = getTextContent(el, '[data-testid="study-tag-reward"]');
            const rewardPerHour = ((_b = getTextContent(el, '[data-testid="study-tag-reward-per-hour"]')) === null || _b === void 0 ? void 0 : _b.replace("/hr", "")) || null;
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
                createdAt: new Date().toISOString(),
            });
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
