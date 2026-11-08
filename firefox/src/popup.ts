const REVIEW_PROMPT_KEY = "reviewPrompt";
const REVIEW_PROMPT_ANSWERED_AT_KEY = "reviewPromptAnsweredAt";
const REVIEW_PROMPT_MIN_STUDIES = 10;
const SPONSOR_PROMPT_KEY = "sponsorPrompt";
const SPONSOR_PROMPT_MIN_STUDIES = 100;
const SPONSOR_PROMPT_DELAY_MS = 7 * 24 * 60 * 60 * 1000;
const SPONSOR_MILESTONE_URL = "https://github.com/sponsors/spin311?metadata_source=ProlificAutomaticStudies-milestone";

const FIREFOX_REVIEW_URL = "https://addons.mozilla.org/firefox/addon/prolific-studies-notifier/reviews/";

function getReviewUrl(): string {
    return FIREFOX_REVIEW_URL;
}

// Ask once: any stored answer ('rated' or 'dismissed') hides the card for good.
function shouldShowReviewPrompt(notifiedCount: unknown, answer: unknown, reviewUrl: string | null): boolean {
    if (reviewUrl === null || answer === "rated" || answer === "dismissed") return false;
    return typeof notifiedCount === "number" && notifiedCount >= REVIEW_PROMPT_MIN_STUDIES;
}

type DuePrompt = "review" | "sponsor" | null;

interface PromptState {
    notifiedCount: unknown;
    reviewUrl: string | null;
    reviewAnswer: unknown;
    reviewAnsweredAt: unknown;
    sponsorAnswer: unknown;
    now: number;
}

// The sponsor ask comes after the review ask is settled: either there is no review
// card for this build, or it was answered at least a week ago.
function shouldShowSponsorPrompt(state: PromptState): boolean {
    const {notifiedCount, reviewUrl, reviewAnswer, reviewAnsweredAt, sponsorAnswer, now} = state;
    if (sponsorAnswer === "clicked" || sponsorAnswer === "dismissed") return false;
    if (typeof notifiedCount !== "number" || notifiedCount < SPONSOR_PROMPT_MIN_STUDIES) return false;
    if (reviewUrl === null) return true;
    const isReviewAnswered = reviewAnswer === "rated" || reviewAnswer === "dismissed";
    return isReviewAnswered && typeof reviewAnsweredAt === "number" && now - reviewAnsweredAt >= SPONSOR_PROMPT_DELAY_MS;
}

// At most one card, so the popup never asks twice at once.
function getDuePrompt(state: PromptState): DuePrompt {
    if (shouldShowReviewPrompt(state.notifiedCount, state.reviewAnswer, state.reviewUrl)) return "review";
    return shouldShowSponsorPrompt(state) ? "sponsor" : null;
}

async function setupPrompts(notifiedCount: number): Promise<void> {
    // The prompts are optional: a failing storage read must not stop the rest of the popup.
    try {
        await showDuePrompt(notifiedCount);
    } catch (error) {
        console.error("Could not set up the review and sponsor prompts", error);
    }
}

async function showDuePrompt(notifiedCount: number): Promise<void> {
    const reviewUrl = getReviewUrl();
    const stored = await browser.storage.sync.get([REVIEW_PROMPT_KEY, REVIEW_PROMPT_ANSWERED_AT_KEY, SPONSOR_PROMPT_KEY]);
    // Decided once, at popup load, so answering one card never brings up the other.
    const due = getDuePrompt({
        notifiedCount,
        reviewUrl,
        reviewAnswer: stored[REVIEW_PROMPT_KEY],
        reviewAnsweredAt: stored[REVIEW_PROMPT_ANSWERED_AT_KEY],
        sponsorAnswer: stored[SPONSOR_PROMPT_KEY],
        now: Date.now(),
    });
    if (due === "review" && reviewUrl !== null) {
        const answerReview = (value: "rated" | "dismissed") =>
            browser.storage.sync.set({[REVIEW_PROMPT_KEY]: value, [REVIEW_PROMPT_ANSWERED_AT_KEY]: Date.now()});
        showPromptCard("review", notifiedCount, async () => {
            // Store the answer first: the popup can close as soon as the tab opens.
            await answerReview("rated");
            await browser.tabs.create({url: reviewUrl, active: true});
        }, () => answerReview("dismissed"));
    } else if (due === "sponsor") {
        showPromptCard("sponsor", notifiedCount, async () => {
            await browser.storage.sync.set({[SPONSOR_PROMPT_KEY]: "clicked"});
            await browser.tabs.create({url: SPONSOR_MILESTONE_URL, active: true});
        }, () => browser.storage.sync.set({[SPONSOR_PROMPT_KEY]: "dismissed"}));
    }
}

// Shows one prompt card (element ids are "<name>Prompt", "<name>Start" or "reviewRate", ...)
// and hides the header Sponsor button meanwhile: one ask at a time.
function showPromptCard(name: "review" | "sponsor", notifiedCount: number,
                        onPrimary: () => Promise<unknown>, onDismiss: () => Promise<unknown>): void {
    const card = document.getElementById(`${name}Prompt`);
    const primary = document.getElementById(name === "review" ? "reviewRate" : "sponsorStart");
    const dismiss = document.getElementById(name === "review" ? "reviewDismiss" : "sponsorDismiss");
    if (!card || !primary || !dismiss) return;

    const countElement = document.getElementById(`${name}PromptCount`);
    if (countElement) countElement.textContent = String(notifiedCount);
    const sponsorButton = document.getElementById("sponsorButton");
    card.hidden = false;
    if (sponsorButton) sponsorButton.hidden = true;

    const close = (): void => {
        card.hidden = true;
        if (sponsorButton) sponsorButton.hidden = false;
    };
    primary.addEventListener("click", async (): Promise<void> => {
        close();
        await onPrimary();
    });
    dismiss.addEventListener("click", async (): Promise<void> => {
        close();
        await onDismiss();
    });
}

const OPENED_STUDY_IDS = "openedStudyIds";
// Weeks of studies; the oldest drop off first.
const OPENED_STUDY_IDS_LIMIT = 1000;
const MIDDLE_BUTTON = 1;
let openedStudyIds: string[] = [];

function addOpenedStudyId(ids: string[], id: string): string[] {
    return [...ids.filter((openedId) => openedId !== id), id].slice(-OPENED_STUDY_IDS_LIMIT);
}

// A redraw's storage read can predate a study opened while it was pending, so it adds
// to what this page already knows instead of replacing it. Nothing else removes ids.
function mergeOpenedStudyIds(stored: string[], known: string[]): string[] {
    const storedIds = new Set(stored);
    return [...stored, ...known.filter((id) => !storedIds.has(id))].slice(-OPENED_STUDY_IDS_LIMIT);
}

// Starts the storage writes before anything else: a left click opens a tab, and the
// popup can close as soon as it does.
function markStudyOpened(id: string, row: HTMLElement): Promise<void> {
    openedStudyIds = addOpenedStudyId(openedStudyIds, id);
    const saved = browser.storage.local.set({[OPENED_STUDY_IDS]: openedStudyIds});
    flushStudiesScrollSave();
    row.classList.add("is-opened");
    return saved;
}

// Saved ("bookmarked") studies are full copies under their own key, so trimming or
// clearing the history never removes them.
const BOOKMARKED_STUDIES = "bookmarkedStudies";
const STUDIES_VIEW = "studiesView";
type StudiesView = "all" | "saved";
// List: one compact row per study, so several fit in the 600 px popup. Cards: the
// pre-4.2.0 look, with the full title and one labelled line per detail.
const STUDIES_LAYOUT = "studiesLayout";
type StudiesLayout = "list" | "cards";

function toggleBookmark(bookmarks: Study[], study: Study): Study[] {
    const isSaved = bookmarks.some((saved) => saved.id === study.id);
    return isSaved ? bookmarks.filter((saved) => saved.id !== study.id) : [...bookmarks, study];
}

// Reads the list again first, like Delete: another popup or tab may have changed it.
async function toggleStudyBookmark(study: Study): Promise<void> {
    const result = await browser.storage.local.get(BOOKMARKED_STUDIES);
    const bookmarks: Study[] = result[BOOKMARKED_STUDIES] ?? [];
    await browser.storage.local.set({[BOOKMARKED_STUDIES]: toggleBookmark(bookmarks, study)});
    await populateStudies();
}

// Each button stores its value under the key, then the list is drawn again from the top.
function setupStudiesSwitch(storageKey: string, buttons: [string, string][]): void {
    buttons.forEach(([elementId, value]) => {
        document.getElementById(elementId)?.addEventListener("click", async (): Promise<void> => {
            await browser.storage.local.set({[storageKey]: value});
            await showStudiesFromTop();
        });
    });
}

function setupStudiesView(): void {
    setupStudiesSwitch(STUDIES_VIEW, [["view-all", "all"], ["view-saved", "saved"]]);
}

function setupStudiesLayout(): void {
    setupStudiesSwitch(STUDIES_LAYOUT, [["layout-list", "list"], ["layout-cards", "cards"]]);
}

function setPressed(elementId: string, isPressed: boolean): void {
    document.getElementById(elementId)?.setAttribute("aria-pressed", String(isPressed));
}

function showStudiesViewState(view: StudiesView, layout: StudiesLayout, savedCount: number): void {
    setPressed("view-all", view === "all");
    setPressed("view-saved", view === "saved");
    setPressed("layout-list", layout === "list");
    setPressed("layout-cards", layout === "cards");
    const countElement = document.getElementById("saved-count");
    if (countElement) countElement.textContent = String(savedCount);
}

// The same page as the popup, opened as a tab: it can use the whole window and stays
// open while studies are opened from it, which a popup can't do.
const TAB_VIEW_URL = "popup/popup.html?view=tab";

function isTabView(): boolean {
    return /[?&]view=tab(&|$)/.test(globalThis.location?.search ?? "");
}

function setupTabView(): void {
    const openInTab = document.getElementById("openInTab");
    if (isTabView()) {
        document.body.classList.add("is-tab");
        if (openInTab) openInTab.hidden = true;
        return;
    }
    openInTab?.addEventListener("click", () => browser.tabs.create({url: browser.runtime.getURL(TAB_VIEW_URL)}));
}

const STUDY_LIST_KEYS = ["currentStudies", BOOKMARKED_STUDIES, OPENED_STUDY_IDS];

function isStudiesSectionShown(): boolean {
    const studies = document.getElementById("studies");
    return studies !== null && !studies.hidden;
}

// Keeps an open popup or tab current while studies are found, saved or opened elsewhere.
function watchStudyChanges(): void {
    browser.storage.onChanged.addListener(async (changes, areaName) => {
        const isListChange = areaName === "local" && STUDY_LIST_KEYS.some((key) => key in changes);
        if (isListChange && isStudiesSectionShown()) await populateStudies();
    });
}

const SEARCH_STUDIES = "searchStudies";
const STUDIES_SCROLL = "studiesScroll";
// Reopening soon after opening a study lands where the list was left; later, at the top.
const SCROLL_RESTORE_MAX_AGE_MS = 10 * 60 * 1000;
const SCROLL_SAVE_DELAY_MS = 150;

function getStudiesContainer(): HTMLElement {
    return document.getElementById("studies-container") as HTMLElement;
}

async function restoreStudiesScroll(): Promise<void> {
    const result = await browser.storage.local.get(STUDIES_SCROLL);
    const saved = result[STUDIES_SCROLL];
    if (typeof saved?.top !== "number" || typeof saved?.at !== "number") return;
    if (Date.now() - saved.at > SCROLL_RESTORE_MAX_AGE_MS) return;
    getStudiesContainer().scrollTop = saved.top;
    // Counts from this open, not from the last scroll.
    await browser.storage.local.set({[STUDIES_SCROLL]: {top: saved.top, at: Date.now()}});
}

let pendingScrollSave: ReturnType<typeof setTimeout> | undefined;

function saveStudiesScroll(): Promise<void> {
    clearTimeout(pendingScrollSave);
    pendingScrollSave = undefined;
    return browser.storage.local.set({[STUDIES_SCROLL]: {top: getStudiesContainer().scrollTop, at: Date.now()}});
}

// The popup is destroyed when it closes (e.g. after a click opens a study), so the
// position is saved as the user scrolls.
function watchStudiesScroll(): void {
    getStudiesContainer().addEventListener("scroll", () => {
        clearTimeout(pendingScrollSave);
        pendingScrollSave = setTimeout(saveStudiesScroll, SCROLL_SAVE_DELAY_MS);
    });
}

// Opening a study can close the popup before a pending save runs.
function flushStudiesScrollSave(): void {
    if (pendingScrollSave !== undefined) void saveStudiesScroll();
}

const FOCUSABLE_ROW_CONTROLS = ["study-title", "open-btn", "save-btn", "delete-btn"];

type FocusedRowControl = {
    studyId: string | null;
    control: string;
    rowIndex: number;
};

function getFocusedRowControl(container: HTMLElement): FocusedRowControl | null {
    const active = document.activeElement;
    if (!active) return null;
    const rows = Array.from(container.children);
    const rowIndex = rows.findIndex((row) => row.contains(active));
    const control = FOCUSABLE_ROW_CONTROLS.find((name) => active.classList.contains(name));
    if (rowIndex === -1 || !control) return null;
    return {studyId: rows[rowIndex].getAttribute("data-study-id"), control, rowIndex};
}

// Puts focus back on the same control of the same study, or of the row that took the
// place of a deleted one, so keyboard users don't drop back to the top of the page.
function restoreRowFocus(container: HTMLElement, focused: FocusedRowControl): void {
    const rows = Array.from(container.children);
    const row = rows.find((candidate) => candidate.getAttribute("data-study-id") === focused.studyId)
        ?? rows[Math.min(focused.rowIndex, rows.length - 1)];
    row?.querySelector<HTMLElement>(`.${focused.control}`)?.focus({preventScroll: true});
}

// Swaps the rows in one step, then puts back the scroll position and keyboard focus.
// Emptying the list first would let the browser clamp the scroll position to 0 while
// the storage read is pending.
function replaceKeepingScroll(container: HTMLElement, nodes: HTMLElement[]): void {
    const scrollTop = container.scrollTop;
    const focused = getFocusedRowControl(container);
    container.replaceChildren(...nodes);
    container.scrollTop = scrollTop;
    if (focused) restoreRowFocus(container, focused);
}

async function showStudiesFromTop(search: string = ""): Promise<void> {
    await populateStudies(search);
    getStudiesContainer().scrollTop = 0;
}

async function setVolume(volume: HTMLInputElement) {
    const result = await browser.storage.sync.get("volume");
    const vol = result["volume"];
    if (vol !== undefined) {
        volume.value =  String(vol);
    }
    volume.addEventListener("change", async function () {
        await browser.storage.sync.set({["volume"]: parseFloat(volume.value)});
    });

}

document.addEventListener('DOMContentLoaded', async function () {
    await browser.browserAction.setBadgeText({text: ''});

    const counter = document.getElementById("counter") as HTMLSpanElement;
    const playAudio = document.getElementById("playAudio") as HTMLButtonElement;
    const resetValuesBtn = document.getElementById("resetValues") as HTMLButtonElement;
    const donateText: HTMLElement | null = document.getElementById('donateText');
    const donateImg: HTMLElement | null = document.getElementById('donateImg');
    const downloadCSVButton = document.getElementById("downloadCSV") as HTMLButtonElement;

    if (donateImg && donateText) {
        donateText.addEventListener('mouseover', function() {
            donateImg.style.visibility = 'visible';
        });
    }
    await renderPopup();

    setTabState("settings-tab", "settings");
    setTabState("filters-tab", "filters");
    setTabState("studies-tab", "studies");
    setupTabView();
    setupStudiesView();
    setupStudiesLayout();
    // The saved search must be in the box before the first list is drawn.
    await setupSearch();
    await setCurrentActiveTab();
    // A tab keeps its own scroll position; only the popup is rebuilt on every open.
    if (!isTabView()) {
        await restoreStudiesScroll();
        watchStudiesScroll();
    }
    watchStudyChanges();
    await setBlacklist();

    if(counter) {
        const notifiedCount = await setCounter(counter);
        await setupPrompts(notifiedCount);
    }

    if(playAudio) {
        playAudio.addEventListener("click", playAlert);
    }

    if (resetValuesBtn) {
        resetValuesBtn.addEventListener("dblclick", resetValues);
    }

    if (downloadCSVButton) {
        downloadCSVButton.addEventListener("click", downloadStudies);
    }

    // Turn on switch animations only once the saved states are drawn, so opening
    // the popup shows them in place instead of sliding every enabled switch on.
    requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.add("is-ready")));

});

async function setCounter(counter: HTMLSpanElement): Promise<number> {
    const result = await browser.storage.sync.get("counter");
    const count = result["counter"];
    if (count !== undefined) {
        counter.innerText = count.toString();
    }
    return typeof count === "number" ? count : 0;
}

async function playAlert(): Promise<void> {
    await browser.runtime.sendMessage({
        type: 'play-sound',
        target: 'background',
    });
    const playAudio = document.getElementById("playAudio") as HTMLButtonElement;
    playAudio.disabled = true;
    playAudio.classList.remove("btn-success");
    playAudio.classList.add("btn-fail");
    setTimeout(() => {
        playAudio.disabled = false;
        playAudio.classList.remove("btn-fail");
        playAudio.classList.add("btn-success");
    }, 500);
}

async function resetValues(): Promise<void> {
    await browser.runtime.sendMessage({
        type: 'resetValues',
        target: 'background',
    });

    await new Promise(resolve => setTimeout(resolve, 150));
    await renderPopup();
}

// New columns go last, so spreadsheets built on older exports keep working.
const CSV_COLUMNS: (keyof Study)[] = [
    "id", "title", "researcher", "reward", "rewardPerHour",
    "time", "timeInMinutes", "createdAt", "places"
];

function buildStudiesCsv(studies: Study[]): string {
    const rows = studies.map((study) => CSV_COLUMNS.map((column) => {
        const value = study[column];
        if (value === null || value === undefined) return "";
        return `"${String(value).replace(/"/g, '""')}"`;
    }).join(","));
    return [CSV_COLUMNS.join(","), ...rows].join("\n");
}

async function downloadStudies(): Promise<void> {
    const result = await browser.storage.local.get("currentStudies");
    const studies: Study[] = result["currentStudies"] ?? [];
    const csvContent = buildStudiesCsv(studies);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "studies.csv");
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// Day/month and time: the history only holds recent studies, so the year adds nothing.
function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const pad = (value: number) => (value < 10 ? `0${value}` : String(value));
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function setSelectState(elementId: string, storageKey: string, callback?: () => void) {
    const element = document.getElementById(elementId) as HTMLSelectElement;
    if (!element) return;
    const result = await browser.storage.sync.get(storageKey);
    if (result[storageKey] !== undefined) {
        element.value = result[storageKey];
    }
    element.addEventListener("change", async (): Promise<void> => {
        await browser.storage.sync.set({[storageKey]: element.value});
        if (callback) {
            callback();
        }
    })
}

function parseMoney(value: string | null): number {
    return parseFloat(value?.replace(/[^\d.]/g, "") || "0");
}

function parseTime(value: string | null): number {
    if (!value) return 0;
    const hourMatch = value.match(/(\d+)\s*hour/);
    const minMatch = value.match(/(\d+)\s*min/);

    const hours = hourMatch ? parseInt(hourMatch[1], 10) : 0;
    const minutes = minMatch ? parseInt(minMatch[1], 10) : 0;

    return hours * 60 + minutes;
}

function parseDate(value: string | null): number {
    return new Date(value || "").getTime() || 0;
}

function setTabState(elementId: string, storageValue: string): void  {
    const element = document.getElementById(elementId) as HTMLElement;
    if (!element) return;
    element.addEventListener("click", async function (): Promise<void> {
        await browser.storage.sync.set({["activeTab"]: storageValue});
        await changeTab(storageValue);
    });
}

const POPUP_TABS = ["settings", "studies", "filters"];

async function setCurrentActiveTab(): Promise<void> {
    const result = await browser.storage.sync.get("activeTab");
    const savedTab = result["activeTab"];
    if (isTabView()) {
        await changeTab("studies");
        return;
    }
    // A missing or unknown tab would hide every section, leaving only the tab bar.
    await changeTab(POPUP_TABS.includes(savedTab) ? savedTab : "settings");
}

async function populateStudies(search: string = '', sort: string = "") {
    if (!search) {
        const searchInput = document.getElementById("search-studies") as HTMLInputElement;
        search = searchInput.value;
    }
    if (!sort) {
        const result = await browser.storage.sync.get("sortStudies");
        sort = result["sortStudies"];
    }
    const studiesContainer = getStudiesContainer();
    const result = await browser.storage.local.get(["currentStudies", OPENED_STUDY_IDS, BOOKMARKED_STUDIES, STUDIES_VIEW, STUDIES_LAYOUT]);
    const bookmarks: Study[] = result[BOOKMARKED_STUDIES] ?? [];
    const view: StudiesView = result[STUDIES_VIEW] === "saved" ? "saved" : "all";
    const layout: StudiesLayout = result[STUDIES_LAYOUT] === "cards" ? "cards" : "list";
    openedStudyIds = mergeOpenedStudyIds(result[OPENED_STUDY_IDS] ?? [], openedStudyIds);
    showStudiesViewState(view, layout, bookmarks.length);
    let currentStudies: Study[] = view === "saved" ? [...bookmarks] : [...(result["currentStudies"] ?? [])];

    if (currentStudies.length === 0) {
        const message = view === "saved"
            ? "No saved studies yet. Click ☆ on a study to keep it here."
            : "No studies available.";
        replaceKeepingScroll(studiesContainer, [createTextElement("p", "text-center", message)]);
        return;
    }

    if (search.trim() !== "") {
        const searchLower = search.toLowerCase();
        currentStudies = currentStudies.filter(study => {
            const title = study.title?.toLowerCase() || "";
            const researcher = study.researcher?.toLowerCase() || "";
            return title.includes(searchLower) || researcher.includes(searchLower);
        });
    }

    currentStudies.sort((a, b) => {
        switch (sort) {
            case "created+":
                return parseDate(b.createdAt) - parseDate(a.createdAt);
            case "created-":
                return parseDate(a.createdAt) - parseDate(b.createdAt);
            case "pay+":
                return parseMoney(b.reward) - parseMoney(a.reward);
            case "pay-":
                return parseMoney(a.reward) - parseMoney(b.reward);
            case "payH+":
                return parseMoney(b.rewardPerHour) - parseMoney(a.rewardPerHour);
            case "payH-":
                return parseMoney(a.rewardPerHour) - parseMoney(b.rewardPerHour);
            case "time+":
                if (a.timeInMinutes && b.timeInMinutes) {
                    return a.timeInMinutes - b.timeInMinutes;
                }
                return parseTime(a.time) - parseTime(b.time);
            case "time-":
                if (a.timeInMinutes && b.timeInMinutes) {
                    return b.timeInMinutes - a.timeInMinutes;
                }
                return parseTime(b.time) - parseTime(a.time);
            default:
                return 0;
        }
    });

    const bookmarkedIds = new Set(bookmarks.map((saved) => saved.id));
    const createItem = layout === "cards" ? createStudyCard : createStudyRow;
    const rows = currentStudies.map((study) => createItem(study, {
        isOpened: study.id !== null && openedStudyIds.includes(study.id),
        isSaved: bookmarkedIds.has(study.id),
        onToggleSaved: () => toggleStudyBookmark(study),
        // In Saved, the star is the way to remove a study.
        onDelete: view === "all" ? () => deleteStudy(study.id) : null,
    }));
    replaceKeepingScroll(studiesContainer, rows);
}

// Deletes from everything saved, not only the studies the search shows, and reads the
// list again first: the content script may have added studies since it was drawn.
async function deleteStudy(id: string | null): Promise<void> {
    const result = await browser.storage.local.get("currentStudies");
    const saved: Study[] = result["currentStudies"] ?? [];
    await browser.storage.local.set({ currentStudies: saved.filter((study) => study.id !== id) });
    await populateStudies();
}

async function setupSearch() {
    const searchInput = document.getElementById("search-studies") as HTMLInputElement;
    if (!searchInput) return;
    searchInput.addEventListener("input", async function (): Promise<void> {
        const searchValue = searchInput.value;
        // Kept until the box is cleared, so it survives the popup closing after a click.
        await browser.storage.local.set({[SEARCH_STUDIES]: searchValue});
        await showStudiesFromTop(searchValue);
    });
    const result = await browser.storage.local.get(SEARCH_STUDIES);
    searchInput.value = result[SEARCH_STUDIES] || "";
}

async function changeTab(activeTab: string): Promise<void> {
    const windows = [{tab: "settings", item: "settings-tab"},
        {tab: "filters", item: "filters-tab"},
        {tab: "studies", item: "studies-tab"}
    ];
    windows.forEach(window => {
        const currentTab = window.tab;
        const currentItem = window.item;
        const currentTabElement = document.getElementById(currentTab) as HTMLElement;
        const currentItemElement = document.getElementById(currentItem)  as HTMLElement;
        // The hidden attribute, not an inline display, so the CSS can lay a section out
        // (the Studies section is a flex column whose list shrinks to fit the popup).
        currentTabElement.hidden = activeTab !== currentTab;
        if(activeTab === currentTab) {
            currentItemElement.classList.add("active");
        }
        else {
            currentItemElement.classList.remove("active");
        }
    });
    if (activeTab === 'studies') {
        await populateStudies();
    } else if (activeTab === 'filters') {
        await populateBlacklists();
    }
}

async function setAlertState(): Promise<void> {
    const websiteButton = document.getElementById("websiteBtn") as HTMLElement;
    const titleButton = document.getElementById("titleBtn") as HTMLElement;
    const trackIds = document.getElementById("trackIds") as HTMLInputElement;
    const trackIdsLabel = document.getElementById("trackIdsLabel") as HTMLElement;
    const history = document.getElementById("studyHistoryLen") as HTMLInputElement;
    const historyLabel = document.getElementById("study-history-len-label") as HTMLElement;
    const fastMode = document.getElementById("fastMode") as HTMLInputElement;
    const fastModeLabel = document.getElementById("fastMode-label") as HTMLElement;
    const fastModeInterval = document.getElementById("fastModeInterval") as HTMLInputElement;
    const fastModeIntervalLabel = document.getElementById("fastModeInterval-label") as HTMLElement;
    const labels = [historyLabel, trackIdsLabel, fastModeLabel, fastModeIntervalLabel].filter(Boolean);
    const inputs = [history, trackIds, fastMode, fastModeInterval].filter(Boolean);

    const enableControls = () => {
        labels.forEach(el => el.classList.remove("disabled-text"));
        inputs.forEach(el => el.disabled = false);
    };

    const disableControls = () => {
        labels.forEach(el => el.classList.add("disabled-text"));
        inputs.forEach(el => el.disabled = true);
    };

    const setActiveButton = (activeBtn: HTMLElement, inactiveBtn: HTMLElement) => {
        activeBtn.classList.add("active");
        inactiveBtn.classList.remove("active");
    };

    const result = await browser.storage.sync.get("useOld");
    if (result["useOld"]) {
        disableControls();
        setActiveButton(titleButton, websiteButton);
    } else {
        enableControls();
        setActiveButton(websiteButton, titleButton);
    }

    websiteButton.addEventListener("click", async () => {
        enableControls();
        setActiveButton(websiteButton, titleButton);
        await browser.storage.sync.set({ useOld: false });
        const tabs = await browser.tabs.query({ url: "*://app.prolific.com/*" });
        tabs.forEach(tab => {
            browser.tabs.sendMessage(tab.id!, {
                type: 'change-alert-type',
                target: 'everything',
                data: "website"
            });
        });
    });

    titleButton.addEventListener("click", async () => {
        disableControls();
        setActiveButton(titleButton, websiteButton);
        await browser.storage.sync.set({ useOld: true });
        const tabs = await browser.tabs.query({ url: "*://app.prolific.com/*" });
        tabs.forEach(tab => {
            browser.tabs.sendMessage(tab.id!, {
                type: 'change-alert-type',
                target: 'content',
                data: "title"
            });
        });
        browser.runtime.sendMessage({
            type: 'change-alert-type',
            target: 'background',
            data: "title"
        });
    });
}


async function setCheckboxState(elementId: string, storageKey: string, storageArea: browser.storage.StorageArea = browser.storage.sync): Promise<void> {
    const element = document.getElementById(elementId) as HTMLInputElement;
    if (!element) return;
    const result = await storageArea.get(storageKey);
    if (result[storageKey] !== undefined) {
        element.checked = result[storageKey];
    }
    element.addEventListener("click", async function (): Promise<void> {
        await storageArea.set({[storageKey]: element.checked});
    });
}

async function setInputState(elementId: string, storageKey: string, storageArea: browser.storage.StorageArea = browser.storage.sync): Promise<void> {
    const element = document.getElementById(elementId) as HTMLInputElement;
    if (!element) return;
    const result = await storageArea.get(storageKey);
    if (result[storageKey] !== undefined) {
        element.value = result[storageKey];
    }
    element.addEventListener("change", async function (): Promise<void> {
        await storageArea.set({[storageKey]: parseFloat(element.value)});
    });
}

async function handleBlacklistInputs() {
    await handleBlacklistInput("blacklist-name", "nameBlacklist", "name-list");
    await handleBlacklistInput("blacklist-researcher", "researcherBlacklist", "researcher-list");
}

async function handleBlacklistInput(inputId: string, storageKey: string, listId: string): Promise<void> {
    const blacklistInput = document.getElementById(inputId) as HTMLInputElement;
    await appendBlacklistInput(blacklistInput?.value, storageKey);
    blacklistInput.value = '';
    await populateBlacklist(listId, storageKey);
}

async function setBlacklist() {
    const blacklistButton = document.getElementById("submit-blacklist") as HTMLButtonElement;
    const blacklistNameInput = document.getElementById("blacklist-name") as HTMLInputElement;
    const blacklistResearcherInput = document.getElementById("blacklist-researcher") as HTMLInputElement;

    blacklistNameInput.addEventListener("keydown", async (e) => {
        if (e.key === "Enter") {
            await handleBlacklistInput("blacklist-name", "nameBlacklist", "name-list");
        }
    });
    blacklistResearcherInput.addEventListener("keydown", async (e) => {
        if (e.key === "Enter") {
            await handleBlacklistInput("blacklist-researcher", "researcherBlacklist", "researcher-list");
        }
    });

    if (!blacklistButton) return;

    blacklistButton.addEventListener("click", async function (): Promise<void> {
        await handleBlacklistInputs();
    });
}

async function appendBlacklistInput(value: string, storageKey: string): Promise<void> {
    if (!value) return;
    const currentValue = value.toLowerCase();
    let newValues;
    const currentValues = await browser.storage.sync.get(storageKey);
    const result = currentValues[storageKey];
    if (result !== undefined && !result.includes(currentValue)) {
        newValues = [...result, currentValue];
    } else {
        newValues = [currentValue];
    }
    await browser.storage.sync.set({ [storageKey]: newValues });
}

async function populateBlacklists() {
    await populateBlacklist("name-list", "nameBlacklist");
    await populateBlacklist("researcher-list", "researcherBlacklist");
}

async function populateBlacklist(listId: string, storageKey: string, values: string[]=[]): Promise<void> {
    const blacklistContainer = document.getElementById(listId) as HTMLElement;
    blacklistContainer.replaceChildren();
    let currentItems;
    if (values.length === 0) {
        const result = await browser.storage.sync.get(storageKey);
        currentItems = result[storageKey] || [];
    } else {
        currentItems = values;
    }

    currentItems.forEach((item: string, index: number) => {
        blacklistContainer.append(createBlacklistChip(item, async () => {
            const remaining = currentItems.filter((_: string, i: number) => i !== index);
            await browser.storage.sync.set({ [storageKey]: remaining });
            await populateBlacklist(listId, storageKey, remaining);
        }));
    });
}

async function renderPopup() {
    await setCheckboxState("autoAudio", "audioActive");
    await setCheckboxState("showNotification", "showNotification");
    await setCheckboxState("openProlific", "openProlific");
    await setCheckboxState("focusProlific", "focusProlific");
    await setCheckboxState("trackIds", "trackIds");
    await setCheckboxState("fastMode", "fastMode", browser.storage.local);

    await setInputState("reward", "reward");
    await setInputState("rewardPerHour", "rewardPerHour");
    await setInputState("time", "time");
    await setInputState("studyHistoryLen","studyHistoryLen");
    await setInputState("fastModeInterval", "fastModeInterval", browser.storage.local);

    await setAlertState();
    await setSelectState("selectAudio", "audio");
    await setSelectState("sort-studies", "sortStudies", () => showStudiesFromTop());

    const volume = document.getElementById("volume") as HTMLInputElement;
    if (volume) {
        await setVolume(volume);
    }
}

// Study text comes from Prolific's page (researchers write it) and blacklist words
// from the user, so both are only ever inserted as text, never parsed as HTML.
function createTextElement(tagName: string, className: string, text: string): HTMLElement {
    const element = document.createElement(tagName);
    element.className = className;
    element.textContent = text;
    return element;
}

function getStudyUrl(study: Study): string {
    return `https://app.prolific.com/studies/${encodeURIComponent(study.id ?? "")}`;
}

// A real link, so right-click > Copy link and middle-click work on it.
function createStudyLink(study: Study, className: string, text: string): HTMLAnchorElement {
    const link = document.createElement("a");
    link.className = className;
    link.href = getStudyUrl(study);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = text;
    return link;
}

function getStudyMeta(study: Study): string {
    const rewardPerHour = study.rewardPerHour ? `${study.rewardPerHour}/hr` : null;
    return [study.reward, rewardPerHour, study.time, study.places].filter(Boolean).join(" · ");
}

function watchStudyOpened(link: HTMLAnchorElement, study: Study, row: HTMLElement): void {
    const id = study.id;
    if (!id) return;
    link.addEventListener("click", () => markStudyOpened(id, row));
    link.addEventListener("auxclick", (event: MouseEvent) => {
        if (event.button === MIDDLE_BUTTON) return markStudyOpened(id, row);
    });
}

type StudyCardOptions = {
    isOpened: boolean;
    isSaved: boolean;
    onToggleSaved: () => void;
    onDelete: (() => void) | null;
};

// Cards spell out what the buttons do; list rows only have room for icons.
function createSaveButton(study: Study, options: StudyCardOptions, isLabelled: boolean): HTMLButtonElement {
    const name = study.title || "study";
    const star = options.isSaved ? "★" : "☆";
    const button = document.createElement("button");
    button.className = isLabelled ? "btn text-btn save-btn" : "icon-btn save-btn";
    // The word stays "Save": aria-pressed carries the state, and voice control
    // matches the visible word against the aria-label.
    button.textContent = isLabelled ? `${star} Save` : star;
    button.title = options.isSaved ? "Remove from saved" : "Save for later";
    button.setAttribute("aria-pressed", String(options.isSaved));
    button.setAttribute("aria-label", `Save ${name}`);
    button.addEventListener("click", options.onToggleSaved);
    return button;
}

function createDeleteButton(study: Study, onDelete: () => void, isLabelled: boolean): HTMLButtonElement {
    const button = document.createElement("button");
    button.className = isLabelled ? "btn text-btn delete-btn" : "icon-btn delete-btn";
    button.title = "Delete";
    button.setAttribute("aria-label", `Delete ${study.title || "study"}`);
    const trashIcon = document.createElement("img");
    trashIcon.src = "/svgs/trash.svg";
    trashIcon.alt = "";
    button.append(trashIcon);
    if (isLabelled) button.append("Delete");
    button.addEventListener("click", onDelete);
    return button;
}

function createStudyShell(study: Study, options: StudyCardOptions, layoutClass: string): HTMLElement {
    const item = document.createElement("div");
    item.className = ["study-card", layoutClass, options.isOpened ? "is-opened" : ""].filter(Boolean).join(" ");
    item.setAttribute("data-study-id", study.id ?? "");
    return item;
}

function createTitleLink(study: Study, item: HTMLElement): HTMLAnchorElement {
    const title = createStudyLink(study, "study-title", study.title || "Untitled");
    title.title = study.title || "";
    watchStudyOpened(title, study, item);
    return title;
}

function createOpenLink(study: Study, item: HTMLElement, isLabelled: boolean): HTMLAnchorElement {
    const openLink = createStudyLink(study, "btn open-btn normal-link", isLabelled ? "Open ↗" : "↗");
    openLink.title = "Open in a new tab";
    // The title link opens the same page, so a row's small arrow is left out of the
    // Tab order. A card's labelled Open button is a visible control and keeps its stop.
    if (!isLabelled) openLink.tabIndex = -1;
    openLink.setAttribute("aria-label", `Open ${study.title || "study"} in a new tab`);
    watchStudyOpened(openLink, study, item);
    return openLink;
}

function createStudyActions(study: Study, item: HTMLElement, options: StudyCardOptions, isLabelled: boolean): HTMLElement {
    const actions = document.createElement("div");
    actions.className = "study-actions";
    actions.append(createOpenLink(study, item, isLabelled), createSaveButton(study, options, isLabelled));
    if (options.onDelete) actions.append(createDeleteButton(study, options.onDelete, isLabelled));
    return actions;
}

// The researcher and when the study was found, on one line.
function createStudySub(study: Study): HTMLElement {
    const sub = document.createElement("div");
    sub.className = "study-sub";
    sub.append(
        createTextElement("span", "study-researcher", study.researcher || "Unknown"),
        createTextElement("span", "study-created-at", study.createdAt ? formatDate(study.createdAt) : ""),
    );
    return sub;
}

function createStudyRow(study: Study, options: StudyCardOptions): HTMLElement {
    const row = createStudyShell(study, options, "is-compact");
    row.append(
        createTitleLink(study, row),
        createTextElement("div", "study-meta", getStudyMeta(study)),
        createStudySub(study),
        createStudyActions(study, row, options, false),
    );
    return row;
}

function createLabeledText(className: string, label: string, value: string): HTMLElement {
    const element = document.createElement("div");
    element.className = className;
    const labelElement = document.createElement("strong");
    labelElement.textContent = label;
    element.append(labelElement, ` ${value}`);
    return element;
}

function createStudyCard(study: Study, options: StudyCardOptions): HTMLElement {
    const card = createStudyShell(study, options, "is-detailed");
    const details = [
        createStudySub(study),
        createLabeledText("study-reward", "Pay:", study.reward || "N/A"),
        createTextElement("div", "study-reward-hour", study.rewardPerHour ? `${study.rewardPerHour}/hr` : ""),
        createLabeledText("study-time", "Time:", study.time || "N/A"),
        // Studies saved before 4.2.0 have no places.
        ...(study.places ? [createTextElement("div", "study-places", study.places)] : []),
    ];
    card.append(createTitleLink(study, card), ...details, createStudyActions(study, card, options, true));
    return card;
}

function createBlacklistChip(item: string, onRemove: () => void): HTMLElement {
    const chip = document.createElement("div");
    chip.className = "blacklist-card";
    const removeButton = document.createElement("button");
    removeButton.className = "remove-btn";
    removeButton.textContent = "×";
    removeButton.setAttribute("aria-label", `Remove ${item}`);
    removeButton.addEventListener("click", onRemove);
    chip.append(createTextElement("span", "", item), removeButton);
    return chip;
}
