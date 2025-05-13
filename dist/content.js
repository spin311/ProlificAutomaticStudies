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
let isProcessing = false; // A global promise to avoid concurrency issues
let isObserverInitializing = false;
const NUMBER_OF_STUDIES_TO_STORE = 50;
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
    console.log(message);
    if (message.target !== "content" && message.target !== 'everything') {
        return Promise.resolve();
    }
    switch (message.type) {
        case "change-alert-type":
            if (message.data === "website") {
                console.log("Changing to website observer");
                observeStudyChanges();
            }
            else {
                console.log("Disconnecting observer");
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
            console.log("targetNode not found or observer already exists");
            return;
        }
        console.log("observer created");
        // Observe for dynamic content updates within the target element
        globalObserver = new MutationObserver((mutationsList) => __awaiter(this, void 0, void 0, function* () {
            if (isProcessing)
                return;
            for (const mutation of mutationsList) {
                if (mutation.type === "childList") {
                    yield extractAndSendStudies(targetNode);
                }
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
            console.log(`Extracting studies at time ${new Date().toLocaleTimeString()}`);
            const studies = yield extractStudies(targetNode);
            if (studies.length > 0) {
                console.log(`Extracting studies from ${studies.length} studies`);
                console.log(studies);
                chrome.runtime.sendMessage({
                    target: "background",
                    type: "new-studies",
                    data: studies,
                });
            }
            else {
                console.log("No new studies found");
            }
            isProcessing = false;
        }
        catch (e) {
            console.error(e);
            isProcessing = false;
        }
    });
}
function extractStudies(targetNode) {
    return __awaiter(this, void 0, void 0, function* () {
        const studyElements = targetNode.querySelectorAll("li[class='list-item']");
        const shouldIgnoreOldStudies = yield getValueFromStorageContentScript("trackIds", false);
        if (!studyElements || studyElements.length === 0) {
            if (!shouldIgnoreOldStudies) {
                yield chrome.storage.sync.set({ ["currentStudies"]: [] });
            }
            return [];
        }
        const studies = [];
        const numberOfStudiesToStore = yield getValueFromStorageContentScript("studyHistoryLen", NUMBER_OF_STUDIES_TO_STORE);
        let savedStudies = yield getValueFromStorageContentScript("currentStudies", []);
        const studyIds = savedStudies.map((study) => study.id);
        studyElements.forEach((study) => {
            var _a, _b, _c, _d;
            const id = (_a = study.getAttribute("data-testid")) === null || _a === void 0 ? void 0 : _a.split("-")[1];
            if (!id || (studyIds === null || studyIds === void 0 ? void 0 : studyIds.includes(id)))
                return;
            const title = getTextContent(study, '[data-testid="title"]');
            const researcher = ((_b = getTextContent(study, '[data-testid="host"]')) === null || _b === void 0 ? void 0 : _b.split(" ").slice(1).join(" ")) || null;
            const places = parseInt(((_c = getTextContent(study, '[data-testid="study-tag-places"]')) === null || _c === void 0 ? void 0 : _c.split(" ")[0]) || "0");
            const reward = getTextContent(study, '[data-testid="study-tag-reward"]');
            const rewardPerHour = ((_d = getTextContent(study, '[data-testid="study-tag-reward-per-hour"]')) === null || _d === void 0 ? void 0 : _d.replace("/hr", "")) || null;
            const time = getTextContent(study, '[data-testid="study-tag-completion-time"]');
            studies.push({
                id,
                title,
                researcher,
                places,
                reward,
                rewardPerHour,
                time,
                limitedCapacity: false,
            });
        });
        if (shouldIgnoreOldStudies) {
            savedStudies.concat(studies);
        }
        if (savedStudies.length > numberOfStudiesToStore) {
            savedStudies = savedStudies.slice(-numberOfStudiesToStore);
        }
        yield chrome.storage.sync.set({ ["currentStudies"]: savedStudies });
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
