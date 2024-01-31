document.addEventListener('DOMContentLoaded', async function () {
    const autoAudio = document.getElementById("autoAudio") as HTMLInputElement;
    const selectAudio = document.getElementById("selectAudio") as HTMLSelectElement;
    const counter = document.getElementById("counter") as HTMLSpanElement;
    const playAudio = document.getElementById("playAudio") as HTMLButtonElement;
    const showNotification = document.getElementById("showNotification") as HTMLInputElement;

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
});

async function setCounter(counter: HTMLSpanElement): Promise<void> {
    const result = await chrome.storage.sync.get(COUNTER);
    const count = result[COUNTER];
    if (count !== undefined) {
        counter.innerText = count.toString();
    }
}

async function playAlert(): Promise<void> {
    const result = await chrome.storage.sync.get(AUDIO);
    let audio = new Audio('../audio/' + result[AUDIO]);
    await audio.play();
}

async function setAudioOption(selectAudio: HTMLSelectElement): Promise<void> {
    const result = await chrome.storage.sync.get(AUDIO);
    selectAudio.value = result[AUDIO];
    selectAudio.addEventListener("change", function () {
        chrome.storage.sync.set({[AUDIO]: selectAudio.value});
    });
}

async function setAudioCheckbox(autoAudio: HTMLInputElement): Promise<void> {
    const result = await chrome.storage.sync.get(AUDIO_ACTIVE);
    autoAudio.checked = result[AUDIO_ACTIVE];
    autoAudio.addEventListener("click", function () {
        chrome.storage.sync.set({[AUDIO_ACTIVE]: autoAudio.checked});
    });
}

async function setShowNotification(showNotification: HTMLInputElement): Promise<void> {
    const result = await chrome.storage.sync.get(SHOW_NOTIFICATION);
    showNotification.checked = result[SHOW_NOTIFICATION];
    showNotification.addEventListener("click", function () {
        chrome.storage.sync.set({[SHOW_NOTIFICATION]: showNotification.checked});
    });
}
