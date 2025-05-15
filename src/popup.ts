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
    await chrome.runtime.sendMessage({
        type: 'clear-badge',
        target: 'background',
    });

    const selectAudio = document.getElementById("selectAudio") as HTMLSelectElement;
    const counter = document.getElementById("counter") as HTMLSpanElement;
    const playAudio = document.getElementById("playAudio") as HTMLButtonElement;
    const volume = document.getElementById("volume") as HTMLInputElement;
    const donateText: HTMLElement | null = document.getElementById('donateText');
    const donateImg: HTMLElement | null = document.getElementById('donateImg');

    if (donateImg && donateText) {
        donateText.addEventListener('mouseover', function() {
            donateImg.style.visibility = 'visible';
        });
    }

    await setCheckboxState("autoAudio", "audioActive");
    await setCheckboxState("showNotification", "showNotification");
    await setCheckboxState("openProlific", "openProlific");
    await setCheckboxState("focusProlific", "focusProlific");
    await setCheckboxState("trackIds", "trackIds");

    await setInputState("reward", "reward");
    await setInputState("rewardPerHour", "rewardPerHour");
    await setInputState("studyHistoryLen","studyHistoryLen")

    setTabState("settings-tab", "settings");
    setTabState("filters-tab", "filters");
    setTabState("studies-tab", "studies");
    await setCurrentActiveTab();
    await setAlertState();
    await setBlacklist();

    if(selectAudio) {
        await setAudioOption(selectAudio);
    }

    if(counter) {
        await setCounter(counter);
    }

    if(playAudio) {
        playAudio.addEventListener("click", playAlert);
    }

    if (volume) {
        await setVolume(volume);
    }

});

async function setCounter(counter: HTMLSpanElement): Promise<void> {
    const result = await chrome.storage.sync.get("counter");
    const count = result["counter"];
    if (count !== undefined) {
        counter.innerText = count.toString();
    }
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

function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const day = date.getDate() < 10 ? '0' + date.getDate() : date.getDate().toString();
    const month = (date.getMonth() + 1) < 10 ? '0' + (date.getMonth() + 1) : (date.getMonth() + 1).toString();
    const year = date.getFullYear();
    const hours = date.getHours() < 10 ? '0' + date.getHours() : date.getHours().toString();
    const minutes = date.getMinutes() < 10 ? '0' + date.getMinutes() : date.getMinutes().toString();

    return `${day}/${month}/${year} ${hours}:${minutes}`;
}
async function setAudioOption(selectAudio: HTMLSelectElement): Promise<void> {
    const result = await chrome.storage.sync.get("audio");
    selectAudio.value = result["audio"];
    selectAudio.addEventListener("change", async function (): Promise<void> {
        await chrome.storage.sync.set({["audio"]: selectAudio.value});
    });
}

function setTabState(elementId: string, storageValue: string): void  {
    const element = document.getElementById(elementId) as HTMLElement;
    if (!element) return;
    element.addEventListener("click", async function (): Promise<void> {
        await chrome.storage.sync.set({["activeTab"]: storageValue});
        changeTab(storageValue);
    });
}

async function setCurrentActiveTab(): Promise<void> {
    const result = await chrome.storage.sync.get("activeTab");
        changeTab(result["activeTab"]);
}

async function populateStudies() {
    const studiesContainer = document.getElementById("studies") as HTMLElement;
    studiesContainer.innerHTML = ""; // clear previous content
    const result = await chrome.storage.sync.get("currentStudies");
    const currentStudies: Study[] = result["currentStudies"];

    if (!currentStudies || currentStudies.length === 0) {
        studiesContainer.innerHTML = "<p class='text-center'>No studies available.</p>";
        return;
    }

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
                    <div class="study-researcher">By: ${study.researcher || "Unknown"}</div>
                    <div class="study-reward"><strong>Pay:</strong> ${study.reward || "N/A"}</div>
                    <div class="study-reward-hour">${study.rewardPerHour || "N/A"}  &#47;hr</div>
                    <div class="study-time"><strong>Time:</strong> ${study.time || "N/A"}</div>
                    <div class="study-created-at"><strong>Created:</strong> ${formattedDate}</div>
                    <button class="btn btn-success open-btn" data-index="${index}"><a href=${link} target="_blank" rel="noopener noreferrer" class="normal-link white">Open</a></button>
                    <button class="btn btn-fail delete-btn" data-index="${index}">Delete</button>
            </div>

        `;
        studiesContainer?.appendChild(studyCard);
    });

    studiesContainer.querySelectorAll(".delete-btn").forEach(button => {
        button.addEventListener("click", (e) => {
            const target = e.target as HTMLElement;
            const index = parseInt(target.getAttribute("data-index") || "");
            currentStudies.splice(index, 1);
            chrome.storage.sync.set({ currentStudies });
            populateStudies();
        });
    });
}

function changeTab(activeTab: string): void {
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
        populateStudies();
    }
}

async function setAlertState(): Promise<void> {
    const websiteButton = document.getElementById("websiteBtn") as HTMLElement;
    const titleButton = document.getElementById("titleBtn") as HTMLElement;
    const trackIds = document.getElementById("trackIds") as HTMLInputElement;
    const trackIdsLabel = document.getElementById("trackIdsLabel") as HTMLElement;
    const history = document.getElementById("studyHistoryLen") as HTMLInputElement;
    const historyLabel = document.getElementById("study-history-len-label") as HTMLElement;
    const result = await chrome.storage.sync.get("useOld");
    if (result["useOld"]) {
        trackIdsLabel.classList.add("disabled-text");
        historyLabel.classList.add("disabled-text");
        history.disabled = true;
        trackIds.disabled = true;
        titleButton.classList.add("active");
    } else {
        historyLabel.classList.remove("disabled-text");
        history.disabled = false;
        trackIdsLabel.classList.remove("disabled-text");
        trackIds.disabled = false;
        websiteButton.classList.add("active");
    }

    websiteButton.addEventListener("click", async function (): Promise<void> {
        historyLabel.classList.remove("disabled-text");
        history.disabled = false;
        trackIdsLabel.classList.remove("disabled-text");
        trackIds.disabled = false;
        websiteButton.classList.add("active");
        titleButton.classList.remove("active");
        await chrome.storage.sync.set({["useOld"]: false});
        const tabs = await chrome.tabs.query({url: "*://app.prolific.com/*"});
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id!, {
                type: 'change-alert-type',
                target: 'everything',
                data: "website"
            });
        });
    });

    titleButton.addEventListener("click", async function (): Promise<void> {
        historyLabel.classList.add("disabled-text");
        trackIdsLabel.classList.add("disabled-text");
        history.disabled = true;
        trackIds.disabled = true;
        titleButton.classList.add("active");
        websiteButton.classList.remove("active");
        await chrome.storage.sync.set({["useOld"]: true});
        const tabs = await chrome.tabs.query({url: "*://app.prolific.com/*"});
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id!, {
                type: 'change-alert-type',
                target: 'content',
                data: "title"
            });
        });
        await chrome.runtime.sendMessage({
            type: 'change-alert-type',
            target: 'background',
            data: "title"
        });
    });
}


async function setCheckboxState(elementId: string, storageKey: string): Promise<void> {
    const element = document.getElementById(elementId) as HTMLInputElement;
    if (!element) return;
    const result = await chrome.storage.sync.get(storageKey);
    if (result[storageKey] !== undefined) {
        element.checked = result[storageKey];
    }
    element.addEventListener("click", async function (): Promise<void> {
        await chrome.storage.sync.set({[storageKey]: element.checked});
    });
}

async function setInputState(elementId: string, storageKey: string): Promise<void> {
    const element = document.getElementById(elementId) as HTMLInputElement;
    if (!element) return;
    const result = await chrome.storage.sync.get(storageKey);
    if (result[storageKey] !== undefined) {
        element.value = result[storageKey];
    }
    element.addEventListener("change", async function (): Promise<void> {
        await chrome.storage.sync.set({[storageKey]: parseFloat(element.value)});
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

async function populateBlacklist(elementId: string, storageKey: string, values: string[]=[]): Promise<void> {
    const blacklistContainer = document.getElementById(elementId) as HTMLElement;
    blacklistContainer.innerHTML = "";
    let currentItems;
    if (values.length === 0) {
        const result = await chrome.storage.sync.get(storageKey);
        currentItems = result[storageKey] || [];
    } else {
        currentItems = values;
    }

    currentItems.forEach((item: string, index: number) => {
        const itemCard = document.createElement('div');
        itemCard.classList.add("blacklist-card");
        itemCard.innerHTML = `
        <span>${item}</span> <span class="remove-btn" data-index="${index}">X</span>
        `;
        blacklistContainer.appendChild(itemCard);
    });
    blacklistContainer.querySelectorAll(".remove-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            const target = e.target as HTMLElement;
            const index = parseInt(target.getAttribute("data-index") || "");
            currentItems.splice(index, 1);
            chrome.storage.sync.set({ [storageKey]: currentItems });
            populateBlacklist(elementId, storageKey, currentItems);
        });
    });
}
