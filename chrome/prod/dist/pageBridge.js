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
// A second copy of the bridge would answer every request twice.
const bridgeWindow = window;
if (!bridgeWindow.__prolificStudiesNotifierBridge) {
    bridgeWindow.__prolificStudiesNotifierBridge = true;
    window.addEventListener(BRIDGE_REQUEST_EVENT, handleBridgeRequest);
}
