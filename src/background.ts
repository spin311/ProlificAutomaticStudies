import Reason = chrome.offscreen.Reason;
import ContextType = chrome.runtime.ContextType;

const AUDIO_ACTIVE = "audioActive";
const SHOW_NOTIFICATION = "showNotification";
const OPEN_PROLIFIC = "openProlific";
const AUDIO = "audio";
const VOLUME = "volume";
const COUNTER = "counter";
const ICON_URL = 'imgs/logo.png';
const TITLE = 'Prolific Automatic Studies';
const MESSAGE = 'A new study has been posted on Prolific!';
let creating: Promise<void> | null; // A global promise to avoid concurrency issues
let volume: number;
let audio: string;
let shouldSendNotification: boolean;
let shouldPlayAudio: boolean;
let previousTitle: string | null = null;

chrome.runtime.onMessage.addListener(handleMessages);

chrome.notifications.onClicked.addListener(function (notificationId: string): void {
    chrome.tabs.create({url: "https://app.prolific.com/", active: true});
    chrome.notifications.clear(notificationId);
});

chrome.notifications.onButtonClicked.addListener(function (notificationId: string, buttonIndex: number): void {
    if (buttonIndex === 0) {
        chrome.tabs.create({url: "https://app.prolific.com/", active: true});
    }
    chrome.notifications.clear(notificationId);
});

chrome.runtime.onInstalled.addListener(async (details: { reason: string; }): Promise<void> => {
    if(details.reason === "install"){
        await setInitialValues();
        await new Promise(resolve => setTimeout(resolve, 1000));
        await chrome.tabs.create({url: "https://spin311.github.io/ProlificAutomaticStudies/", active: true});
    }
});

function getValueFromStorage<T>(key: string, defaultValue: T): Promise<T> {
    return new Promise((resolve): void => {
        chrome.storage.sync.get(key, function (result): void {
            resolve((result[key] !== undefined) ? result[key] as T : defaultValue);
        });
    });
}

async function handleMessages(message: { target: string; type: any; data?: any; }): Promise<void> {
    // Return early if this message isn't meant for the offscreen document.
    if (message.target !== 'background') {
        return;
    }
    // Dispatch the message to an appropriate handler.
    switch (message.type) {
        case 'play-sound':
            audio = await getValueFromStorage(AUDIO, 'alert1.mp3');
            volume = await getValueFromStorage(VOLUME, 100) / 100;
            await playAudio(audio, volume);
            sendNotification();
            break;
        case 'show-notification':
            sendNotification();
            break;
        case 'clear-badge':
            await chrome.action.setBadgeText({text: ''});
            break;
    }
}

chrome.runtime.onStartup.addListener(function(): void{
    chrome.storage.sync.get(OPEN_PROLIFIC, function (result): void {
        if (result && result[OPEN_PROLIFIC]) {
            chrome.tabs.create({url: "https://app.prolific.com/", active: false});
        }

    });
});

async function playAudio(audio:string='alert1.mp3',volume: number = 1.0): Promise<void> {

    await setupOffscreenDocument('audio/audio.html');
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

chrome.tabs.onUpdated.addListener(async (_: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab): Promise<void> => {
    if (tab.url && tab.url.includes('https://app.prolific.com/') && changeInfo.title && changeInfo.title !== previousTitle) {
        previousTitle = changeInfo.title;
        if (!(changeInfo.title.trim() === 'Prolific')) {
            shouldSendNotification = await getValueFromStorage(SHOW_NOTIFICATION, true);
            if (shouldSendNotification) {
                sendNotification();
            }
            shouldPlayAudio = await getValueFromStorage(AUDIO_ACTIVE, true);
            if (shouldPlayAudio) {
                audio = await getValueFromStorage(AUDIO, 'alert1.mp3');
                volume = await getValueFromStorage(VOLUME, 100) / 100;
                await playAudio(audio, volume);
            }
        }
            await updateCounter();
        }
    });


async function setInitialValues(): Promise<void> {
    await Promise.all([
        chrome.storage.sync.set({ [AUDIO_ACTIVE]: true }),
        chrome.storage.sync.set({ [AUDIO]: "alert1.mp3" }),
        chrome.storage.sync.set({ [SHOW_NOTIFICATION]: true }),
        chrome.storage.sync.set({ [VOLUME]: 100 }),
    ]);

}

function sendNotification(): void {
    chrome.notifications.create({
        type: 'basic',
        iconUrl: chrome.runtime.getURL(ICON_URL),
        title: TITLE,
        message: MESSAGE,
        buttons: [{title: 'Open Prolific'}, {title: 'Dismiss'}],
    });
}
async function updateBadge(counter: number): Promise<void> {
    await chrome.action.setBadgeText({text: counter.toString()});
    await chrome.action.setBadgeBackgroundColor({color: "#9dec14"});

    setTimeout(async (): Promise<void> => {
        await chrome.action.setBadgeText({text: ''});
    }, 20000);
}

async function updateCounter(): Promise<void> {
    let counter: number = await getValueFromStorage(COUNTER, 0) + 1;
    await chrome.storage.sync.set({ [COUNTER]: counter });
    await updateBadge(1);
}

async function setupOffscreenDocument(path: string): Promise<void> {
    // Check all windows controlled by the service worker to see if one
    // of them is the offscreen document with the given path
    const offscreenUrl: string = chrome.runtime.getURL(path);
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: [ContextType.OFFSCREEN_DOCUMENT],
        documentUrls: [offscreenUrl]
    });

    if (existingContexts.length > 0) {
        return;
    }
    if (creating) {
        await creating;
    } else {
        creating = chrome.offscreen.createDocument({
            url: path,
            reasons: [Reason.AUDIO_PLAYBACK],
            justification: 'Audio playback'
        });
        await creating;
        creating = null;
    }
}
