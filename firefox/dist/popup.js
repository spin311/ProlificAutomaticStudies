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
const REVIEW_PROMPT_KEY = "reviewPrompt";
const REVIEW_PROMPT_ANSWERED_AT_KEY = "reviewPromptAnsweredAt";
const REVIEW_PROMPT_MIN_STUDIES = 10;
const SPONSOR_PROMPT_KEY = "sponsorPrompt";
const SPONSOR_PROMPT_MIN_STUDIES = 100;
const SPONSOR_PROMPT_DELAY_MS = 7 * 24 * 60 * 60 * 1000;
const SPONSOR_MILESTONE_URL = "https://github.com/sponsors/spin311?metadata_source=ProlificAutomaticStudies-milestone";
const FIREFOX_REVIEW_URL = "https://addons.mozilla.org/firefox/addon/prolific-studies-notifier/reviews/";
function getReviewUrl() {
    return FIREFOX_REVIEW_URL;
}
// Ask once: any stored answer ('rated' or 'dismissed') hides the card for good.
function shouldShowReviewPrompt(notifiedCount, answer, reviewUrl) {
    if (reviewUrl === null || answer === "rated" || answer === "dismissed")
        return false;
    return typeof notifiedCount === "number" && notifiedCount >= REVIEW_PROMPT_MIN_STUDIES;
}
// The sponsor ask comes after the review ask is settled: either there is no review
// card for this build, or it was answered at least a week ago.
function shouldShowSponsorPrompt(state) {
    const { notifiedCount, reviewUrl, reviewAnswer, reviewAnsweredAt, sponsorAnswer, now } = state;
    if (sponsorAnswer === "clicked" || sponsorAnswer === "dismissed")
        return false;
    if (typeof notifiedCount !== "number" || notifiedCount < SPONSOR_PROMPT_MIN_STUDIES)
        return false;
    if (reviewUrl === null)
        return true;
    const isReviewAnswered = reviewAnswer === "rated" || reviewAnswer === "dismissed";
    return isReviewAnswered && typeof reviewAnsweredAt === "number" && now - reviewAnsweredAt >= SPONSOR_PROMPT_DELAY_MS;
}
// At most one card, so the popup never asks twice at once.
function getDuePrompt(state) {
    if (shouldShowReviewPrompt(state.notifiedCount, state.reviewAnswer, state.reviewUrl))
        return "review";
    return shouldShowSponsorPrompt(state) ? "sponsor" : null;
}
function setupPrompts(notifiedCount) {
    return __awaiter(this, void 0, void 0, function* () {
        // The prompts are optional: a failing storage read must not stop the rest of the popup.
        try {
            yield showDuePrompt(notifiedCount);
        }
        catch (error) {
            console.error("Could not set up the review and sponsor prompts", error);
        }
    });
}
function showDuePrompt(notifiedCount) {
    return __awaiter(this, void 0, void 0, function* () {
        const reviewUrl = getReviewUrl();
        const stored = yield browser.storage.sync.get([REVIEW_PROMPT_KEY, REVIEW_PROMPT_ANSWERED_AT_KEY, SPONSOR_PROMPT_KEY]);
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
            const answerReview = (value) => browser.storage.sync.set({ [REVIEW_PROMPT_KEY]: value, [REVIEW_PROMPT_ANSWERED_AT_KEY]: Date.now() });
            showPromptCard("review", notifiedCount, () => __awaiter(this, void 0, void 0, function* () {
                // Store the answer first: the popup can close as soon as the tab opens.
                yield answerReview("rated");
                yield browser.tabs.create({ url: reviewUrl, active: true });
            }), () => answerReview("dismissed"));
        }
        else if (due === "sponsor") {
            showPromptCard("sponsor", notifiedCount, () => __awaiter(this, void 0, void 0, function* () {
                yield browser.storage.sync.set({ [SPONSOR_PROMPT_KEY]: "clicked" });
                yield browser.tabs.create({ url: SPONSOR_MILESTONE_URL, active: true });
            }), () => browser.storage.sync.set({ [SPONSOR_PROMPT_KEY]: "dismissed" }));
        }
    });
}
// Shows one prompt card (element ids are "<name>Prompt", "<name>Start" or "reviewRate", ...)
// and hides the header Sponsor button meanwhile: one ask at a time.
function showPromptCard(name, notifiedCount, onPrimary, onDismiss) {
    const card = document.getElementById(`${name}Prompt`);
    const primary = document.getElementById(name === "review" ? "reviewRate" : "sponsorStart");
    const dismiss = document.getElementById(name === "review" ? "reviewDismiss" : "sponsorDismiss");
    if (!card || !primary || !dismiss)
        return;
    const countElement = document.getElementById(`${name}PromptCount`);
    if (countElement)
        countElement.textContent = String(notifiedCount);
    const sponsorButton = document.getElementById("sponsorButton");
    card.hidden = false;
    if (sponsorButton)
        sponsorButton.hidden = true;
    const close = () => {
        card.hidden = true;
        if (sponsorButton)
            sponsorButton.hidden = false;
    };
    primary.addEventListener("click", () => __awaiter(this, void 0, void 0, function* () {
        close();
        yield onPrimary();
    }));
    dismiss.addEventListener("click", () => __awaiter(this, void 0, void 0, function* () {
        close();
        yield onDismiss();
    }));
}
const OPENED_STUDY_IDS = "openedStudyIds";
// Weeks of studies; the oldest drop off first.
const OPENED_STUDY_IDS_LIMIT = 1000;
const MIDDLE_BUTTON = 1;
let openedStudyIds = [];
function addOpenedStudyId(ids, id) {
    return [...ids.filter((openedId) => openedId !== id), id].slice(-OPENED_STUDY_IDS_LIMIT);
}
// A redraw's storage read can predate a study opened while it was pending, so it adds
// to what this page already knows instead of replacing it. Nothing else removes ids.
function mergeOpenedStudyIds(stored, known) {
    const storedIds = new Set(stored);
    return [...stored, ...known.filter((id) => !storedIds.has(id))].slice(-OPENED_STUDY_IDS_LIMIT);
}
// Starts the storage writes before anything else: a left click opens a tab, and the
// popup can close as soon as it does.
function markStudyOpened(id, row) {
    openedStudyIds = addOpenedStudyId(openedStudyIds, id);
    const saved = browser.storage.local.set({ [OPENED_STUDY_IDS]: openedStudyIds });
    flushStudiesScrollSave();
    row.classList.add("is-opened");
    return saved;
}
// Saved ("bookmarked") studies are full copies under their own key, so trimming or
// clearing the history never removes them.
const BOOKMARKED_STUDIES = "bookmarkedStudies";
const STUDIES_VIEW = "studiesView";
// List: one compact row per study, so several fit in the 600 px popup. Cards: the
// pre-4.2.0 look, with the full title and one labelled line per detail.
const STUDIES_LAYOUT = "studiesLayout";
function toggleBookmark(bookmarks, study) {
    const isSaved = bookmarks.some((saved) => saved.id === study.id);
    return isSaved ? bookmarks.filter((saved) => saved.id !== study.id) : [...bookmarks, study];
}
// Reads the list again first, like Delete: another popup or tab may have changed it.
function toggleStudyBookmark(study) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const result = yield browser.storage.local.get(BOOKMARKED_STUDIES);
        const bookmarks = (_a = result[BOOKMARKED_STUDIES]) !== null && _a !== void 0 ? _a : [];
        yield browser.storage.local.set({ [BOOKMARKED_STUDIES]: toggleBookmark(bookmarks, study) });
        yield populateStudies();
    });
}
// Each button stores its value under the key, then the list is drawn again from the top.
function setupStudiesSwitch(storageKey, buttons) {
    buttons.forEach(([elementId, value]) => {
        var _a;
        (_a = document.getElementById(elementId)) === null || _a === void 0 ? void 0 : _a.addEventListener("click", () => __awaiter(this, void 0, void 0, function* () {
            yield browser.storage.local.set({ [storageKey]: value });
            yield showStudiesFromTop();
        }));
    });
}
function setupStudiesView() {
    setupStudiesSwitch(STUDIES_VIEW, [["view-all", "all"], ["view-saved", "saved"]]);
}
function setupStudiesLayout() {
    setupStudiesSwitch(STUDIES_LAYOUT, [["layout-list", "list"], ["layout-cards", "cards"]]);
}
function setPressed(elementId, isPressed) {
    var _a;
    (_a = document.getElementById(elementId)) === null || _a === void 0 ? void 0 : _a.setAttribute("aria-pressed", String(isPressed));
}
function showStudiesViewState(view, layout, savedCount) {
    setPressed("view-all", view === "all");
    setPressed("view-saved", view === "saved");
    setPressed("layout-list", layout === "list");
    setPressed("layout-cards", layout === "cards");
    const countElement = document.getElementById("saved-count");
    if (countElement)
        countElement.textContent = String(savedCount);
}
// The same page as the popup, opened as a tab: it can use the whole window and stays
// open while studies are opened from it, which a popup can't do.
const TAB_VIEW_URL = "popup/popup.html?view=tab";
function isTabView() {
    var _a, _b;
    return /[?&]view=tab(&|$)/.test((_b = (_a = globalThis.location) === null || _a === void 0 ? void 0 : _a.search) !== null && _b !== void 0 ? _b : "");
}
function setupTabView() {
    const openInTab = document.getElementById("openInTab");
    if (isTabView()) {
        document.body.classList.add("is-tab");
        if (openInTab)
            openInTab.hidden = true;
        return;
    }
    openInTab === null || openInTab === void 0 ? void 0 : openInTab.addEventListener("click", () => browser.tabs.create({ url: browser.runtime.getURL(TAB_VIEW_URL) }));
}
const STUDY_LIST_KEYS = ["currentStudies", BOOKMARKED_STUDIES, OPENED_STUDY_IDS];
function isStudiesSectionShown() {
    const studies = document.getElementById("studies");
    return studies !== null && !studies.hidden;
}
// Keeps an open popup or tab current while studies are found, saved or opened elsewhere.
function watchStudyChanges() {
    browser.storage.onChanged.addListener((changes, areaName) => __awaiter(this, void 0, void 0, function* () {
        const isListChange = areaName === "local" && STUDY_LIST_KEYS.some((key) => key in changes);
        if (isListChange && isStudiesSectionShown())
            yield populateStudies();
    }));
}
const SEARCH_STUDIES = "searchStudies";
const STUDIES_SCROLL = "studiesScroll";
// Reopening soon after opening a study lands where the list was left; later, at the top.
const SCROLL_RESTORE_MAX_AGE_MS = 10 * 60 * 1000;
const SCROLL_SAVE_DELAY_MS = 150;
function getStudiesContainer() {
    return document.getElementById("studies-container");
}
function restoreStudiesScroll() {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield browser.storage.local.get(STUDIES_SCROLL);
        const saved = result[STUDIES_SCROLL];
        if (typeof (saved === null || saved === void 0 ? void 0 : saved.top) !== "number" || typeof (saved === null || saved === void 0 ? void 0 : saved.at) !== "number")
            return;
        if (Date.now() - saved.at > SCROLL_RESTORE_MAX_AGE_MS)
            return;
        getStudiesContainer().scrollTop = saved.top;
        // Counts from this open, not from the last scroll.
        yield browser.storage.local.set({ [STUDIES_SCROLL]: { top: saved.top, at: Date.now() } });
    });
}
let pendingScrollSave;
function saveStudiesScroll() {
    clearTimeout(pendingScrollSave);
    pendingScrollSave = undefined;
    return browser.storage.local.set({ [STUDIES_SCROLL]: { top: getStudiesContainer().scrollTop, at: Date.now() } });
}
// The popup is destroyed when it closes (e.g. after a click opens a study), so the
// position is saved as the user scrolls.
function watchStudiesScroll() {
    getStudiesContainer().addEventListener("scroll", () => {
        clearTimeout(pendingScrollSave);
        pendingScrollSave = setTimeout(saveStudiesScroll, SCROLL_SAVE_DELAY_MS);
    });
}
// Opening a study can close the popup before a pending save runs.
function flushStudiesScrollSave() {
    if (pendingScrollSave !== undefined)
        void saveStudiesScroll();
}
const FOCUSABLE_ROW_CONTROLS = ["study-title", "open-btn", "save-btn", "delete-btn"];
function getFocusedRowControl(container) {
    const active = document.activeElement;
    if (!active)
        return null;
    const rows = Array.from(container.children);
    const rowIndex = rows.findIndex((row) => row.contains(active));
    const control = FOCUSABLE_ROW_CONTROLS.find((name) => active.classList.contains(name));
    if (rowIndex === -1 || !control)
        return null;
    return { studyId: rows[rowIndex].getAttribute("data-study-id"), control, rowIndex };
}
// Puts focus back on the same control of the same study, or of the row that took the
// place of a deleted one, so keyboard users don't drop back to the top of the page.
function restoreRowFocus(container, focused) {
    var _a, _b;
    const rows = Array.from(container.children);
    const row = (_a = rows.find((candidate) => candidate.getAttribute("data-study-id") === focused.studyId)) !== null && _a !== void 0 ? _a : rows[Math.min(focused.rowIndex, rows.length - 1)];
    (_b = row === null || row === void 0 ? void 0 : row.querySelector(`.${focused.control}`)) === null || _b === void 0 ? void 0 : _b.focus({ preventScroll: true });
}
// Swaps the rows in one step, then puts back the scroll position and keyboard focus.
// Emptying the list first would let the browser clamp the scroll position to 0 while
// the storage read is pending.
function replaceKeepingScroll(container, nodes) {
    const scrollTop = container.scrollTop;
    const focused = getFocusedRowControl(container);
    container.replaceChildren(...nodes);
    container.scrollTop = scrollTop;
    if (focused)
        restoreRowFocus(container, focused);
}
function showStudiesFromTop() {
    return __awaiter(this, arguments, void 0, function* (search = "") {
        yield populateStudies(search);
        getStudiesContainer().scrollTop = 0;
    });
}
function setVolume(volume) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield browser.storage.sync.get("volume");
        const vol = result["volume"];
        if (vol !== undefined) {
            volume.value = String(vol);
        }
        volume.addEventListener("change", function () {
            return __awaiter(this, void 0, void 0, function* () {
                yield browser.storage.sync.set({ ["volume"]: parseFloat(volume.value) });
            });
        });
    });
}
document.addEventListener('DOMContentLoaded', function () {
    return __awaiter(this, void 0, void 0, function* () {
        yield browser.browserAction.setBadgeText({ text: '' });
        const counter = document.getElementById("counter");
        const playAudio = document.getElementById("playAudio");
        const resetValuesBtn = document.getElementById("resetValues");
        const donateText = document.getElementById('donateText');
        const donateImg = document.getElementById('donateImg');
        const downloadCSVButton = document.getElementById("downloadCSV");
        if (donateImg && donateText) {
            donateText.addEventListener('mouseover', function () {
                donateImg.style.visibility = 'visible';
            });
        }
        yield renderPopup();
        setTabState("settings-tab", "settings");
        setTabState("filters-tab", "filters");
        setTabState("studies-tab", "studies");
        setupTabView();
        setupStudiesView();
        setupStudiesLayout();
        // The saved search must be in the box before the first list is drawn.
        yield setupSearch();
        yield setCurrentActiveTab();
        // A tab keeps its own scroll position; only the popup is rebuilt on every open.
        if (!isTabView()) {
            yield restoreStudiesScroll();
            watchStudiesScroll();
        }
        watchStudyChanges();
        yield setBlacklist();
        if (counter) {
            const notifiedCount = yield setCounter(counter);
            yield setupPrompts(notifiedCount);
        }
        if (playAudio) {
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
});
function setCounter(counter) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield browser.storage.sync.get("counter");
        const count = result["counter"];
        if (count !== undefined) {
            counter.innerText = count.toString();
        }
        return typeof count === "number" ? count : 0;
    });
}
function playAlert() {
    return __awaiter(this, void 0, void 0, function* () {
        yield browser.runtime.sendMessage({
            type: 'play-sound',
            target: 'background',
        });
        const playAudio = document.getElementById("playAudio");
        playAudio.disabled = true;
        playAudio.classList.remove("btn-success");
        playAudio.classList.add("btn-fail");
        setTimeout(() => {
            playAudio.disabled = false;
            playAudio.classList.remove("btn-fail");
            playAudio.classList.add("btn-success");
        }, 500);
    });
}
function resetValues() {
    return __awaiter(this, void 0, void 0, function* () {
        yield browser.runtime.sendMessage({
            type: 'resetValues',
            target: 'background',
        });
        yield new Promise(resolve => setTimeout(resolve, 150));
        yield renderPopup();
    });
}
// New columns go last, so spreadsheets built on older exports keep working.
const CSV_COLUMNS = [
    "id", "title", "researcher", "reward", "rewardPerHour",
    "time", "timeInMinutes", "createdAt", "places"
];
function buildStudiesCsv(studies) {
    const rows = studies.map((study) => CSV_COLUMNS.map((column) => {
        const value = study[column];
        if (value === null || value === undefined)
            return "";
        return `"${String(value).replace(/"/g, '""')}"`;
    }).join(","));
    return [CSV_COLUMNS.join(","), ...rows].join("\n");
}
function downloadStudies() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const result = yield browser.storage.local.get("currentStudies");
        const studies = (_a = result["currentStudies"]) !== null && _a !== void 0 ? _a : [];
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
    });
}
// Day/month and time: the history only holds recent studies, so the year adds nothing.
function formatDate(dateStr) {
    const date = new Date(dateStr);
    const pad = (value) => (value < 10 ? `0${value}` : String(value));
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function setSelectState(elementId, storageKey, callback) {
    return __awaiter(this, void 0, void 0, function* () {
        const element = document.getElementById(elementId);
        if (!element)
            return;
        const result = yield browser.storage.sync.get(storageKey);
        if (result[storageKey] !== undefined) {
            element.value = result[storageKey];
        }
        element.addEventListener("change", () => __awaiter(this, void 0, void 0, function* () {
            yield browser.storage.sync.set({ [storageKey]: element.value });
            if (callback) {
                callback();
            }
        }));
    });
}
function parseMoney(value) {
    return parseFloat((value === null || value === void 0 ? void 0 : value.replace(/[^\d.]/g, "")) || "0");
}
function parseTime(value) {
    if (!value)
        return 0;
    const hourMatch = value.match(/(\d+)\s*hour/);
    const minMatch = value.match(/(\d+)\s*min/);
    const hours = hourMatch ? parseInt(hourMatch[1], 10) : 0;
    const minutes = minMatch ? parseInt(minMatch[1], 10) : 0;
    return hours * 60 + minutes;
}
function parseDate(value) {
    return new Date(value || "").getTime() || 0;
}
function setTabState(elementId, storageValue) {
    const element = document.getElementById(elementId);
    if (!element)
        return;
    element.addEventListener("click", function () {
        return __awaiter(this, void 0, void 0, function* () {
            yield browser.storage.sync.set({ ["activeTab"]: storageValue });
            yield changeTab(storageValue);
        });
    });
}
const POPUP_TABS = ["settings", "studies", "filters"];
function setCurrentActiveTab() {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield browser.storage.sync.get("activeTab");
        const savedTab = result["activeTab"];
        if (isTabView()) {
            yield changeTab("studies");
            return;
        }
        // A missing or unknown tab would hide every section, leaving only the tab bar.
        yield changeTab(POPUP_TABS.includes(savedTab) ? savedTab : "settings");
    });
}
function populateStudies() {
    return __awaiter(this, arguments, void 0, function* (search = '', sort = "") {
        var _a, _b, _c;
        if (!search) {
            const searchInput = document.getElementById("search-studies");
            search = searchInput.value;
        }
        if (!sort) {
            const result = yield browser.storage.sync.get("sortStudies");
            sort = result["sortStudies"];
        }
        const studiesContainer = getStudiesContainer();
        const result = yield browser.storage.local.get(["currentStudies", OPENED_STUDY_IDS, BOOKMARKED_STUDIES, STUDIES_VIEW, STUDIES_LAYOUT]);
        const bookmarks = (_a = result[BOOKMARKED_STUDIES]) !== null && _a !== void 0 ? _a : [];
        const view = result[STUDIES_VIEW] === "saved" ? "saved" : "all";
        const layout = result[STUDIES_LAYOUT] === "cards" ? "cards" : "list";
        openedStudyIds = mergeOpenedStudyIds((_b = result[OPENED_STUDY_IDS]) !== null && _b !== void 0 ? _b : [], openedStudyIds);
        showStudiesViewState(view, layout, bookmarks.length);
        let currentStudies = view === "saved" ? [...bookmarks] : [...((_c = result["currentStudies"]) !== null && _c !== void 0 ? _c : [])];
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
                var _a, _b;
                const title = ((_a = study.title) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || "";
                const researcher = ((_b = study.researcher) === null || _b === void 0 ? void 0 : _b.toLowerCase()) || "";
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
    });
}
// Deletes from everything saved, not only the studies the search shows, and reads the
// list again first: the content script may have added studies since it was drawn.
function deleteStudy(id) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const result = yield browser.storage.local.get("currentStudies");
        const saved = (_a = result["currentStudies"]) !== null && _a !== void 0 ? _a : [];
        yield browser.storage.local.set({ currentStudies: saved.filter((study) => study.id !== id) });
        yield populateStudies();
    });
}
function setupSearch() {
    return __awaiter(this, void 0, void 0, function* () {
        const searchInput = document.getElementById("search-studies");
        if (!searchInput)
            return;
        searchInput.addEventListener("input", function () {
            return __awaiter(this, void 0, void 0, function* () {
                const searchValue = searchInput.value;
                // Kept until the box is cleared, so it survives the popup closing after a click.
                yield browser.storage.local.set({ [SEARCH_STUDIES]: searchValue });
                yield showStudiesFromTop(searchValue);
            });
        });
        const result = yield browser.storage.local.get(SEARCH_STUDIES);
        searchInput.value = result[SEARCH_STUDIES] || "";
    });
}
function changeTab(activeTab) {
    return __awaiter(this, void 0, void 0, function* () {
        const windows = [{ tab: "settings", item: "settings-tab" },
            { tab: "filters", item: "filters-tab" },
            { tab: "studies", item: "studies-tab" }
        ];
        windows.forEach(window => {
            const currentTab = window.tab;
            const currentItem = window.item;
            const currentTabElement = document.getElementById(currentTab);
            const currentItemElement = document.getElementById(currentItem);
            // The hidden attribute, not an inline display, so the CSS can lay a section out
            // (the Studies section is a flex column whose list shrinks to fit the popup).
            currentTabElement.hidden = activeTab !== currentTab;
            if (activeTab === currentTab) {
                currentItemElement.classList.add("active");
            }
            else {
                currentItemElement.classList.remove("active");
            }
        });
        if (activeTab === 'studies') {
            yield populateStudies();
        }
        else if (activeTab === 'filters') {
            yield populateBlacklists();
        }
    });
}
function setAlertState() {
    return __awaiter(this, void 0, void 0, function* () {
        const websiteButton = document.getElementById("websiteBtn");
        const titleButton = document.getElementById("titleBtn");
        const trackIds = document.getElementById("trackIds");
        const trackIdsLabel = document.getElementById("trackIdsLabel");
        const history = document.getElementById("studyHistoryLen");
        const historyLabel = document.getElementById("study-history-len-label");
        const fastMode = document.getElementById("fastMode");
        const fastModeLabel = document.getElementById("fastMode-label");
        const fastModeInterval = document.getElementById("fastModeInterval");
        const fastModeIntervalLabel = document.getElementById("fastModeInterval-label");
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
        const setActiveButton = (activeBtn, inactiveBtn) => {
            activeBtn.classList.add("active");
            inactiveBtn.classList.remove("active");
        };
        const result = yield browser.storage.sync.get("useOld");
        if (result["useOld"]) {
            disableControls();
            setActiveButton(titleButton, websiteButton);
        }
        else {
            enableControls();
            setActiveButton(websiteButton, titleButton);
        }
        websiteButton.addEventListener("click", () => __awaiter(this, void 0, void 0, function* () {
            enableControls();
            setActiveButton(websiteButton, titleButton);
            yield browser.storage.sync.set({ useOld: false });
            const tabs = yield browser.tabs.query({ url: "*://app.prolific.com/*" });
            tabs.forEach(tab => {
                browser.tabs.sendMessage(tab.id, {
                    type: 'change-alert-type',
                    target: 'everything',
                    data: "website"
                });
            });
        }));
        titleButton.addEventListener("click", () => __awaiter(this, void 0, void 0, function* () {
            disableControls();
            setActiveButton(titleButton, websiteButton);
            yield browser.storage.sync.set({ useOld: true });
            const tabs = yield browser.tabs.query({ url: "*://app.prolific.com/*" });
            tabs.forEach(tab => {
                browser.tabs.sendMessage(tab.id, {
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
        }));
    });
}
function setCheckboxState(elementId_1, storageKey_1) {
    return __awaiter(this, arguments, void 0, function* (elementId, storageKey, storageArea = browser.storage.sync) {
        const element = document.getElementById(elementId);
        if (!element)
            return;
        const result = yield storageArea.get(storageKey);
        if (result[storageKey] !== undefined) {
            element.checked = result[storageKey];
        }
        element.addEventListener("click", function () {
            return __awaiter(this, void 0, void 0, function* () {
                yield storageArea.set({ [storageKey]: element.checked });
            });
        });
    });
}
function setInputState(elementId_1, storageKey_1) {
    return __awaiter(this, arguments, void 0, function* (elementId, storageKey, storageArea = browser.storage.sync) {
        const element = document.getElementById(elementId);
        if (!element)
            return;
        const result = yield storageArea.get(storageKey);
        if (result[storageKey] !== undefined) {
            element.value = result[storageKey];
        }
        element.addEventListener("change", function () {
            return __awaiter(this, void 0, void 0, function* () {
                yield storageArea.set({ [storageKey]: parseFloat(element.value) });
            });
        });
    });
}
function handleBlacklistInputs() {
    return __awaiter(this, void 0, void 0, function* () {
        yield handleBlacklistInput("blacklist-name", "nameBlacklist", "name-list");
        yield handleBlacklistInput("blacklist-researcher", "researcherBlacklist", "researcher-list");
    });
}
function handleBlacklistInput(inputId, storageKey, listId) {
    return __awaiter(this, void 0, void 0, function* () {
        const blacklistInput = document.getElementById(inputId);
        yield appendBlacklistInput(blacklistInput === null || blacklistInput === void 0 ? void 0 : blacklistInput.value, storageKey);
        blacklistInput.value = '';
        yield populateBlacklist(listId, storageKey);
    });
}
function setBlacklist() {
    return __awaiter(this, void 0, void 0, function* () {
        const blacklistButton = document.getElementById("submit-blacklist");
        const blacklistNameInput = document.getElementById("blacklist-name");
        const blacklistResearcherInput = document.getElementById("blacklist-researcher");
        blacklistNameInput.addEventListener("keydown", (e) => __awaiter(this, void 0, void 0, function* () {
            if (e.key === "Enter") {
                yield handleBlacklistInput("blacklist-name", "nameBlacklist", "name-list");
            }
        }));
        blacklistResearcherInput.addEventListener("keydown", (e) => __awaiter(this, void 0, void 0, function* () {
            if (e.key === "Enter") {
                yield handleBlacklistInput("blacklist-researcher", "researcherBlacklist", "researcher-list");
            }
        }));
        if (!blacklistButton)
            return;
        blacklistButton.addEventListener("click", function () {
            return __awaiter(this, void 0, void 0, function* () {
                yield handleBlacklistInputs();
            });
        });
    });
}
function appendBlacklistInput(value, storageKey) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!value)
            return;
        const currentValue = value.toLowerCase();
        let newValues;
        const currentValues = yield browser.storage.sync.get(storageKey);
        const result = currentValues[storageKey];
        if (result !== undefined && !result.includes(currentValue)) {
            newValues = [...result, currentValue];
        }
        else {
            newValues = [currentValue];
        }
        yield browser.storage.sync.set({ [storageKey]: newValues });
    });
}
function populateBlacklists() {
    return __awaiter(this, void 0, void 0, function* () {
        yield populateBlacklist("name-list", "nameBlacklist");
        yield populateBlacklist("researcher-list", "researcherBlacklist");
    });
}
function populateBlacklist(listId_1, storageKey_1) {
    return __awaiter(this, arguments, void 0, function* (listId, storageKey, values = []) {
        const blacklistContainer = document.getElementById(listId);
        blacklistContainer.replaceChildren();
        let currentItems;
        if (values.length === 0) {
            const result = yield browser.storage.sync.get(storageKey);
            currentItems = result[storageKey] || [];
        }
        else {
            currentItems = values;
        }
        currentItems.forEach((item, index) => {
            blacklistContainer.append(createBlacklistChip(item, () => __awaiter(this, void 0, void 0, function* () {
                const remaining = currentItems.filter((_, i) => i !== index);
                yield browser.storage.sync.set({ [storageKey]: remaining });
                yield populateBlacklist(listId, storageKey, remaining);
            })));
        });
    });
}
function renderPopup() {
    return __awaiter(this, void 0, void 0, function* () {
        yield setCheckboxState("autoAudio", "audioActive");
        yield setCheckboxState("showNotification", "showNotification");
        yield setCheckboxState("openProlific", "openProlific");
        yield setCheckboxState("focusProlific", "focusProlific");
        yield setCheckboxState("trackIds", "trackIds");
        yield setCheckboxState("fastMode", "fastMode", browser.storage.local);
        yield setInputState("reward", "reward");
        yield setInputState("rewardPerHour", "rewardPerHour");
        yield setInputState("time", "time");
        yield setInputState("studyHistoryLen", "studyHistoryLen");
        yield setInputState("fastModeInterval", "fastModeInterval", browser.storage.local);
        yield setAlertState();
        yield setSelectState("selectAudio", "audio");
        yield setSelectState("sort-studies", "sortStudies", () => showStudiesFromTop());
        const volume = document.getElementById("volume");
        if (volume) {
            yield setVolume(volume);
        }
    });
}
// Study text comes from Prolific's page (researchers write it) and blacklist words
// from the user, so both are only ever inserted as text, never parsed as HTML.
function createTextElement(tagName, className, text) {
    const element = document.createElement(tagName);
    element.className = className;
    element.textContent = text;
    return element;
}
function getStudyUrl(study) {
    var _a;
    return `https://app.prolific.com/studies/${encodeURIComponent((_a = study.id) !== null && _a !== void 0 ? _a : "")}`;
}
// A real link, so right-click > Copy link and middle-click work on it.
function createStudyLink(study, className, text) {
    const link = document.createElement("a");
    link.className = className;
    link.href = getStudyUrl(study);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = text;
    return link;
}
function getStudyMeta(study) {
    const rewardPerHour = study.rewardPerHour ? `${study.rewardPerHour}/hr` : null;
    return [study.reward, rewardPerHour, study.time, study.places].filter(Boolean).join(" · ");
}
function watchStudyOpened(link, study, row) {
    const id = study.id;
    if (!id)
        return;
    link.addEventListener("click", () => markStudyOpened(id, row));
    link.addEventListener("auxclick", (event) => {
        if (event.button === MIDDLE_BUTTON)
            return markStudyOpened(id, row);
    });
}
// Cards spell out what the buttons do; list rows only have room for icons.
function createSaveButton(study, options, isLabelled) {
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
function createDeleteButton(study, onDelete, isLabelled) {
    const button = document.createElement("button");
    button.className = isLabelled ? "btn text-btn delete-btn" : "icon-btn delete-btn";
    button.title = "Delete";
    button.setAttribute("aria-label", `Delete ${study.title || "study"}`);
    const trashIcon = document.createElement("img");
    trashIcon.src = "/svgs/trash.svg";
    trashIcon.alt = "";
    button.append(trashIcon);
    if (isLabelled)
        button.append("Delete");
    button.addEventListener("click", onDelete);
    return button;
}
function createStudyShell(study, options, layoutClass) {
    var _a;
    const item = document.createElement("div");
    item.className = ["study-card", layoutClass, options.isOpened ? "is-opened" : ""].filter(Boolean).join(" ");
    item.setAttribute("data-study-id", (_a = study.id) !== null && _a !== void 0 ? _a : "");
    return item;
}
function createTitleLink(study, item) {
    const title = createStudyLink(study, "study-title", study.title || "Untitled");
    title.title = study.title || "";
    watchStudyOpened(title, study, item);
    return title;
}
function createOpenLink(study, item, isLabelled) {
    const openLink = createStudyLink(study, "btn open-btn normal-link", isLabelled ? "Open ↗" : "↗");
    openLink.title = "Open in a new tab";
    // The title link opens the same page, so a row's small arrow is left out of the
    // Tab order. A card's labelled Open button is a visible control and keeps its stop.
    if (!isLabelled)
        openLink.tabIndex = -1;
    openLink.setAttribute("aria-label", `Open ${study.title || "study"} in a new tab`);
    watchStudyOpened(openLink, study, item);
    return openLink;
}
function createStudyActions(study, item, options, isLabelled) {
    const actions = document.createElement("div");
    actions.className = "study-actions";
    actions.append(createOpenLink(study, item, isLabelled), createSaveButton(study, options, isLabelled));
    if (options.onDelete)
        actions.append(createDeleteButton(study, options.onDelete, isLabelled));
    return actions;
}
// The researcher and when the study was found, on one line.
function createStudySub(study) {
    const sub = document.createElement("div");
    sub.className = "study-sub";
    sub.append(createTextElement("span", "study-researcher", study.researcher || "Unknown"), createTextElement("span", "study-created-at", study.createdAt ? formatDate(study.createdAt) : ""));
    return sub;
}
function createStudyRow(study, options) {
    const row = createStudyShell(study, options, "is-compact");
    row.append(createTitleLink(study, row), createTextElement("div", "study-meta", getStudyMeta(study)), createStudySub(study), createStudyActions(study, row, options, false));
    return row;
}
function createLabeledText(className, label, value) {
    const element = document.createElement("div");
    element.className = className;
    const labelElement = document.createElement("strong");
    labelElement.textContent = label;
    element.append(labelElement, ` ${value}`);
    return element;
}
function createStudyCard(study, options) {
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
function createBlacklistChip(item, onRemove) {
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
