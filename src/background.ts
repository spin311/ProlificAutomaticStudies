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
    createdAt: string | null;
};

//TODO:
// Add help, contact
// Add page on portfolio
// Studies tab:
// search, sort, filter
// add to favorites
//open study in new tab
// explanation
// UI, date added

// filters:
// add name and researcher blacklist

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
const USE_OLD = "useOld";
const PROLIFIC_TITLE = "prolificTitle"
const TRACK_IDS = "trackIds";
const STUDY_HISTORY_LEN = "studyHistoryLen";
let creating: Promise<void> | null = null; // A global promise to avoid concurrency issues

initialize();
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
        chrome.runtime.setUninstallURL(`https://svitspindler.com/uninstall?extension=${encodeURI("Prolific Studies Notifier")}`);
    } else if (details.reason === "update") {
        chrome.action.setBadgeText({text: "New"});
        chrome.storage.sync.set({
            [STUDY_HISTORY_LEN]: 50
        });
        chrome.runtime.setUninstallURL(`https://svitspindler.com/uninstall?extension=${encodeURI("Prolific Studies Notifier")}`);
    }
});

function getValueFromStorage<T>(key: string, defaultValue: T): Promise<T> {
    return new Promise((resolve): void => {
        chrome.storage.sync.get(key, function (result): void {
            resolve((result[key] !== undefined) ? result[key] as T : defaultValue);
        });
    });
}

function setupTitleAlert(): void {
    const tabsOnUpdatedListener = async (_: number, _changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab): Promise<void> => {
        const previousTitle = await getValueFromStorage(PROLIFIC_TITLE, 'Prolific');
        if (tab.url && tab.url.includes('https://app.prolific.com/')) {
        }
        if (tab.url && tab.url.includes('https://app.prolific.com/') && tab.title && tab.title !== previousTitle && tab.status === 'complete') {
            const newTitle = tab.title.trim();
            if (newTitle === 'Prolific') {
                await chrome.storage.sync.set({ [PROLIFIC_TITLE]: newTitle });
                return;
            }
            const titleStorageValues = await chrome.storage.sync.get([USE_OLD, FOCUS_PROLIFIC, SHOW_NOTIFICATION, AUDIO_ACTIVE, AUDIO, VOLUME]);
            const useOld = titleStorageValues[USE_OLD] ?? false;
            if (!useOld) {
                chrome.tabs.onUpdated.removeListener(tabsOnUpdatedListener);
                return;
            }
            const previousNumber: number = getNumberFromTitle(previousTitle);
            const currentNumber: number = getNumberFromTitle(tab.title);
            const shouldFocusProlific = titleStorageValues[FOCUS_PROLIFIC] ?? false;
            await chrome.storage.sync.set({ [PROLIFIC_TITLE]: newTitle });
            if (currentNumber > previousNumber) {
                const shouldSendNotification = titleStorageValues[SHOW_NOTIFICATION] ?? true;
                if (shouldSendNotification) {
                    sendNotification();
                }
                const shouldPlayAudio = titleStorageValues[AUDIO_ACTIVE] ?? true;
                if (shouldPlayAudio) {
                    const audio = titleStorageValues[AUDIO] ?? 'alert1.mp3';
                    const volume = titleStorageValues[VOLUME] ? titleStorageValues[VOLUME] / 100 : 100;
                    await playAudio(audio, volume);
                }
                if (shouldFocusProlific) {
                    await focusProlific();
                }
                await updateCounterAndBadge(currentNumber - previousNumber);
            }
        }

    };
    chrome.tabs.onUpdated.addListener(tabsOnUpdatedListener);
}

function getNumberFromTitle(title: string): number {
    const match: RegExpMatchArray | null = title.match(/\((\d+)\)/);
    return match ? parseInt(match[1]) : 0;
}

async function focusProlific() {
    const tabs = await chrome.tabs.query({url: "*://app.prolific.com/*"});
    if (tabs.length > 0) {
        await chrome.tabs.update(tabs[0].id!, {active: true});
    } else {
        await chrome.tabs.create({url: "https://app.prolific.com/", active: true});
    }
}

async function handlePlaySound(audio: string | null = null,  volume: number | null = null): Promise<void> {
    if (!audio || !volume) {
        const audioValues = await chrome.storage.sync.get([AUDIO, VOLUME]);
        audio = audioValues[AUDIO] ?? 'alert1.mp3';
        volume = audioValues[VOLUME] ? audioValues[VOLUME] / 100 : 100;
    }
    await playAudio(audio, volume);
}

async function handleMessages(message: { target: string; type: any; data?: any; }): Promise<void> {
    // Return early if this message isn't meant for the offscreen document.
    if (message.target !== 'background') {
        return Promise.resolve();
    }
    // Dispatch the message to an appropriate handler.
    switch (message.type) {
        case 'play-sound':
            await handlePlaySound();
            sendNotification();
            break;
        case 'show-notification':
            sendNotification();
            break;
        case 'clear-badge':
            await chrome.action.setBadgeText({text: ''});
            break;
        case 'change-alert-type':
                setupTitleAlert();
            break;
        case 'new-studies':
            await handleNewStudies(message.data);
            break;
    }
}

async function handleNewStudies(studies: Study[]) {
    if (!studies) return;
    const studiesStorageValues = await chrome.storage.sync.get([
        SHOW_NOTIFICATION,
        AUDIO_ACTIVE,
        FOCUS_PROLIFIC,
        NU_PLACES,
        REWARD,
        REWARD_PER_HOUR,
        AUDIO,
        VOLUME,
        USE_OLD
    ]);
    if (studiesStorageValues[USE_OLD] === true) return;
    const shouldShowNotification: boolean = studiesStorageValues[SHOW_NOTIFICATION] ?? true;
    const shouldPlayAudio: boolean = studiesStorageValues[AUDIO_ACTIVE] ?? true;
    const shouldFocusProlific: boolean = studiesStorageValues[FOCUS_PROLIFIC] ?? false;
    const numPlaces: number = studiesStorageValues[NU_PLACES] ?? 0;
    const reward: number = studiesStorageValues[REWARD] ?? 0;
    const rewardPerHour: number = studiesStorageValues[REWARD_PER_HOUR] ?? 0;
    if (numPlaces > 0 || reward > 0 || rewardPerHour > 0) {
        studies = studies.filter((study) => {
            if (numPlaces && study.places && study.places < numPlaces) {
                return false;
            }
            if (reward && study.reward && getFloatValueFromMoneyString(study.reward) < reward) {
                return false;
            }
            return !(rewardPerHour && study.rewardPerHour && getFloatValueFromMoneyString(study.rewardPerHour) < rewardPerHour);
        });
    }
    if (studies.length === 0) return;
    if (shouldPlayAudio) {
        const audio = studiesStorageValues[AUDIO] ?? 'alert1.mp3';
        const volume = studiesStorageValues[VOLUME] ? studiesStorageValues[VOLUME] / 100 : 100;
        await playAudio(audio, volume);
    }
    if (shouldFocusProlific) {
        await focusProlific();
    }
    if (shouldShowNotification) {
        studies
            .sort((a, b) => getFloatValueFromMoneyString(b.reward || "0") - getFloatValueFromMoneyString(a.reward || "0"))
            .forEach((study) => {
                setTimeout(() => {
                    sendNotification(study);
                }, 1000);
            });
    }
    await updateCounterAndBadge(studies.length);
}

chrome.runtime.onStartup.addListener(async function(): Promise<void> {
    if (await getValueFromStorage(OPEN_PROLIFIC, false)) {
        await chrome.tabs.create({url: "https://app.prolific.com/", active: false});
    }
});

async function initialize() {
    if (await getValueFromStorage(USE_OLD, false)) {
        setupTitleAlert();
    }
}

async function playAudio(audio: string | null = 'alert1.mp3', volume: number | null): Promise<void> {

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
        [TRACK_IDS]: true,
        [STUDY_HISTORY_LEN]: 50
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
        if (study.reward) {
            message += `\nReward: ${study.reward}`;
        }
        if (study.rewardPerHour) {
            message += `\nReward per hour: ${study.rewardPerHour}`;
        }
        if (study.time) {
            message += `\nTime: ${study.time}`;
        }
        if (study.places) {
            message += ` | Places: ${study.places}`;
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