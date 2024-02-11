const AUDIO_ACTIVE = "audioActive";
const SHOW_NOTIFICATION = "showNotification";
const AUDIO = "audio";
const COUNTER = "counter";
const ICON_URL = 'imgs/logo.png';
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
    console.log(tab);
    if(tab.status === "complete") {
        if (tab.url && tab.url.includes("app.prolific.com/")) {
            // if (changeInfo.title && changeInfo.title !== 'Prolific') {
                console.log("doing stuff");
                sendNotification();
                playAudioMessage(tabId);
                updateCounter();
            }
        }
    // }
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
    console.log("sendNotification");
    chrome.notifications.create({
        type: 'basic',
        iconUrl: chrome.runtime.getURL(ICON_URL),
        title: TITLE,
        message: MESSAGE
    }, (notificationId) => {
        if (chrome.runtime.lastError) {
            console.log(`Notification Error: ${chrome.runtime.lastError.message}`);
        } else {
            console.log(`Notification created with ID: ${notificationId}`);
        }
    });
}

// chrome.tabs.onCreated.addListener(async (tab) => {
//     console.log(tab);
//     if (tab.id) {
//     await playAudioMessage(tab.id);
//     }
// });

async function playAudioMessage(tabId: number): Promise<void> {
    const result = await chrome.storage.sync.get(AUDIO_ACTIVE);
    if(result[AUDIO_ACTIVE]) {
        console.log("playAudioMessage");
        try{
            await chrome.scripting.executeScript({
                target: {tabId: tabId},
                files: ["dist/playAlert.js"]
            });
        } catch(e) {
            console.log(e);
        }
    }
    else {
        console.log("audio is not active");
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
