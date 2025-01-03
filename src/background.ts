import Reason = chrome.offscreen.Reason;
import ContextType = chrome.runtime.ContextType;
type Study = {
    id: string | undefined | null;
    title: string | undefined | null,
    researcher: string | undefined | null,
    places: number | undefined | null;
    reward: number | undefined | null;
    rewardPerHour: number | undefined | null;
    time: number | undefined | null;
    limitedCapacity: boolean | undefined | null;
};

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
let volume: number | null;
let audio: string | null;
let shouldSendNotification: boolean;
let shouldPlayAudio: boolean;

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

chrome.runtime.onStartup.addListener(async function(): Promise<void> {
    if (await getValueFromStorage(OPEN_PROLIFIC, false)) {
        await chrome.tabs.create({url: "https://app.prolific.com/", active: false});
    }
});

async function playAudio(audio: string = 'alert1.mp3', volume?: number | null): Promise<void> {

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

function checkNewStudies(): Study[] {
    const targetNode = document.querySelector('ul[class="list"]');// Prolific study list
    const currentStudies: Study[] = [];

    if (!targetNode) {
        console.log('Target node not found.');
        return currentStudies;
    }
    const studyList = document.querySelectorAll('li[class="list-item"]');
    // Iterate over all study items
    for (const study of studyList) {
        const id = study.getAttribute('data-testid')?.split('-')[1];
        const title = study.querySelector('[data-testid="title"]')?.textContent;
        const researcher = study.querySelector('[data-testid="host"]')?.textContent?.split(' ').slice(1).join(' ');
        const places = parseInt(study.querySelector('[data-testid="study-tag-places"]')?.textContent?.split(' ')[0] || '0');
        const reward = parseFloat(study.querySelector('[data-testid="study-tag-reward"]')?.textContent?.replace('$', '') || '0');
        const rewardPerHour = parseFloat(study.querySelector('[data-testid="study-tag-reward-per-hour"]')?.textContent?.replace('$', '').replace('/hr', '') || '0');
        const time = getTimeFromString(study);

        if (id) {
            const currentStudy: Study = {
                id,
                researcher,
                title,
                reward,
                places,
                rewardPerHour,
                time,
                limitedCapacity: false,
            };

            // Check if the study is new
            // if (!savedStudiesIds.includes(id)) {
            //     newStudiesCount++;
            //     if (shouldSendNotification) {
            //         sendNotification(currentStudy);
            //     }
            // }
            currentStudies.push(currentStudy);
        } else {
            console.log('Study ID not found for an item.');
        }
    }
    return currentStudies;

    function getTimeFromString(study: Element) {
        const timeText = study.querySelector('[data-testid="study-tag-completion-time"]')?.textContent;
        let time = 0;
        if (timeText) {
            const timeParts = timeText.match(/(\d+)\s*h\s*(\d+)?\s*mins?/);
            if (timeParts) {
                const hours = parseInt(timeParts[1]) || 0;
                const minutes = parseInt(timeParts[2]) || 0;
                time = hours * 60 + minutes;
            } else {
                const minutesOnly = timeText.match(/(\d+)\s*mins?/);
                if (minutesOnly) {
                    time = parseInt(minutesOnly[1]);
                }
            }
        }
        return time;
    }

    // Handle updates for new studies
    // if (newStudiesCount > 0) {
    //     if (shouldPlayAudio && audio) {
    //         await playAudio(audio, volume);
    //     }
    //     await updateCounterAndBadge(newStudiesCount);
    //     await chrome.storage.sync.set({ "studies": currentStudies.map(study => study.id) });
    // }
}

chrome.tabs.onUpdated.addListener(async (_a: number, _b: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab): Promise<void> => {

    if (tab.id && tab.url && tab.url.includes('https://app.prolific.com') && tab.status === 'complete') {
        // Fetch saved settings and storage values
        const savedStudiesIds = await getValueFromStorage<string[]>('studies', []);
        shouldSendNotification = await getValueFromStorage(SHOW_NOTIFICATION, true);
        shouldPlayAudio = await getValueFromStorage(AUDIO_ACTIVE, true);
        audio = shouldPlayAudio ? await getValueFromStorage(AUDIO, 'alert1.mp3') : null;
        volume = shouldPlayAudio ? (await getValueFromStorage(VOLUME, 100)) / 100 : null;
        //await document loaded
        await new Promise(resolve => setTimeout(resolve, 5000));
        chrome.scripting.executeScript({
            target: {tabId: tab.id},
            func: checkNewStudies,
        }, (results) => {
            if (results && results[0] && results[0].result) {
                const studies = results[0].result as Study[];
                console.log('Returned studies:', studies);
            }
        })
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

function sendNotification(study: Study | null=null): void {
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

async function updateCounterAndBadge(count: number = 1): Promise<void> {
    await updateBadge(count);
    let counter: number = await getValueFromStorage(COUNTER, 0) + count;
    await chrome.storage.sync.set({ [COUNTER]: counter });
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
