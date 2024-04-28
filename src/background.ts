import Reason = chrome.offscreen.Reason;
import ContextType = chrome.runtime.ContextType;

const AUDIO_ACTIVE = "audioActive";
const SHOW_NOTIFICATION = "showNotification";
const AUDIO = "audio";
const COUNTER = "counter";
const ICON_URL = 'imgs/logo.png';
const TITLE = 'Prolific Studies';
const MESSAGE = 'A new study has been posted on Prolific!';
let creating: Promise<void> | null; // A global promise to avoid concurrency issues
let docExists: boolean = false;
chrome.runtime.onInstalled.addListener(async (details: { reason: string; }): Promise<void> => {
    if(details.reason === "install"){
        await setInitialValues();
        await new Promise(resolve => setTimeout(resolve, 1000));
        await chrome.tabs.create({url: "https://spin311.github.io/ProlificStudiesGoogle/", active: true});
    }
});

async function playAudio(audio:string='alert1.mp3',volume: number = 1.0) {
    const req = {
        audio: audio,
        volume: volume
    };
    await chrome.runtime.sendMessage({
        type: 'play-sound',
        target: 'offscreen-doc',
        data: req
    });
}

chrome.tabs.onUpdated.addListener(async (_, changeInfo, tab) => {
    if (tab.url && tab.url.includes('https://app.prolific.com/') && changeInfo.title && !(changeInfo.title.trim() === 'Prolific')) {
        const resultAudio = await chrome.storage.sync.get(AUDIO_ACTIVE);
        if (resultAudio[AUDIO_ACTIVE]) {
            if (!docExists) await setupOffscreenDocument('audio/audio.html');
            const audioFile = await chrome.storage.sync.get(AUDIO);
            const volume = await chrome.storage.sync.get('volume');
            await playAudio(audioFile[AUDIO], volume['volume']);
            await updateCounter();
        }
        const resultNotification = await chrome.storage.sync.get(SHOW_NOTIFICATION);
        if (resultNotification[SHOW_NOTIFICATION]) {
            sendNotification();
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

function sendNotification(): void {
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

async function setupOffscreenDocument(path: string): Promise<void> {
    // Check all windows controlled by the service worker to see if one
    // of them is the offscreen document with the given path
    const offscreenUrl = chrome.runtime.getURL(path);
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: [ContextType.OFFSCREEN_DOCUMENT],
        documentUrls: [offscreenUrl]
    });

    if (existingContexts.length > 0) {
        docExists = true;
        return;
    }
    if (creating) {
        await creating;
    } else {
        creating = chrome.offscreen.createDocument({
            url: path,
            reasons: [Reason.AUDIO_PLAYBACK],
            justification: 'Notification'
        });
        await creating;
        creating = null;
        docExists = true;
    }
}
