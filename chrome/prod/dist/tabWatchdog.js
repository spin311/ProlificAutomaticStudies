"use strict";
// Keeps the Prolific tab able to notify. Both problems below are silent: the tab
// looks normal, but the study list stops changing, so no study is ever detected.
// - Chrome may unload (discard) a background tab; the background script is asked
//   to exempt this tab.
// - Prolific's Studies page re-fetches studies every 2 minutes, but stops for good
//   after an expired login or certain errors. If no re-fetch happens for a while,
//   the page is reloaded, only while the user is not on the tab and at most once
//   per 15 minutes across all tabs.
// - After the extension updates, this copy of the script is cut off from the
//   extension; it reloads its Studies tab once so the new version takes over.
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const WATCHDOG_STUDIES_LIST_SELECTOR = 'div[data-testid="studies-list"]';
// The list request, not single-study requests like /participant/studies/<id>/.
const WATCHDOG_STUDIES_FETCH_PATTERN = /\/api\/v1\/participant\/studies\/(\?|$)/;
const WATCHDOG_CHECK_INTERVAL_MS = 60 * 1000;
// Three missed 2-minute refreshes.
const WATCHDOG_STALE_AFTER_MS = 6 * 60 * 1000;
const WATCHDOG_MIN_MS_BETWEEN_RELOADS = 15 * 60 * 1000;
const WATCHDOG_LAST_RELOAD_AT = "watchdogLastReloadAt";
let watchdogLastStudiesFetchAt = null;
function watchForStudiesFetches() {
    const observer = new PerformanceObserver((list) => {
        const hasStudiesFetch = list.getEntries().some((entry) => WATCHDOG_STUDIES_FETCH_PATTERN.test(entry.name));
        if (hasStudiesFetch) {
            watchdogLastStudiesFetchAt = Date.now();
        }
    });
    observer.observe({ type: "resource", buffered: true });
}
function isUnwatchedStudiesList() {
    return document.querySelector(WATCHDOG_STUDIES_LIST_SELECTOR) !== null && !document.hasFocus();
}
function isStudiesPageStale(now) {
    // Never seen a refresh: this page may not poll at all, so don't guess.
    if (watchdogLastStudiesFetchAt === null)
        return false;
    return isUnwatchedStudiesList() && now - watchdogLastStudiesFetchAt >= WATCHDOG_STALE_AFTER_MS;
}
function isExtensionConnected() {
    var _a;
    try {
        return Boolean((_a = chrome.runtime) === null || _a === void 0 ? void 0 : _a.id);
    }
    catch (_b) {
        return false;
    }
}
function reloadIfStudiesPageStale() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const now = Date.now();
        if (!isStudiesPageStale(now))
            return;
        const stored = yield chrome.storage.local.get(WATCHDOG_LAST_RELOAD_AT);
        const lastReloadAt = (_a = stored[WATCHDOG_LAST_RELOAD_AT]) !== null && _a !== void 0 ? _a : 0;
        if (now - lastReloadAt < WATCHDOG_MIN_MS_BETWEEN_RELOADS)
            return;
        yield chrome.storage.local.set({ [WATCHDOG_LAST_RELOAD_AT]: now });
        location.reload();
    });
}
function checkProlificTab() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!isExtensionConnected()) {
            if (isUnwatchedStudiesList())
                location.reload();
            return;
        }
        yield reloadIfStudiesPageStale();
    });
}
function keepProlificTabLoaded() {
    chrome.runtime.sendMessage({ target: "background", type: "keep-tab-alive" })
        .catch((error) => console.warn("Prolific Studies Notifier: could not keep the tab loaded", error));
}
keepProlificTabLoaded();
watchForStudiesFetches();
setInterval(() => {
    checkProlificTab()
        .catch((error) => console.error("Prolific Studies Notifier: watchdog check failed", error));
}, WATCHDOG_CHECK_INTERVAL_MS);
