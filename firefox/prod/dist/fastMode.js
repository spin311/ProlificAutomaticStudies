"use strict";
// Opt-in "fast mode": asks Prolific's Studies page to re-check for studies more
// often than its built-in 2 minutes. The page does the request with its own code
// (see pageBridge.ts), so the extension never handles the login token. New
// studies then appear in the list and are detected as usual by content.ts.
//
// Unofficial use of Prolific, so it is off by default and guarded:
// - at least 30 seconds between checks, with ±25 % random variation;
// - one check at a time across all Prolific tabs (a Web Lock guards the claim);
// - backoff and pauses are shared by all tabs and survive reloads;
// - only while the Studies list is open and in "Website" alert mode;
// - longer waits after failures, and long pauses (with a notification) when
//   Prolific restricts or rate-limits the account.
// The settings live in storage.local, so turning it on affects only this device.
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const FAST_MODE = "fastMode";
const FAST_MODE_INTERVAL = "fastModeInterval";
const FAST_MODE_NEXT_ALLOWED_AT = "fastModeNextAllowedAt";
const FAST_MODE_FAILURES = "fastModeFailures";
const FAST_MODE_PAUSED_UNTIL = "fastModePausedUntil";
const FAST_MODE_LOCK = "prolific-studies-notifier-fast-mode";
const FAST_MODE_STUDIES_LIST_SELECTOR = 'div[data-testid="studies-list"]';
const FAST_MODE_REQUEST_EVENT = "psn:refresh-request";
const FAST_MODE_RESULT_EVENT = "psn:refresh-result";
const FAST_MODE_DEFAULT_INTERVAL_SEC = 60;
const FAST_MODE_MIN_INTERVAL_SEC = 30;
const FAST_MODE_MAX_INTERVAL_SEC = 600;
const FAST_MODE_JITTER = 0.25;
// After a check, no tab may check again within this share of the interval.
const FAST_MODE_SHARED_GAP = 0.75;
const FAST_MODE_MAX_BACKOFF_MS = 15 * 60 * 1000;
const FAST_MODE_RESTRICTED_PAUSE_MS = 30 * 60 * 1000;
const FAST_MODE_RATE_LIMITED_PAUSE_MS = 60 * 60 * 1000;
const FAST_MODE_REQUEST_TIMEOUT_MS = 20 * 1000;
const FAST_MODE_STATUSES = ["ok", "throttled", "unavailable", "restricted", "rate-limited", "error", "timeout"];
let fastModeTimer = null;
let fastModeRequestCount = 0;
function getFastModeIntervalMs() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const [local, sync] = yield Promise.all([
            browser.storage.local.get([FAST_MODE, FAST_MODE_INTERVAL]),
            browser.storage.sync.get("useOld"),
        ]);
        if (local[FAST_MODE] !== true || sync["useOld"] === true)
            return null;
        const seconds = Number((_a = local[FAST_MODE_INTERVAL]) !== null && _a !== void 0 ? _a : FAST_MODE_DEFAULT_INTERVAL_SEC);
        const validSeconds = Number.isFinite(seconds) ? seconds : FAST_MODE_DEFAULT_INTERVAL_SEC;
        return Math.min(Math.max(validSeconds, FAST_MODE_MIN_INTERVAL_SEC), FAST_MODE_MAX_INTERVAL_SEC) * 1000;
    });
}
function withJitter(ms) {
    const factor = 1 - FAST_MODE_JITTER + Math.random() * 2 * FAST_MODE_JITTER;
    return Math.max(FAST_MODE_MIN_INTERVAL_SEC * 1000, Math.round(ms * factor));
}
function stopFastMode() {
    if (fastModeTimer !== null) {
        clearTimeout(fastModeTimer);
        fastModeTimer = null;
    }
}
function scheduleFastMode(delayMs) {
    stopFastMode();
    fastModeTimer = setTimeout(() => {
        fastModeTimer = null;
        runFastModeCheck()
            .catch((error) => console.error("Prolific Studies Notifier: fast mode check failed", error));
    }, delayMs);
}
function startFastMode() {
    return __awaiter(this, void 0, void 0, function* () {
        const intervalMs = yield getFastModeIntervalMs();
        if (intervalMs === null) {
            stopFastMode();
            return;
        }
        scheduleFastMode(withJitter(intervalMs));
    });
}
// Claims the next check for this tab, or reports when the next one is allowed.
// Runs under a Web Lock shared by all Prolific tabs, so tabs whose timers fire
// together (e.g. after the computer wakes up) cannot both claim it.
function claimFastModeCheck(intervalMs) {
    return __awaiter(this, void 0, void 0, function* () {
        const claim = () => __awaiter(this, void 0, void 0, function* () {
            var _a;
            const now = Date.now();
            const stored = yield browser.storage.local.get(FAST_MODE_NEXT_ALLOWED_AT);
            const nextAllowedAt = (_a = stored[FAST_MODE_NEXT_ALLOWED_AT]) !== null && _a !== void 0 ? _a : 0;
            if (now < nextAllowedAt)
                return { claimed: false, nextAllowedAt };
            const reservedUntil = now + intervalMs * FAST_MODE_SHARED_GAP;
            yield browser.storage.local.set({ [FAST_MODE_NEXT_ALLOWED_AT]: reservedUntil });
            return { claimed: true, nextAllowedAt: reservedUntil };
        });
        return "locks" in navigator ? navigator.locks.request(FAST_MODE_LOCK, claim) : claim();
    });
}
function runFastModeCheck() {
    return __awaiter(this, void 0, void 0, function* () {
        const intervalMs = yield getFastModeIntervalMs();
        if (intervalMs === null)
            return;
        if (document.querySelector(FAST_MODE_STUDIES_LIST_SELECTOR) === null) {
            scheduleFastMode(withJitter(intervalMs));
            return;
        }
        const { claimed, nextAllowedAt } = yield claimFastModeCheck(intervalMs);
        if (!claimed) {
            scheduleFastMode(Math.max(withJitter(intervalMs), nextAllowedAt - Date.now()));
            return;
        }
        const status = yield requestPageRefresh();
        scheduleFastMode(yield recordRefreshStatus(status, intervalMs));
    });
}
// Stores the outcome where every Prolific tab sees it; returns this tab's next delay.
function recordRefreshStatus(status, intervalMs) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const now = Date.now();
        if (status === "ok" || status === "throttled") {
            if (status === "ok")
                yield resetFastModeFailures();
            return withJitter(intervalMs);
        }
        if (status === "restricted" || status === "rate-limited") {
            const pauseMs = status === "restricted" ? FAST_MODE_RESTRICTED_PAUSE_MS : FAST_MODE_RATE_LIMITED_PAUSE_MS;
            yield browser.storage.local.set({
                [FAST_MODE_NEXT_ALLOWED_AT]: now + pauseMs,
                [FAST_MODE_PAUSED_UNTIL]: now + pauseMs,
            });
            browser.runtime.sendMessage({
                target: "background",
                type: "fast-mode-paused",
                data: { reason: status, minutes: pauseMs / 60000 },
            }).catch((error) => console.warn("Prolific Studies Notifier: could not report the fast mode pause", error));
            return pauseMs;
        }
        const stored = yield browser.storage.local.get(FAST_MODE_FAILURES);
        const failures = ((_a = stored[FAST_MODE_FAILURES]) !== null && _a !== void 0 ? _a : 0) + 1;
        const backoffMs = withJitter(Math.min(intervalMs * 2 ** failures, FAST_MODE_MAX_BACKOFF_MS));
        yield browser.storage.local.set({ [FAST_MODE_FAILURES]: failures, [FAST_MODE_NEXT_ALLOWED_AT]: now + backoffMs });
        return backoffMs;
    });
}
function resetFastModeFailures() {
    return __awaiter(this, void 0, void 0, function* () {
        const stored = yield browser.storage.local.get(FAST_MODE_FAILURES);
        if (stored[FAST_MODE_FAILURES]) {
            yield browser.storage.local.set({ [FAST_MODE_FAILURES]: 0 });
        }
    });
}
function parseRefreshResult(detail) {
    var _a;
    if (typeof detail !== "string")
        return null;
    try {
        const parsed = JSON.parse(detail);
        if (typeof (parsed === null || parsed === void 0 ? void 0 : parsed.id) !== "string")
            return null;
        const status = (_a = FAST_MODE_STATUSES.find((known) => known === parsed.status)) !== null && _a !== void 0 ? _a : "error";
        return { id: parsed.id, status };
    }
    catch (_b) {
        return null;
    }
}
function requestPageRefresh() {
    fastModeRequestCount += 1;
    const requestId = `${Date.now()}-${fastModeRequestCount}`;
    return new Promise((resolve) => {
        const finish = (status) => {
            clearTimeout(timeout);
            window.removeEventListener(FAST_MODE_RESULT_EVENT, onResult);
            resolve(status);
        };
        const onResult = (event) => {
            const result = parseRefreshResult(event.detail);
            if ((result === null || result === void 0 ? void 0 : result.id) === requestId)
                finish(result.status);
        };
        const timeout = setTimeout(() => finish("timeout"), FAST_MODE_REQUEST_TIMEOUT_MS);
        window.addEventListener(FAST_MODE_RESULT_EVENT, onResult);
        window.dispatchEvent(new CustomEvent(FAST_MODE_REQUEST_EVENT, { detail: requestId }));
    });
}
browser.storage.onChanged.addListener((changes, areaName) => {
    const isFastModeSetting = (areaName === "local" && (FAST_MODE in changes || FAST_MODE_INTERVAL in changes))
        || (areaName === "sync" && "useOld" in changes);
    if (isFastModeSetting) {
        startFastMode().catch((error) => console.error("Prolific Studies Notifier: could not start fast mode", error));
    }
});
startFastMode().catch((error) => console.error("Prolific Studies Notifier: could not start fast mode", error));
