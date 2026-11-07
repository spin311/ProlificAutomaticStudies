const REVIEW_PROMPT_KEY = "reviewPrompt";
const REVIEW_PROMPT_MIN_STUDIES = 10;

// Store review pages. Chrome: only the Web Store build gets the prompt, so unpacked
// dev builds and other listings (e.g. Edge Add-ons) never point at the wrong store.
const CHROME_STORE_EXTENSION_ID = "mlicfddkgjkeajfgkihplfbgpmbonbao";
const CHROME_REVIEW_URL = `https://chromewebstore.google.com/detail/prolific-studies-notifier/${CHROME_STORE_EXTENSION_ID}/reviews`;

function getReviewUrl(extensionId: string | undefined): string | null {
    return extensionId === CHROME_STORE_EXTENSION_ID ? CHROME_REVIEW_URL : null;
}

// Ask once: any stored answer ('rated' or 'dismissed') hides the card for good.
function shouldShowReviewPrompt(notifiedCount: unknown, answer: unknown, reviewUrl: string | null): boolean {
    if (reviewUrl === null || answer === "rated" || answer === "dismissed") return false;
    return typeof notifiedCount === "number" && notifiedCount >= REVIEW_PROMPT_MIN_STUDIES;
}

async function setupReviewPrompt(notifiedCount: number): Promise<void> {
    // The prompt is optional: a failing storage read must not stop the rest of the popup.
    try {
        await showReviewPromptIfDue(notifiedCount);
    } catch (error) {
        console.error("Could not set up the review prompt", error);
    }
}

async function showReviewPromptIfDue(notifiedCount: number): Promise<void> {
    const card = document.getElementById("reviewPrompt");
    const rateButton = document.getElementById("reviewRate");
    const dismissButton = document.getElementById("reviewDismiss");
    if (!card || !rateButton || !dismissButton) return;
    const reviewUrl = getReviewUrl(chrome.runtime.id);
    const stored = await chrome.storage.sync.get(REVIEW_PROMPT_KEY);
    if (reviewUrl === null || !shouldShowReviewPrompt(notifiedCount, stored[REVIEW_PROMPT_KEY], reviewUrl)) return;

    const countElement = document.getElementById("reviewPromptCount");
    if (countElement) countElement.textContent = String(notifiedCount);
    card.hidden = false;
    // One ask at a time: the Sponsor button waits until the card is answered.
    const sponsorButton = document.getElementById("sponsorButton");
    if (sponsorButton) sponsorButton.hidden = true;

    const answer = async (value: "rated" | "dismissed"): Promise<void> => {
        card.hidden = true;
        if (sponsorButton) sponsorButton.hidden = false;
        await chrome.storage.sync.set({[REVIEW_PROMPT_KEY]: value});
    };
    rateButton.addEventListener("click", async (): Promise<void> => {
        // Store the answer first: the popup can close as soon as the tab opens.
        await answer("rated");
        await chrome.tabs.create({url: reviewUrl, active: true});
    });
    dismissButton.addEventListener("click", () => answer("dismissed"));
}

async function setVolume(volume: HTMLInputElement) {
    const result = await chrome.storage.sync.get("volume");
    const vol = result["volume"];
    if (vol !== undefined) {
        volume.value =  String(vol);
    }
    volume.addEventListener("change", async function () {
        await chrome.storage.sync.set({["volume"]: parseFloat(volume.value)});
    });

}

document.addEventListener('DOMContentLoaded', async function () {
    await chrome.action.setBadgeText({text: ''});

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
    await setCurrentActiveTab();
    await setBlacklist();

    await setupSearch();

    if(counter) {
        const notifiedCount = await setCounter(counter);
        await setupReviewPrompt(notifiedCount);
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
    const result = await chrome.storage.sync.get("counter");
    const count = result["counter"];
    if (count !== undefined) {
        counter.innerText = count.toString();
    }
    return typeof count === "number" ? count : 0;
}

async function playAlert(): Promise<void> {
    await chrome.runtime.sendMessage({
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
    await chrome.runtime.sendMessage({
        type: 'resetValues',
        target: 'background',
    });

    await new Promise(resolve => setTimeout(resolve, 150));
    await renderPopup();
}

async function downloadStudies(): Promise<void> {
    const result = await chrome.storage.local.get("currentStudies");
    const studies: Study[] = result["currentStudies"];

    const headers = [
        "id", "title", "researcher", "reward", "rewardPerHour",
        "time", "timeInMinutes", "createdAt"
    ];

    const csvRows = [headers.join(",")];

    studies.forEach(study => {
        const values = headers.map(header => {
            const value = study[header as keyof Study];
            if (value === null || value === undefined) return "";
            return `"${String(value).replace(/"/g, '""')}"`;
        });
        csvRows.push(values.join(","));
    });

    const csvContent = csvRows.join("\n");
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

function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const day = date.getDate() < 10 ? '0' + date.getDate() : date.getDate().toString();
    const month = (date.getMonth() + 1) < 10 ? '0' + (date.getMonth() + 1) : (date.getMonth() + 1).toString();
    const year = date.getFullYear();
    const hours = date.getHours() < 10 ? '0' + date.getHours() : date.getHours().toString();
    const minutes = date.getMinutes() < 10 ? '0' + date.getMinutes() : date.getMinutes().toString();

    return `${day}/${month}/${year} ${hours}:${minutes}`;
}

async function setSelectState(elementId: string, storageKey: string, callback?: () => void) {
    const element = document.getElementById(elementId) as HTMLSelectElement;
    if (!element) return;
    const result = await chrome.storage.sync.get(storageKey);
    if (result[storageKey] !== undefined) {
        element.value = result[storageKey];
    }
    element.addEventListener("change", async (): Promise<void> => {
        await chrome.storage.sync.set({[storageKey]: element.value});
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
        await chrome.storage.sync.set({["activeTab"]: storageValue});
        await changeTab(storageValue);
    });
}

const POPUP_TABS = ["settings", "studies", "filters"];

async function setCurrentActiveTab(): Promise<void> {
    const result = await chrome.storage.sync.get("activeTab");
    const savedTab = result["activeTab"];
    // A missing or unknown tab would hide every section, leaving only the tab bar.
    await changeTab(POPUP_TABS.includes(savedTab) ? savedTab : "settings");
}

async function populateStudies(search: string = '', sort: string = "") {
    if (!search) {
        const searchInput = document.getElementById("search-studies") as HTMLInputElement;
        search = searchInput.value;
    }
    if (!sort) {
        const result = await chrome.storage.sync.get("sortStudies");
        sort = result["sortStudies"];
    }
    const studiesContainer = document.getElementById("studies-container") as HTMLElement;
    studiesContainer.replaceChildren();
    const result = await chrome.storage.local.get("currentStudies");
    const savedStudies: Study[] = result["currentStudies"] ?? [];
    let currentStudies: Study[] = [...savedStudies];

    if (currentStudies.length === 0) {
        studiesContainer.append(createTextElement("p", "text-center", "No studies available."));
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

    currentStudies.forEach((study) => {
        studiesContainer.append(createStudyCard(study, async () => {
            // Delete from everything saved, not only the studies the search shows.
            const remaining = savedStudies.filter((saved) => saved.id !== study.id);
            await chrome.storage.local.set({ currentStudies: remaining });
            await populateStudies();
        }));
    });
}

async function setupSearch() {
    const searchInput = document.getElementById("search-studies") as HTMLInputElement;
    if (!searchInput) return;
    searchInput.addEventListener("input", async function (): Promise<void> {
        const searchValue = searchInput.value;
        await populateStudies(searchValue);
    });
    const result = await chrome.storage.sync.get("searchStudies");
    searchInput.value = result["searchStudies"] || "";

}

async function changeTab(activeTab: string): Promise<void> {
    const windows = [{tab: "settings", item: "settings-tab"},
        {tab: "filters", item: "filters-tab"},
        {tab: "studies", item: "studies-tab"}
    ];
    windows.forEach(window => {
        const currentTab = window.tab;
        const currentItem = window.item;
        const currentTabElement = document.getElementById(currentTab) as HTMLDivElement;
        const currentItemElement = document.getElementById(currentItem)  as HTMLElement;
        if(activeTab === currentTab) {
            currentTabElement.style.display = "block";
            currentItemElement.classList.add("active");
        }
        else {
            currentTabElement.style.display = "none";
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

    const result = await chrome.storage.sync.get("useOld");
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
        await chrome.storage.sync.set({ useOld: false });
        const tabs = await chrome.tabs.query({ url: "*://app.prolific.com/*" });
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id!, {
                type: 'change-alert-type',
                target: 'everything',
                data: "website"
            });
        });
    });

    titleButton.addEventListener("click", async () => {
        disableControls();
        setActiveButton(titleButton, websiteButton);
        await chrome.storage.sync.set({ useOld: true });
        const tabs = await chrome.tabs.query({ url: "*://app.prolific.com/*" });
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id!, {
                type: 'change-alert-type',
                target: 'content',
                data: "title"
            });
        });
        chrome.runtime.sendMessage({
            type: 'change-alert-type',
            target: 'background',
            data: "title"
        });
    });
}


async function setCheckboxState(elementId: string, storageKey: string, storageArea: chrome.storage.StorageArea = chrome.storage.sync): Promise<void> {
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

async function setInputState(elementId: string, storageKey: string, storageArea: chrome.storage.StorageArea = chrome.storage.sync): Promise<void> {
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
    const currentValues = await chrome.storage.sync.get(storageKey);
    const result = currentValues[storageKey];
    if (result !== undefined && !result.includes(currentValue)) {
        newValues = [...result, currentValue];
    } else {
        newValues = [currentValue];
    }
    await chrome.storage.sync.set({ [storageKey]: newValues });
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
        const result = await chrome.storage.sync.get(storageKey);
        currentItems = result[storageKey] || [];
    } else {
        currentItems = values;
    }

    currentItems.forEach((item: string, index: number) => {
        blacklistContainer.append(createBlacklistChip(item, async () => {
            const remaining = currentItems.filter((_: string, i: number) => i !== index);
            await chrome.storage.sync.set({ [storageKey]: remaining });
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
    await setCheckboxState("fastMode", "fastMode", chrome.storage.local);

    await setInputState("reward", "reward");
    await setInputState("rewardPerHour", "rewardPerHour");
    await setInputState("time", "time");
    await setInputState("studyHistoryLen","studyHistoryLen");
    await setInputState("fastModeInterval", "fastModeInterval", chrome.storage.local);

    await setAlertState();
    await setSelectState("selectAudio", "audio");
    await setSelectState("sort-studies", "sortStudies", populateStudies);

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

function createLabeledText(className: string, label: string, value: string): HTMLElement {
    const element = document.createElement("div");
    element.className = className;
    const labelElement = document.createElement("strong");
    labelElement.textContent = label;
    element.append(labelElement, ` ${value}`);
    return element;
}

function createStudyCard(study: Study, onDelete: () => void): HTMLElement {
    const header = document.createElement("div");
    header.className = "study-header";
    const image = document.createElement("img");
    image.src = "/imgs/logo.png";
    image.alt = "";
    image.className = "study-img";
    header.append(image, createTextElement("div", "study-title", study.title || "Untitled"));

    const openLink = document.createElement("a");
    openLink.className = "btn btn-success open-btn normal-link";
    openLink.href = `https://app.prolific.com/studies/${encodeURIComponent(study.id ?? "")}`;
    openLink.target = "_blank";
    openLink.rel = "noopener noreferrer";
    openLink.textContent = "Open";

    const deleteButton = document.createElement("button");
    deleteButton.className = "btn delete-btn";
    const trashIcon = document.createElement("img");
    trashIcon.src = "/svgs/trash.svg";
    trashIcon.alt = "";
    deleteButton.append(trashIcon, " Delete");
    deleteButton.addEventListener("click", onDelete);

    const info = document.createElement("div");
    info.className = "study-info";
    info.append(
        header,
        createTextElement("div", "study-researcher", study.researcher || "Unknown"),
        createLabeledText("study-reward", "Pay:", study.reward || "N/A"),
        createTextElement("div", "study-reward-hour", `${study.rewardPerHour || "N/A"} /hr`),
        createLabeledText("study-time", "Time:", study.time || "N/A"),
        createTextElement("div", "study-created-at", study.createdAt ? formatDate(study.createdAt) : "N/A"),
        openLink,
        deleteButton,
    );
    const card = document.createElement("div");
    card.className = "study-card";
    card.append(info);
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
