// Studies that Prolific keeps out of its Studies list because they belong to a
// researcher's project (they sit in a Projects tab, so content.ts never sees them in
// the page). pageBridge.ts reads them from Prolific's own store; this file asks it
// for them and turns its answer into the same StudyContent the page scan produces.
// Loaded before content.js, in the same content-script scope.

const PROJECT_STUDIES_REQUEST_EVENT = "psn:project-studies-request";
const PROJECT_STUDIES_RESULT_EVENT = "psn:project-studies-result";
// Prolific ids are MongoDB ObjectIds.
const PROJECT_STUDY_ID_PATTERN = /^[0-9a-f]{24}$/;
const PROJECT_STUDIES_MAX = 200;
const PROJECT_STUDY_MAX_TEXT_LENGTH = 300;
const PROJECT_STUDY_UNLIMITED_PLACES = -1;

// Any script on the page can answer the request, so the answer is checked like
// any other outside input: unknown shapes are dropped or left empty.
function requestProjectStudies(): StudyContent[] {
    let answer: unknown = null;
    const onResult = (event: Event): void => {
        answer = (event as CustomEvent).detail;
    };
    window.addEventListener(PROJECT_STUDIES_RESULT_EVENT, onResult);
    try {
        // The bridge answers inside this call, so the answer is in place when it returns.
        window.dispatchEvent(new CustomEvent(PROJECT_STUDIES_REQUEST_EVENT));
    } finally {
        window.removeEventListener(PROJECT_STUDIES_RESULT_EVENT, onResult);
    }
    return parseProjectStudies(answer);
}

function parseProjectStudies(answer: unknown): StudyContent[] {
    if (typeof answer !== "string") return [];
    let data: unknown;
    try {
        data = JSON.parse(answer);
    } catch {
        return [];
    }
    if (!Array.isArray(data)) return [];
    return data.slice(0, PROJECT_STUDIES_MAX)
        .map(toProjectStudyContent)
        .filter((study): study is StudyContent => study !== null);
}

function toProjectStudyContent(raw: unknown): StudyContent | null {
    if (typeof raw !== "object" || raw === null) return null;
    const data = raw as Record<string, unknown>;
    if (typeof data.id !== "string" || !PROJECT_STUDY_ID_PATTERN.test(data.id)) return null;
    const minutes = asProjectStudyCount(data.completionMinutes);
    return {
        id: data.id,
        title: asProjectStudyText(data.name),
        researcher: asProjectStudyText(data.host),
        reward: formatProjectStudyMoney(data.reward),
        rewardPerHour: formatProjectStudyMoney(data.rewardPerHour),
        time: minutes === null ? null : formatProjectStudyMinutes(minutes),
        // Like the page scan, which counts a missing time as 0 minutes.
        timeInMinutes: minutes ?? 0,
        places: formatProjectStudyPlaces(data.totalPlaces, data.placesTaken),
        createdAt: new Date().toISOString(),
    };
}

function asProjectStudyText(value: unknown): string | null {
    if (typeof value !== "string") return null;
    return value.trim().slice(0, PROJECT_STUDY_MAX_TEXT_LENGTH) || null;
}

function asProjectStudyCount(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}

// Prolific stores amounts in pence/cents. The symbol goes in front ("£1.07",
// "$2.40"), the form the page shows and the reward filters read.
const PROJECT_STUDY_CURRENCY_SYMBOLS: Record<string, string> = { GBP: "£", USD: "$", EUR: "€" };

function formatProjectStudyMoney(value: unknown): string | null {
    if (typeof value !== "object" || value === null) return null;
    const { amount, currency } = value as Record<string, unknown>;
    const cents = asProjectStudyCount(amount);
    if (cents === null || typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) return null;
    const symbol = PROJECT_STUDY_CURRENCY_SYMBOLS[currency] ?? `${currency} `;
    // Whole-number maths: (amount / 100).toFixed(2) rounds some values wrongly.
    const fraction = cents % 100;
    return `${symbol}${Math.floor(cents / 100)}.${fraction < 10 ? "0" : ""}${fraction}`;
}

// "1 min", "5 mins", "1 hour 30 mins": the page's wording, which parseTimeContent reads.
function formatProjectStudyMinutes(totalMinutes: number): string {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
    if (minutes > 0 || hours === 0) parts.push(`${minutes} ${minutes === 1 ? "min" : "mins"}`);
    return parts.join(" ");
}

function formatProjectStudyPlaces(totalPlaces: unknown, placesTaken: unknown): string | null {
    if (totalPlaces === PROJECT_STUDY_UNLIMITED_PLACES) return "∞ places";
    const total = asProjectStudyCount(totalPlaces);
    if (total === null) return null;
    const left = Math.max(0, total - (asProjectStudyCount(placesTaken) ?? 0));
    return `${left} ${left === 1 ? "place" : "places"}`;
}
