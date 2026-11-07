"use strict";
// Runs in the Prolific page's own JavaScript world (manifest "world": "MAIN"), so
// it can ask the Studies page to re-fetch its study list with the page's own code.
// The request is exactly the one the page makes every 2 minutes; the extension
// never reads the login token. Talks to fastMode.ts through window events whose
// payloads are strings, the only kind that crosses between the two worlds.
// Any script on the page can send the request event, so the bridge enforces its
// own minimum gap and runs one refresh at a time, whatever asks it.
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const BRIDGE_REQUEST_EVENT = "psn:refresh-request";
const BRIDGE_RESULT_EVENT = "psn:refresh-result";
const BRIDGE_STUDIES_STORE_ID = "participant/studies";
const BRIDGE_RATE_LIMITED_ROUTE = "error.participant-studies-rate-limited";
// Prolific stops its own refreshing while any of these is active.
const BRIDGE_RESTRICTION_FLAGS = [
    "activeStudyAccessRestriction",
    "activeBotDetectionRestriction",
    "activeSpeedingRestriction",
    "activeLowAuthRestriction",
];
const BRIDGE_MIN_MS_BETWEEN_REFRESHES = 25 * 1000;
let bridgeLastRefreshAt = 0;
let isBridgeRefreshing = false;
function getProlificGlobals() {
    var _a, _b;
    const root = document.getElementById("app");
    return (_b = (_a = root === null || root === void 0 ? void 0 : root.__vue_app__) === null || _a === void 0 ? void 0 : _a.config) === null || _b === void 0 ? void 0 : _b.globalProperties;
}
function refreshStudiesThroughPage() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        const globals = getProlificGlobals();
        const stores = (_a = globals === null || globals === void 0 ? void 0 : globals.$pinia) === null || _a === void 0 ? void 0 : _a._s;
        const studiesStore = stores === null || stores === void 0 ? void 0 : stores.get(BRIDGE_STUDIES_STORE_ID);
        if (!stores || typeof (studiesStore === null || studiesStore === void 0 ? void 0 : studiesStore.fetchList) !== "function")
            return "unavailable";
        const isRestricted = Array.from(stores.values())
            .some((store) => BRIDGE_RESTRICTION_FLAGS.some((flag) => Boolean(store[flag])));
        if (isRestricted)
            return "restricted";
        const now = Date.now();
        if (isBridgeRefreshing || now - bridgeLastRefreshAt < BRIDGE_MIN_MS_BETWEEN_REFRESHES)
            return "throttled";
        isBridgeRefreshing = true;
        bridgeLastRefreshAt = now;
        try {
            yield studiesStore.fetchList({ automatic: true });
        }
        catch (_e) {
            return "error";
        }
        finally {
            isBridgeRefreshing = false;
        }
        // On HTTP 429 Prolific's fetchList awaits navigation to its rate-limit page
        // before resolving, so the route has already changed here.
        return ((_d = (_c = (_b = globals === null || globals === void 0 ? void 0 : globals.$router) === null || _b === void 0 ? void 0 : _b.currentRoute) === null || _c === void 0 ? void 0 : _c.value) === null || _d === void 0 ? void 0 : _d.name) === BRIDGE_RATE_LIMITED_ROUTE ? "rate-limited" : "ok";
    });
}
function handleBridgeRequest(event) {
    const requestId = event.detail;
    if (typeof requestId !== "string")
        return;
    refreshStudiesThroughPage()
        .catch(() => "error")
        .then((status) => {
        window.dispatchEvent(new CustomEvent(BRIDGE_RESULT_EVENT, {
            detail: JSON.stringify({ id: requestId, status }),
        }));
    });
}
// ---------- Project studies ----------
// Prolific's Studies list leaves out studies that belong to a researcher's project
// (they sit in a Projects tab), so the content script never sees them in the page.
// Read them from the page's own store instead, picking only the fields it needs.
const BRIDGE_PROJECT_STUDIES_REQUEST_EVENT = "psn:project-studies-request";
const BRIDGE_PROJECT_STUDIES_RESULT_EVENT = "psn:project-studies-result";
// The opposite of the rule Prolific's store uses for its Studies list
// (displayedStudiesForDashboard: no project, or an official Prolific study).
function isBridgeHiddenProjectStudy(study) {
    return Boolean(study.project) && !study.is_official_prolific_study;
}
function pickBridgeMoney(money) {
    return money ? { amount: money.amount, currency: money.currency } : null;
}
function toBridgeProjectStudy(study) {
    var _a, _b, _c, _d, _e, _f;
    const averagePerHour = study.study_average_reward_per_hour;
    return {
        id: study.id,
        name: study.name,
        // The name Prolific's card shows under the title.
        host: ((_b = (_a = study.publisher) === null || _a === void 0 ? void 0 : _a.institution) === null || _b === void 0 ? void 0 : _b.name) || ((_c = study.publisher) === null || _c === void 0 ? void 0 : _c.name)
            || ((_e = (_d = study.researcher) === null || _d === void 0 ? void 0 : _d.institution) === null || _e === void 0 ? void 0 : _e.name) || ((_f = study.researcher) === null || _f === void 0 ? void 0 : _f.name),
        reward: pickBridgeMoney(study.study_reward),
        // Like Prolific's card: the average rate once there is one, else the estimate.
        rewardPerHour: pickBridgeMoney((averagePerHour === null || averagePerHour === void 0 ? void 0 : averagePerHour.amount) ? averagePerHour : study.study_estimated_reward_per_hour),
        completionMinutes: study.estimated_completion_time,
        totalPlaces: study.total_available_places,
        placesTaken: study.places_taken,
    };
}
function readBridgeProjectStudies() {
    var _a, _b, _c;
    const studiesStore = (_c = (_b = (_a = getProlificGlobals()) === null || _a === void 0 ? void 0 : _a.$pinia) === null || _b === void 0 ? void 0 : _b._s) === null || _c === void 0 ? void 0 : _c.get(BRIDGE_STUDIES_STORE_ID);
    const list = studiesStore === null || studiesStore === void 0 ? void 0 : studiesStore.displayStudiesList;
    if (!list || typeof list.length !== "number")
        return [];
    const studies = [];
    // Plain indexed reads work the same on Vue's proxies and on Firefox's wrappers.
    for (let i = 0; i < list.length; i++) {
        const study = list[i];
        if (study && isBridgeHiddenProjectStudy(study))
            studies.push(toBridgeProjectStudy(study));
    }
    return studies;
}
// Answers synchronously, so the content script has the list as soon as its
// dispatchEvent call returns.
function handleBridgeProjectStudiesRequest() {
    let studies = [];
    try {
        studies = readBridgeProjectStudies();
    }
    catch (_a) {
        studies = [];
    }
    window.dispatchEvent(new CustomEvent(BRIDGE_PROJECT_STUDIES_RESULT_EVENT, { detail: JSON.stringify(studies) }));
}
// A second copy of the bridge would answer every request twice.
const bridgeWindow = window;
if (!bridgeWindow.__prolificStudiesNotifierBridge) {
    bridgeWindow.__prolificStudiesNotifierBridge = true;
    window.addEventListener(BRIDGE_REQUEST_EVENT, handleBridgeRequest);
    window.addEventListener(BRIDGE_PROJECT_STUDIES_REQUEST_EVENT, handleBridgeProjectStudiesRequest);
}
