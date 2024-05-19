async function setVolume(volume: HTMLInputElement) {
    const result = await chrome.storage.sync.get("volume");
    const vol = result["volume"];
    if (vol !== undefined) {
        volume.value =  String(vol);
    }
    volume.addEventListener("change", async function () {
        await chrome.storage.sync.set({["volume"]: parseFloat(volume.value)});
        await chrome.runtime.sendMessage({
            type: 'volume-changed',
            target: 'background',
            data: parseFloat(volume.value) / 100
        });
    });

}

document.addEventListener('DOMContentLoaded', async function () {
    const autoAudio = document.getElementById("autoAudio") as HTMLInputElement;
    const selectAudio = document.getElementById("selectAudio") as HTMLSelectElement;
    const counter = document.getElementById("counter") as HTMLSpanElement;
    const playAudio = document.getElementById("playAudio") as HTMLButtonElement;
    const showNotification = document.getElementById("showNotification") as HTMLInputElement;
    const volume = document.getElementById("volume") as HTMLInputElement;

    if (autoAudio) {
        await setAudioCheckbox(autoAudio);
    }

    if(selectAudio) {
        await setAudioOption(selectAudio);
    }

    if(counter) {
        await setCounter(counter);
    }

    if(playAudio) {
        playAudio.addEventListener("click", playAlert);
    }

    if(showNotification) {
        await setShowNotification(showNotification);
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

}

async function setAudioOption(selectAudio: HTMLSelectElement): Promise<void> {
    const result = await chrome.storage.sync.get("audio");
    selectAudio.value = result["audio"];
    selectAudio.addEventListener("change", async function (): Promise<void> {
        await chrome.storage.sync.set({["audio"]: selectAudio.value});
        await chrome.runtime.sendMessage({
            type: 'audio-changed',
            target: 'background',
            data: selectAudio.value
        });
    });
}

async function setAudioCheckbox(autoAudio: HTMLInputElement): Promise<void> {
    const result = await chrome.storage.sync.get("audioActive");
    autoAudio.checked = result["audioActive"];
    autoAudio.addEventListener("click", async function (): Promise<void> {
        await chrome.storage.sync.set({["audioActive"]: autoAudio.checked});
        await chrome.runtime.sendMessage({
            type: 'audioActive-changed',
            target: 'background',
            data: autoAudio.checked
        });
    });
}

async function setShowNotification(showNotification: HTMLInputElement): Promise<void> {
    const result = await chrome.storage.sync.get("showNotification");
    showNotification.checked = result["showNotification"];
    showNotification.addEventListener("click", async function (): Promise<void> {
        await chrome.storage.sync.set({["showNotification"]: showNotification.checked});
        await chrome.runtime.sendMessage({
            type: 'showNotification-changed',
            target: 'background',
            data: showNotification.checked
        });
    });
}
