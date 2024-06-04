import Reason = chrome.offscreen.Reason;
import ContextType = chrome.runtime.ContextType;

const AUDIO_ACTIVE = "audioActive";
const SHOW_NOTIFICATION = "showNotification";
const OPEN_PROLIFIC = "openProlific";
const AUDIO = "audio";
const VOLUME = "volume";
const COUNTER = "counter";
const ICON_URL = 'imgs/logo.png';
const TITLE = 'Prolific Studies';
const MESSAGE = 'A new study has been posted on Prolific!';
let creating: Promise<void> | null; // A global promise to avoid concurrency issues
let docExists: boolean = false;
let volume: number;
let audio: string;
let shouldSendNotification: boolean;
let shouldPlayAudio: boolean;
let previousTitle: string | null = null;

chrome.runtime.onMessage.addListener(handleMessages);

chrome.runtime.onInstalled.addListener(async (details: { reason: string; }): Promise<void> => {
    if(details.reason === "install"){
        await setInitialValues();
        await new Promise(resolve => setTimeout(resolve, 1000));
        await chrome.tabs.create({url: "https://spin311.github.io/ProlificStudiesGoogle/", active: true});
    }
});


async function handleMessages(message: { target: string; type: any; data?: any; }): Promise<void> {
    // Return early if this message isn't meant for the offscreen document.
    if (message.target !== 'background') {
        return;
    }
    // Dispatch the message to an appropriate handler.
    switch (message.type) {
        case 'play-sound':
            if (audio && volume) {
                await playAudio(audio, volume);
            }
            else {
                chrome.storage.sync.get([AUDIO, VOLUME], function (result): void {
                    if (result) {
                        audio = result[AUDIO];
                        volume = result[VOLUME] / 100;
                        if (audio && volume) {
                            playAudio(audio, volume);
                        }
                    }
                });
            }
            break;
        case 'show-notification':
            sendNotification();
            break;
        case 'audio-changed':
            audio = message.data;
            break;
        case 'volume-changed':
            volume = message.data;
            break;
        case 'showNotification-changed':
            shouldSendNotification = message.data;
            break;
        case 'audioActive-changed':
            shouldPlayAudio = message.data;
            break;
    }
}

chrome.runtime.onStartup.addListener(function(): void{
    chrome.storage.sync.get(OPEN_PROLIFIC, function (result): void {
        if (result && result[OPEN_PROLIFIC]) {
            chrome.tabs.create({url: "https://app.prolific.co/", active: false});
        }

    });
});

async function playAudio(audio:string='alert1.mp3',volume: number = 1.0) {

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

chrome.tabs.onUpdated.addListener(async (_, changeInfo, tab) => {
    if (tab.url && tab.url.includes('https://app.prolific.com/') && changeInfo.title && !(changeInfo.title.trim() === 'Prolific') && changeInfo.title !== previousTitle) {
        previousTitle = changeInfo.title;
        if (shouldSendNotification) {
            sendNotification();
        }
        else {
            chrome.storage.sync.get(SHOW_NOTIFICATION, function (result) {
                if (result) {
                    shouldSendNotification = result[SHOW_NOTIFICATION];
                    if (shouldSendNotification) {
                        sendNotification();
                    }
                }
            });
        }
        if (shouldPlayAudio && audio && volume) {
            await playAudio(audio, volume);
        }
        else {
            chrome.storage.sync.get([AUDIO_ACTIVE, VOLUME, AUDIO], function (result) {
                if (result) {
                    shouldPlayAudio = result[AUDIO_ACTIVE];
                    volume = result[VOLUME] / 100;
                    audio = result[AUDIO];
                    if (shouldPlayAudio && audio && volume) {
                        playAudio(audio, volume);
                    }
                }
            });
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
        message: MESSAGE
    });
}
async function updateBadge(counter: number): Promise<void> {
    await chrome.action.setBadgeText({text: counter.toString()});
    await chrome.action.setBadgeBackgroundColor({color: "#FF0000"});

    setTimeout(async (): Promise<void> => {
        await chrome.action.setBadgeText({text: ''});
    }, 60000);
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
        docExists = true;
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
        docExists = true;
    }
}
