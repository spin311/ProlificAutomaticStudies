const AUDIO_ACTIVE = "audioActive";
const SHOW_NOTIFICATION = "showNotification";
const AUDIO = "audio";
const COUNTER = "counter";
const ICON_URL = '../images/logo.png';
const TITLE = 'Prolific Studies';
const MESSAGE = 'A new study has been posted on Prolific!';

chrome.runtime.onInstalled.addListener(async (details: { reason: string; }): Promise<void> => {
    if(details.reason === "install"){
        await setInitialValues();
        await new Promise(resolve => setTimeout(resolve, 1000));
        await chrome.action.setBadgeText({text: "1"});
        await chrome.tabs.create({url: "https://spin311.github.io/ProlificStudiesGoogle/", active: true});
    }
});

chrome.tabs.onUpdated.addListener(async (tabId:number, changeInfo:chrome.tabs.TabChangeInfo, tab:chrome.tabs.Tab):Promise<void> => {
    if(tab.url && tab.url.includes("app.prolific.com/")) {
        if (changeInfo.title && changeInfo.title !== 'Prolific') {
            await sendNotification();
            await playAudioMessage(tabId);
            await updateCounter();
        }
    }
});

async function setInitialValues(): Promise<void> {
    await Promise.all([
        chrome.storage.sync.set({ [AUDIO_ACTIVE]: true }),
        chrome.storage.sync.set({ [AUDIO]: "alert1.mp3" }),
        chrome.storage.sync.set({ [SHOW_NOTIFICATION]: true })

    ]);

}

async function sendNotification(): Promise<void> {
    chrome.storage.sync.get(SHOW_NOTIFICATION, async (result) => {
        if(!result[SHOW_NOTIFICATION]) {
            return;
        }
    });
    chrome.notifications.create({
        type: 'basic',
        iconUrl: ICON_URL,
        title: TITLE,
        message: MESSAGE
    });
}

async function playAudioMessage(tabId: number): Promise<void> {
    const result = await chrome.storage.sync.get(AUDIO_ACTIVE);
    if(result[AUDIO_ACTIVE]) {
        await chrome.tabs.executeScript(tabId, {file: "playAlert.js"});
    }
}

async function updateBadge(counter: number): Promise<void> {
    await chrome.action.setBadgeText({text: counter.toString()});
    await chrome.action.setBadgeBackgroundColor({color: "#FF0000"});
}

async function updateCounter(): Promise<void> {
    const result = await chrome.storage.sync.get(COUNTER);
    let counter = result[COUNTER];
    if (counter === undefined) {
        counter = 1;
    }
    else {
        counter++;
    }
    await chrome.storage.sync.set({ [COUNTER]: counter });
    await updateBadge(counter);
}
