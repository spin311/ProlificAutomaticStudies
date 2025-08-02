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
    await setCurrentActiveTab();
    await setBlacklist();

    await setupSearch();

    if(counter) {
        await setCounter(counter);
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

});

async function setCounter(counter: HTMLSpanElement): Promise<void> {
    const result = await browser.storage.sync.get("counter");
    const count = result["counter"];
    if (count !== undefined) {
        counter.innerText = count.toString();
    }
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

async function downloadStudies(): Promise<void> {
    const result = await browser.storage.local.get("currentStudies");
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
    const result = await browser.storage.sync.get(storageKey);
    element.value = result[storageKey];
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

async function setCurrentActiveTab(): Promise<void> {
    const result = await browser.storage.sync.get("activeTab");
    await changeTab(result["activeTab"]);
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
    const studiesContainer = document.getElementById("studies-container") as HTMLElement;
    studiesContainer.innerHTML = "";
    const result = await browser.storage.local.get("currentStudies");
    let currentStudies: Study[] = result["currentStudies"];

    if (!currentStudies || currentStudies.length === 0) {
        studiesContainer.innerHTML = "<p class='text-center'>No studies available.</p>";
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

    currentStudies.forEach((study, index) => {
        const studyCard = document.createElement("div");
        const link = `https://app.prolific.com/studies/${study.id}`;
        const formattedDate = study.createdAt ? formatDate(study.createdAt): 'N/A';
        studyCard.classList.add("study-card");
        studyCard.innerHTML = `
      <div class="study-info">
        <div class="study-header">
          <img src="/imgs/logo.png" alt="Study Image" class="study-img">
          <div class="study-title">${study.title || "Untitled"}</div>      
        </div>
        <div class="study-researcher">${study.researcher || "Unknown"}</div>
        <div class="study-reward"><strong>Pay:</strong> ${study.reward || "N/A"}</div>
        <div class="study-reward-hour">${study.rewardPerHour || "N/A"} &#47;hr</div>
        <div class="study-time"><strong>Time:</strong> ${study.time || "N/A"}</div>
        <div class="study-created-at">${formattedDate}</div>
        <button class="btn btn-success open-btn" data-index="${index}">
          <a href="${link}" target="_blank" rel="noopener noreferrer" class="normal-link white">Open</a>
        </button>
        <button class="btn delete-btn" data-index="${index}">
          <img src="/svgs/trash.svg" alt="trash"> Delete
        </button>
      </div>
    `;
        studiesContainer.appendChild(studyCard);
    });

    studiesContainer.querySelectorAll(".delete-btn").forEach(button => {
        button.addEventListener("click", (e) => {
            const target = e.currentTarget as HTMLElement;
            const index = parseInt(target.getAttribute("data-index") || "", 10);
            currentStudies.splice(index, 1);
            browser.storage.local.set({ currentStudies });
            populateStudies();
        });
    });
}

async function setupSearch() {
    const searchInput = document.getElementById("search-studies") as HTMLInputElement;
    if (!searchInput) return;
    searchInput.addEventListener("input", async function (): Promise<void> {
        const searchValue = searchInput.value;
        await populateStudies(searchValue);
    });
    const result = await browser.storage.sync.get("searchStudies");
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
    const refreshRate = document.getElementById("refreshRate") as HTMLInputElement;
    const refreshRateLabel = document.getElementById("refreshRate-label") as HTMLElement;

    const enableControls = () => {
        [historyLabel, refreshRateLabel, trackIdsLabel].forEach(el => el.classList.remove("disabled-text"));
        [history, refreshRate, trackIds].forEach(el => el.disabled = false);
    };

    const disableControls = () => {
        [historyLabel, refreshRateLabel, trackIdsLabel].forEach(el => el.classList.add("disabled-text"));
        [history, refreshRate, trackIds].forEach(el => el.disabled = true);
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

async function setCheckboxState(elementId: string, storageKey: string): Promise<void> {
    const element = document.getElementById(elementId) as HTMLInputElement;
    if (!element) return;
    const result = await browser.storage.sync.get(storageKey);
    if (result[storageKey] !== undefined) {
        element.checked = result[storageKey];
    }
    element.addEventListener("click", async function (): Promise<void> {
        await browser.storage.sync.set({[storageKey]: element.checked});
    });
}

async function setInputState(elementId: string, storageKey: string): Promise<void> {
    const element = document.getElementById(elementId) as HTMLInputElement;
    if (!element) return;
    const result = await browser.storage.sync.get(storageKey);
    if (result[storageKey] !== undefined) {
        element.value = result[storageKey];
    }
    element.addEventListener("change", async function (): Promise<void> {
        await browser.storage.sync.set({[storageKey]: parseFloat(element.value)});
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
    blacklistContainer.innerHTML = "";
    let currentItems;
    if (values.length === 0) {
        const result = await browser.storage.sync.get(storageKey);
        currentItems = result[storageKey] || [];
    } else {
        currentItems = values;
    }

    currentItems.forEach((item: string, index: number) => {
        const itemCard = document.createElement('div');
        itemCard.classList.add("blacklist-card");
        itemCard.innerHTML = `
        <span>${item}</span> <span class="remove-btn" data-index="${index}">x</span>
        `;
        blacklistContainer.appendChild(itemCard);
    });
    blacklistContainer.querySelectorAll(".remove-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            const target = e.target as HTMLElement;
            const index = parseInt(target.getAttribute("data-index") || "");
            currentItems.splice(index, 1);
            browser.storage.sync.set({ [storageKey]: currentItems });
            populateBlacklist(listId, storageKey, currentItems);
        });
    });
}

async function renderPopup() {
    await setCheckboxState("autoAudio", "audioActive");
    await setCheckboxState("showNotification", "showNotification");
    await setCheckboxState("openProlific", "openProlific");
    await setCheckboxState("focusProlific", "focusProlific");
    await setCheckboxState("trackIds", "trackIds");

    await setInputState("reward", "reward");
    await setInputState("rewardPerHour", "rewardPerHour");
    await setInputState("time", "time");
    await setInputState("studyHistoryLen","studyHistoryLen");
    await setInputState("refreshRate", "refreshRate");

    await setAlertState();
    await setSelectState("selectAudio", "audio");
    await setSelectState("sort-studies", "sortStudies", populateStudies);

    const volume = document.getElementById("volume") as HTMLInputElement;
    if (volume) {
        await setVolume(volume);
    }
}