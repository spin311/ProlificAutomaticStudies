// Runs in the Prolific page's own JavaScript world (manifest "world": "MAIN"), so
// it can ask the Studies page to re-fetch its study list with the page's own code.
// The request is exactly the one the page makes every 2 minutes; the extension
// never reads the login token. Talks to fastMode.ts through window events whose
// payloads are strings, the only kind that crosses between the two worlds.
// Any script on the page can send the request event, so the bridge enforces its
// own minimum gap and runs one refresh at a time, whatever asks it.

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

type BridgeRefreshStatus = "ok" | "throttled" | "unavailable" | "restricted" | "rate-limited" | "error";

type BridgeStore = Record<string, unknown> & {
    fetchList?: (options: { automatic: boolean }) => Promise<unknown>;
};

type BridgeVueApp = {
    config?: {
        globalProperties?: {
            $pinia?: { _s?: Map<string, BridgeStore> };
            $router?: { currentRoute?: { value?: { name?: unknown } } };
        };
    };
};

let bridgeLastRefreshAt = 0;
let isBridgeRefreshing = false;

function getProlificGlobals() {
    const root = document.getElementById("app") as (HTMLElement & { __vue_app__?: BridgeVueApp }) | null;
    return root?.__vue_app__?.config?.globalProperties;
}

async function refreshStudiesThroughPage(): Promise<BridgeRefreshStatus> {
    const globals = getProlificGlobals();
    const stores = globals?.$pinia?._s;
    const studiesStore = stores?.get(BRIDGE_STUDIES_STORE_ID);
    if (!stores || typeof studiesStore?.fetchList !== "function") return "unavailable";

    const isRestricted = Array.from(stores.values())
        .some((store) => BRIDGE_RESTRICTION_FLAGS.some((flag) => Boolean(store[flag])));
    if (isRestricted) return "restricted";

    const now = Date.now();
    if (isBridgeRefreshing || now - bridgeLastRefreshAt < BRIDGE_MIN_MS_BETWEEN_REFRESHES) return "throttled";
    isBridgeRefreshing = true;
    bridgeLastRefreshAt = now;
    try {
        await studiesStore.fetchList({ automatic: true });
    } catch {
        return "error";
    } finally {
        isBridgeRefreshing = false;
    }
    // On HTTP 429 Prolific's fetchList awaits navigation to its rate-limit page
    // before resolving, so the route has already changed here.
    return globals?.$router?.currentRoute?.value?.name === BRIDGE_RATE_LIMITED_ROUTE ? "rate-limited" : "ok";
}

function handleBridgeRequest(event: Event): void {
    const requestId = (event as CustomEvent).detail;
    if (typeof requestId !== "string") return;
    refreshStudiesThroughPage()
        .catch((): BridgeRefreshStatus => "error")
        .then((status) => {
            window.dispatchEvent(new CustomEvent(BRIDGE_RESULT_EVENT, {
                detail: JSON.stringify({ id: requestId, status }),
            }));
        });
}

// A second copy of the bridge would answer every request twice.
const bridgeWindow = window as unknown as { __prolificStudiesNotifierBridge?: boolean };
if (!bridgeWindow.__prolificStudiesNotifierBridge) {
    bridgeWindow.__prolificStudiesNotifierBridge = true;
    window.addEventListener(BRIDGE_REQUEST_EVENT, handleBridgeRequest);
}
