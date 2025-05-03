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

    await setInputState("nuPlaces", "nuPlaces");
    await setInputState("reward", "reward");
    await setInputState("rewardPerHour", "rewardPerHour");

    setTabState("settings-tab", "settings");
    setTabState("filters-tab", "filters");
    setTabState("studies-tab", "studies");
    await setCurrentActiveTab();
    await setAlertState();

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
        changeTab(storageValue);
        await chrome.storage.sync.set({["activeTab"]: storageValue});
    });
}

async function setCurrentActiveTab(): Promise<void> {
    const result = await chrome.storage.sync.get("activeTab");
        changeTab(result["activeTab"]);
}

function changeTab(activeTab: string): void {
    const windows = [{tab: "settings", item: "settings-tab"},
        {tab: "filters", item: "filters-tab"},
        {tab: "studies", item: "studies-list"}
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
}

async function setAlertState(): Promise<void> {
    const websiteButton = document.getElementById("websiteBtn") as HTMLElement;
    const titleButton = document.getElementById("titleBtn") as HTMLElement;
    const trackIds = document.getElementById("trackIds") as HTMLInputElement;
    const trackIdsLabel = document.getElementById("trackIdsLabel") as HTMLElement;
    const result = await chrome.storage.sync.get("useOld");
    if (result["useOld"]) {
        trackIdsLabel.classList.add("disabled-text");
        trackIds.disabled = true;
        titleButton.classList.add("active");
    } else {
        trackIdsLabel.classList.remove("disabled-text");
        trackIds.disabled = false;
        websiteButton.classList.add("active");
    }
    websiteButton.addEventListener("click", async function (): Promise<void> {
        trackIdsLabel.classList.remove("disabled-text");
        trackIds.disabled = false;
        websiteButton.classList.add("active");
        titleButton.classList.remove("active");
        await chrome.storage.sync.set({["useOld"]: false});
        const tabs = await chrome.tabs.query({url: "*://app.prolific.com/*"});
        if (tabs.length > 0) {
            await chrome.tabs.sendMessage(tabs[0].id!, {
                type: 'change-alert-type',
                target: 'everything',
                data: "website"
            });
        }
    });
    titleButton.addEventListener("click", async function (): Promise<void> {
        trackIdsLabel.classList.add("disabled-text");
        trackIds.disabled = true;
        titleButton.classList.add("active");
        websiteButton.classList.remove("active");
        await chrome.storage.sync.set({["useOld"]: true});
        const tabs = await chrome.tabs.query({url: "*://app.prolific.com/*"});
        if (tabs.length > 0) {
            await chrome.tabs.sendMessage(tabs[0].id!, {
                type: 'change-alert-type',
                target: 'content',
                data: "title"
            });
        }
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
