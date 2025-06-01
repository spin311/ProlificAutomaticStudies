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
const targetSelector = 'section[class="available-studies-section"]';
const NUMBER_OF_IDS_TO_STORE = 50;
function waitForTarget() {
    return new Promise((resolve) => {
        let retries = 10;
        function checkTarget() {
            let timer = 1000;
            const target = document.querySelector(targetSelector);
            if (target || retries <= 0) {
                console.log("Prolific list element found." + target);
                resolve(target || null);
            }
            else {
                console.log("Prolific list element not found. Retries left: " + retries);
                retries--;
                timer += 100;
                setTimeout(checkTarget, timer);
            }
        }
        checkTarget();
    });
}
waitForTarget().then((targetNode) => __awaiter(void 0, void 0, void 0, function* () {
    if (!targetNode) {
        console.error("Prolific list element not found.");
        return;
    }
    const observer = new MutationObserver((mutationsList) => __awaiter(void 0, void 0, void 0, function* () {
        for (const mutations of mutationsList) {
            if (mutations.type === "childList") {
                const newStudies = yield extractStudies(targetNode);
                if (newStudies.length > 0) {
                    try {
                        chrome.runtime.sendMessage({
                            target: "background",
                            type: "new-studies",
                            data: newStudies,
                        });
                    }
                    catch (error) {
                        console.error("Error sending message to background:", error);
                    }
                    newStudies.forEach((study) => {
                        console.log("New study detected:", study);
                    });
                }
            }
        }
    }));
    const newStudies = yield extractStudies(targetNode);
    if (newStudies.length > 0) {
        try {
            chrome.runtime.sendMessage({
                target: "background",
                type: "new-studies",
                data: newStudies,
            });
        }
        catch (error) {
            console.error("Error sending message to background:", error);
        }
        newStudies.forEach((study) => {
            console.log("New study detected:", study);
        });
    }
    observer.observe(targetNode, { childList: true, subtree: true });
}));
function extractStudies(targetNode) {
    return __awaiter(this, void 0, void 0, function* () {
        const studies = [];
        const studyElements = targetNode.querySelectorAll("li[class='list-item']");
        if (!studyElements || studyElements.length === 0) {
            return studies;
        }
        console.log("Extracting studies" + studyElements);
        try {
            const studyIds = yield getValueFromStorageContentScript("studyIds", []);
            let studyIdsNew = studyIds;
            studyElements.forEach((study) => {
                var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
                const id = (_a = study.getAttribute("data-testid")) === null || _a === void 0 ? void 0 : _a.split("-")[1];
                if (!id || (studyIds && studyIds.includes(id)))
                    return;
                const title = ((_b = study.querySelector('[data-testid="title"]')) === null || _b === void 0 ? void 0 : _b.textContent) || null;
                const researcher = ((_d = (_c = study
                    .querySelector('[data-testid="host"]')) === null || _c === void 0 ? void 0 : _c.textContent) === null || _d === void 0 ? void 0 : _d.split(" ").slice(1).join(" ")) || null;
                const places = parseInt(((_f = (_e = study
                    .querySelector('[data-testid="study-tag-places"]')) === null || _e === void 0 ? void 0 : _e.textContent) === null || _f === void 0 ? void 0 : _f.split(" ")[0]) || "0");
                const reward = ((_g = study
                    .querySelector('[data-testid="study-tag-reward"]')) === null || _g === void 0 ? void 0 : _g.textContent) || null;
                const rewardPerHour = ((_j = (_h = study
                    .querySelector('[data-testid="study-tag-reward-per-hour"]')) === null || _h === void 0 ? void 0 : _h.textContent) === null || _j === void 0 ? void 0 : _j.replace("/hr", "")) || null;
                const time = ((_k = study.querySelector('[data-testid="study-tag-completion-time"]')) === null || _k === void 0 ? void 0 : _k.textContent) || null;
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
                studyIdsNew.push(id);
            });
            if (studyIdsNew.length > NUMBER_OF_IDS_TO_STORE) {
                studyIdsNew = studyIdsNew.slice(-NUMBER_OF_IDS_TO_STORE);
            }
            yield chrome.storage.sync.set({ ["studyIds"]: studyIdsNew });
        }
        catch (e) {
            console.error("Error extracting studies: " + e);
        }
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
