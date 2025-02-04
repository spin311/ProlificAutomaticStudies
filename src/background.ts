import Reason = chrome.offscreen.Reason;
import ContextType = chrome.runtime.ContextType;
type Study = {
    id: string | null;
    title: string | null;
    researcher: string | null;
    places: number | null;
    reward: string | null;
    rewardPerHour: string | null;
    time: string | null;
    limitedCapacity: boolean | null;
};

const AUDIO_ACTIVE = "audioActive";
const SHOW_NOTIFICATION = "showNotification";
const OPEN_PROLIFIC = "openProlific";
const AUDIO = "audio";
const VOLUME = "volume";
const COUNTER = "counter";
const FOCUS_PROLIFIC = "focusProlific";
const NU_PLACES = "nuPlaces";
const REWARD = "reward";
const REWARD_PER_HOUR = "rewardPerHour";
const ACTIVE_TAB = "activeTab";
const ICON_URL = 'imgs/logo.png';
const TITLE = 'Prolific Automatic Studies';
const MESSAGE = 'A new study is available on Prolific!';
let creating: Promise<void> | null = null; // A global promise to avoid concurrency issues
let volume: number | null;
let audio: string | null;

chrome.runtime.onMessage.addListener(handleMessages);

chrome.notifications.onClicked.addListener(function (notificationId: string): void {
    if (!!notificationId) {
        chrome.tabs.create({url: `https://app.prolific.com/studies/${notificationId}`, active: true});
    }
    else {
        chrome.tabs.create({url: "https://app.prolific.com/", active: true});
    }
    chrome.notifications.clear(notificationId);
});

chrome.notifications.onButtonClicked.addListener(function (notificationId: string, buttonIndex: number): void {
    if (buttonIndex === 0) {
        if (!!notificationId) {
            chrome.tabs.create({url: `https://app.prolific.com/studies/${notificationId}`, active: true});
        }
        else {
            chrome.tabs.create({url: "https://app.prolific.com/", active: true});
        }
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
        case 'new-studies':
            let studies: Study[] = message.data;
            if (!studies) break;
            const shouldShowNotification = await getValueFromStorage(SHOW_NOTIFICATION, true);
            const shouldPlayAudio = await getValueFromStorage(AUDIO_ACTIVE, true);
            const shouldFocusProlific = await getValueFromStorage(FOCUS_PROLIFIC, false);
            const numPlaces = await getValueFromStorage(NU_PLACES, 0);
            const reward = await getValueFromStorage(REWARD, 0);
            const rewardPerHour = await getValueFromStorage(REWARD_PER_HOUR, 0);
            if (numPlaces > 0 || reward > 0 || rewardPerHour > 0) {
                studies = studies.filter((study) => {
                    if (numPlaces && study.places && study.places <= numPlaces) {
                        return false;
                    }
                    if (reward && study.reward && getFloatValueFromMoneyString(study.reward) <= reward) {
                        return false;
                    }
                    return !(rewardPerHour && study.rewardPerHour && getFloatValueFromMoneyString(study.rewardPerHour) <= rewardPerHour);
                });
            }
            if (studies.length === 0) break;
            if (shouldPlayAudio) {
                audio = await getValueFromStorage(AUDIO, 'alert1.mp3');
                volume = await getValueFromStorage(VOLUME, 100) / 100;
                await playAudio(audio, volume);
            }
            if (shouldFocusProlific) {
                const tabs = await chrome.tabs.query({ url: "*://app.prolific.com/*" });
                if (tabs.length > 0) {
                    await chrome.tabs.update(tabs[0].id!, { active: true });
                } else {
                    await chrome.tabs.create({ url: "https://app.prolific.com/", active: true });
                }
            }
            if (shouldShowNotification) {
                studies
                    .sort((a, b) => getFloatValueFromMoneyString(b.reward || "0") - getFloatValueFromMoneyString(a.reward || "0"))
                    .forEach((study) => {

                    setTimeout(() => {
                        sendNotification(study);
                    }, 3000);
            });
            }

            await updateCounterAndBadge(studies.length);
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

async function setInitialValues(): Promise<void> {
    await chrome.storage.sync.set({
        [AUDIO_ACTIVE]: true,
        [AUDIO]: "alert1.mp3",
        [SHOW_NOTIFICATION]: true,
        [VOLUME]: 100,
        [ACTIVE_TAB]: "settings",
    });
}

function sendNotification(study: Study | null=null): void {
    let title: string = TITLE;
    let message: string = MESSAGE;
    let id: string = "";
    if (study) {
        if (study.id) {
            id = study.id;
        }
        if (study.title && study.researcher) {
            title = `${study.title}\nBy ${study.researcher}`;
        }
        if (study.reward && study.time && study.rewardPerHour && study.places) {
            message += `\nReward: ${study.reward}\nReward per hour: ${study.rewardPerHour}\nTime: ${study.time} | Places: ${study.places}`;
        }
    }

    const options: chrome.notifications.NotificationOptions<true> = {
        type: 'basic',
        iconUrl: chrome.runtime.getURL(ICON_URL),
        title: title,
        message: message,
        buttons: [{ title: 'Open Study' }, { title: 'Dismiss' }],
    };
    chrome.notifications.create(id, options);
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

function getFloatValueFromMoneyString(value: string): number {
    const firstWord = value.split(" ")[0];
    if (firstWord.charAt(0) === '£') {
        return parseFloat(firstWord.slice(1));
    } else if (firstWord.charAt(0) === '$') {
        return parseFloat(firstWord.slice(1)) * 0.8;
    } else {
        return 0;
    }
}