// Asks the Prolific Studies page to re-fetch its study list with the page's own
// code. The request is exactly the one the page makes every 2 minutes; the
// extension never reads the login token. Firefox content scripts can reach the
// page's own objects through wrappedJSObject (arguments go in via cloneInto), so
// unlike Chrome this runs as a normal content script. Talks to fastMode.ts
// through window events with string payloads, like the Chrome version.
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

declare function cloneInto<T>(value: T, targetScope: object): T;

function getProlificGlobals() {
    const root = document.getElementById("app") as
        (HTMLElement & { wrappedJSObject?: { __vue_app__?: BridgeVueApp } }) | null;
    return root?.wrappedJSObject?.__vue_app__?.config?.globalProperties;
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
        await studiesStore.fetchList(cloneInto({ automatic: true }, window));
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

// ---------- Project studies ----------
// Prolific's Studies list leaves out studies that belong to a researcher's project
// (they sit in a Projects tab), so the content script never sees them in the page.
// Read them from the page's own store instead, picking only the fields it needs.

const BRIDGE_PROJECT_STUDIES_REQUEST_EVENT = "psn:project-studies-request";
const BRIDGE_PROJECT_STUDIES_RESULT_EVENT = "psn:project-studies-result";

type BridgeMoney = { amount?: unknown; currency?: unknown };
type BridgeNamed = { name?: unknown; institution?: { name?: unknown } };
type BridgeStudy = {
    id?: unknown;
    name?: unknown;
    project?: unknown;
    is_official_prolific_study?: unknown;
    publisher?: BridgeNamed;
    researcher?: BridgeNamed;
    study_reward?: BridgeMoney;
    study_average_reward_per_hour?: BridgeMoney;
    study_estimated_reward_per_hour?: BridgeMoney;
    estimated_completion_time?: unknown;
    total_available_places?: unknown;
    places_taken?: unknown;
};

// The opposite of the rule Prolific's store uses for its Studies list
// (displayedStudiesForDashboard: no project, or an official Prolific study).
function isBridgeHiddenProjectStudy(study: BridgeStudy): boolean {
    return Boolean(study.project) && !study.is_official_prolific_study;
}

function pickBridgeMoney(money: BridgeMoney | undefined): { amount: unknown; currency: unknown } | null {
    return money ? { amount: money.amount, currency: money.currency } : null;
}

function toBridgeProjectStudy(study: BridgeStudy) {
    const averagePerHour = study.study_average_reward_per_hour;
    return {
        id: study.id,
        name: study.name,
        // The name Prolific's card shows under the title.
        host: study.publisher?.institution?.name || study.publisher?.name
            || study.researcher?.institution?.name || study.researcher?.name,
        reward: pickBridgeMoney(study.study_reward),
        // Like Prolific's card: the average rate once there is one, else the estimate.
        rewardPerHour: pickBridgeMoney(averagePerHour?.amount ? averagePerHour : study.study_estimated_reward_per_hour),
        completionMinutes: study.estimated_completion_time,
        totalPlaces: study.total_available_places,
        placesTaken: study.places_taken,
    };
}

function readBridgeProjectStudies(): ReturnType<typeof toBridgeProjectStudy>[] {
    const studiesStore = getProlificGlobals()?.$pinia?._s?.get(BRIDGE_STUDIES_STORE_ID);
    const list = studiesStore?.displayStudiesList as ArrayLike<BridgeStudy> | undefined;
    if (!list || typeof list.length !== "number") return [];
    const studies: ReturnType<typeof toBridgeProjectStudy>[] = [];
    // Plain indexed reads work the same on Vue's proxies and on Firefox's wrappers.
    for (let i = 0; i < list.length; i++) {
        const study = list[i];
        if (study && isBridgeHiddenProjectStudy(study)) studies.push(toBridgeProjectStudy(study));
    }
    return studies;
}

// Answers synchronously, so the content script has the list as soon as its
// dispatchEvent call returns.
function handleBridgeProjectStudiesRequest(): void {
    let studies: ReturnType<typeof toBridgeProjectStudy>[] = [];
    try {
        studies = readBridgeProjectStudies();
    } catch {
        studies = [];
    }
    window.dispatchEvent(new CustomEvent(BRIDGE_PROJECT_STUDIES_RESULT_EVENT, { detail: JSON.stringify(studies) }));
}

// A second copy of the bridge would answer every request twice.
const bridgeWindow = window as unknown as { __prolificStudiesNotifierBridge?: boolean };
if (!bridgeWindow.__prolificStudiesNotifierBridge) {
    bridgeWindow.__prolificStudiesNotifierBridge = true;
    window.addEventListener(BRIDGE_REQUEST_EVENT, handleBridgeRequest);
    window.addEventListener(BRIDGE_PROJECT_STUDIES_REQUEST_EVENT, handleBridgeProjectStudiesRequest);
}
