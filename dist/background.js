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
var Reason = chrome.offscreen.Reason;
var ContextType = chrome.runtime.ContextType;
const AUDIO_ACTIVE = "audioActive";
const SHOW_NOTIFICATION = "showNotification";
const OPEN_PROLIFIC = "openProlific";
const AUDIO = "audio";
const VOLUME = "volume";
const COUNTER = "counter";
const ICON_URL = "imgs/logo.png";
const TITLE = "Prolific Automatic Studies";
const MESSAGE = "A new study has been posted on Prolific!";
let creating = null; // A global promise to avoid concurrency issues
chrome.runtime.onInstalled.addListener((_a) => __awaiter(void 0, [_a], void 0, function* ({ reason }) {
    if (reason === "install") {
        yield setInitialValues();
        yield chrome.tabs.create({
            url: "https://spin311.github.io/ProlificAutomaticStudies/",
            active: true,
        });
    }
}));
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => __awaiter(void 0, void 0, void 0, function* () {
    var _b;
    if (((_b = tab.url) === null || _b === void 0 ? void 0 : _b.includes("https://app.prolific.com")) &&
        changeInfo.status === "complete") {
        try {
            yield initializeProlificObserver(tabId);
        }
        catch (error) {
            console.error("Error initializing observer:", error);
        }
    }
}));
function initializeProlificObserver(tabId) {
    return __awaiter(this, void 0, void 0, function* () {
        yield chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
                return new Promise((resolve) => {
                    if (document.readyState === "complete") {
                        resolve();
                    }
                    else {
                        document.addEventListener("DOMContentLoaded", () => resolve(), { once: true });
                    }
                });
            },
        });
        yield chrome.scripting.executeScript({
            target: { tabId },
            func: observeProlificList,
        });
    });
}
function observeProlificList() {
    const targetSelector = 'ul[class="list"]';
    function waitForTarget() {
        return new Promise((resolve) => {
            let retries = 10;
            function checkTarget() {
                const target = document.querySelector(targetSelector);
                if (target || retries <= 0) {
                    resolve(target || null);
                }
                else {
                    retries--;
                    setTimeout(checkTarget, 500);
                }
            }
            checkTarget();
        });
    }
    waitForTarget().then((targetNode) => {
        if (!targetNode) {
            console.error("Prolific list element not found.");
            return;
        }
        const observer = new MutationObserver(() => {
            const newStudies = extractStudies(targetNode);
            newStudies.forEach((study) => {
                console.log("New study detected:", study);
            });
        });
        observer.observe(targetNode, { childList: true, subtree: true });
    });
    function extractStudies(targetNode) {
        const studies = [];
        const studyElements = targetNode.querySelectorAll("li[class='list-item']");
        studyElements.forEach((study) => {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
            const id = (_a = study.getAttribute("data-testid")) === null || _a === void 0 ? void 0 : _a.split("-")[1];
            const title = ((_b = study.querySelector('[data-testid="title"]')) === null || _b === void 0 ? void 0 : _b.textContent) || null;
            const researcher = ((_d = (_c = study
                .querySelector('[data-testid="host"]')) === null || _c === void 0 ? void 0 : _c.textContent) === null || _d === void 0 ? void 0 : _d.split(" ").slice(1).join(" ")) || null;
            const places = parseInt(((_f = (_e = study
                .querySelector('[data-testid="study-tag-places"]')) === null || _e === void 0 ? void 0 : _e.textContent) === null || _f === void 0 ? void 0 : _f.split(" ")[0]) || "0");
            const reward = ((_g = study
                .querySelector('[data-testid="study-tag-reward"]')) === null || _g === void 0 ? void 0 : _g.textContent) || null;
            const rewardPerHour = ((_j = (_h = study
                .querySelector('[data-testid="study-tag-reward-per-hour"]')) === null || _h === void 0 ? void 0 : _h.textContent) === null || _j === void 0 ? void 0 : _j.replace("/hr", "")) || null;
            const time = parseTime(((_k = study.querySelector('[data-testid="study-tag-completion-time"]')) === null || _k === void 0 ? void 0 : _k.textContent) || null);
            if (id) {
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
            }
        });
        return studies;
    }
    function parseTime(timeText) {
        if (!timeText)
            return null;
        const timeParts = timeText.match(/(\d+)\s*h\s*(\d+)?\s*mins?/);
        if (timeParts) {
            const hours = parseInt(timeParts[1]) || 0;
            const minutes = parseInt(timeParts[2]) || 0;
            return hours * 60 + minutes;
        }
        const minutesOnly = timeText.match(/(\d+)\s*mins?/);
        return minutesOnly ? parseInt(minutesOnly[1]) : null;
    }
}
function notifyNewStudy(study) {
    chrome.notifications.create({
        type: "basic",
        iconUrl: chrome.runtime.getURL(ICON_URL),
        title: TITLE,
        message: `${study.title} by ${study.researcher}`,
        buttons: [{ title: "Open Prolific" }, { title: "Dismiss" }],
    });
    chrome.notifications.onClicked.addListener(() => {
        chrome.tabs.create({ url: "https://app.prolific.com/", active: true });
    });
}
function setInitialValues() {
    return __awaiter(this, void 0, void 0, function* () {
        yield chrome.storage.sync.set({
            [AUDIO_ACTIVE]: true,
            [AUDIO]: "alert1.mp3",
            [SHOW_NOTIFICATION]: true,
            [VOLUME]: 100,
        });
    });
}
