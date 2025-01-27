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

    await setInputState("nuPlaces", "nuPlaces");
    await setInputState("reward", "reward");
    await setInputState("rewardPerHour", "rewardPerHour");

    await setTabState("settings-tab", "settings");
    await setTabState("filters-tab", "filters");

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

async function setTabState(elementId: string, storageValue: string): Promise<void> {
    const element = document.getElementById(elementId) as HTMLElement;
    if (!element) return;
    const result = await chrome.storage.sync.get("activeTab");
    if (result["activeTab"] === storageValue) {
        element.classList.add("active");
        changeTab(storageValue);
    }
    element.addEventListener("click", async function (): Promise<void> {
        changeTab(storageValue);
        await chrome.storage.sync.set({["activeTab"]: storageValue});
    });
}

function changeTab(activeTab: string): void {
    const settings = document.getElementById("settings") as HTMLDivElement;
    const filters = document.getElementById("filters") as HTMLDivElement;
    const settingsTab = document.getElementById("settings-tab") as HTMLElement;
    const filtersTab = document.getElementById("filters-tab") as HTMLElement;
    if (activeTab === "settings") {
        settingsTab.classList.add("active");
        filtersTab.classList.remove("active");
        settings.style.display = "block";
        filters.style.display = "none";
    } else {
        settingsTab.classList.remove("active");
        filtersTab.classList.add("active");
        settings.style.display = "none";
        filters.style.display = "block";
    }
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
