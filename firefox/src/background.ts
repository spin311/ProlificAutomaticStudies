type Study = {
    id: string | null;
    title: string | null;
    researcher: string | null;
    reward: string | null;
    rewardPerHour: string | null;
    time: string | null;
    timeInMinutes: number | null;
    createdAt: string | null;
};

const AUDIO_ACTIVE = "audioActive";
const SHOW_NOTIFICATION = "showNotification";
const OPEN_PROLIFIC = "openProlific";
const AUDIO = "audio";
const VOLUME = "volume";
const COUNTER = "counter";
const FOCUS_PROLIFIC = "focusProlific";
const CURRENT_STUDIES = "currentStudies";
const REFRESH_RATE = 'refreshRate';
const ACTIVE_TAB = "activeTab";
const ICON_URL = 'imgs/logo.png';
const TITLE = 'Prolific Automatic Studies';
const MESSAGE = 'A new study is available on Prolific!';
const USE_OLD = "useOld";
const PROLIFIC_TITLE = "prolificTitle";
const TRACK_IDS = "trackIds";
const STUDY_HISTORY_LEN = "studyHistoryLen";
const SORT_STUDIES = 'sortStudies';

void initialize();
browser.runtime.onMessage.addListener(handleMessages);

browser.notifications.onClicked.addListener((notificationId: string): void => {
    const url = notificationId
        ? `https://app.prolific.com/studies/${notificationId}`
        : "https://app.prolific.com/";
    void browser.tabs.create({ url, active: true });
    void browser.notifications.clear(notificationId);
});

browser.notifications.onButtonClicked?.addListener((notificationId: string, buttonIndex: number): void => {
    if (buttonIndex === 0) {
        const url = notificationId
            ? `https://app.prolific.com/studies/${notificationId}`
            : "https://app.prolific.com/";
        void browser.tabs.create({ url, active: true });
    }
    void browser.notifications.clear(notificationId);
});

browser.runtime.onInstalled.addListener(async ({ reason }) => {
    if (reason === "install") {
        await setInitialValues();
        await new Promise(resolve => setTimeout(resolve, 1000));
        await browser.tabs.create({ url: "https://svitspindler.com/prolific-studies-notifier", active: true });
        browser.runtime.setUninstallURL?.(`https://svitspindler.com/uninstall?extension=${encodeURIComponent("Prolific Studies Notifier Firefox")}`);
    } else if (reason === "update") {
        const result = await browser.storage.sync.get([CURRENT_STUDIES]);
        await browser.storage.local.set({ [CURRENT_STUDIES]: result[CURRENT_STUDIES] ?? [] });
        await browser.storage.sync.set({ [REFRESH_RATE]: 0 });
        await browser.browserAction.setBadgeText({ text: "New" });
    }
});

browser.runtime.onStartup.addListener(async () => {
    if (await getValueFromStorageBg(OPEN_PROLIFIC, false)) {
        await browser.tabs.create({ url: "https://app.prolific.com/", active: false });
    }
});

async function getValueFromStorageBg<T>(key: string, defaultValue: T): Promise<T> {
    const result = await browser.storage.sync.get(key);
    return result[key] !== undefined ? result[key] as T : defaultValue;
}

function setupTitleAlert(): void {
    browser.tabs.onUpdated.addListener(async (_tabId, changeInfo, tab) => {
        if (!tab.url?.includes('https://app.prolific.com/') || !tab.title || changeInfo.status !== 'complete') return;

        const previousTitle = await getValueFromStorageBg(PROLIFIC_TITLE, 'Prolific');
        const newTitle = tab.title.trim();
        await browser.storage.sync.set({ [PROLIFIC_TITLE]: newTitle });

        const useOld = await getValueFromStorageBg(USE_OLD, false);
        if (!useOld || newTitle === previousTitle || newTitle === 'Prolific') return;

        const previousNumber = getNumberFromTitle(previousTitle);
        const currentNumber = getNumberFromTitle(newTitle);
        if (currentNumber <= previousNumber) return;

        const settings = await browser.storage.sync.get([
            FOCUS_PROLIFIC,
            SHOW_NOTIFICATION,
            AUDIO_ACTIVE,
            AUDIO,
            VOLUME
        ]);

        if (settings[SHOW_NOTIFICATION] ?? true) sendNotification();
        if (settings[AUDIO_ACTIVE] ?? true) {
            const audio = settings[AUDIO] ?? 'alert1.mp3';
            const volume = settings[VOLUME] ? settings[VOLUME] / 100 : 1;
            await playAudio(audio, volume);
        }
        if (settings[FOCUS_PROLIFIC] ?? false) await focusProlific();

        await updateCounterAndBadge(currentNumber - previousNumber);
    });
}

function getNumberFromTitle(title: string): number {
    const match = title.match(/\((\d+)\)/);
    return match ? parseInt(match[1]) : 0;
}

async function focusProlific() {
    const tabs = await browser.tabs.query({ url: "*://app.prolific.com/*" });
    if (tabs.length > 0) {
        await browser.tabs.update(tabs[0].id!, { active: true });
    } else {
        await browser.tabs.create({ url: "https://app.prolific.com/", active: true });
    }
}

async function handlePlaySound(audio: string | null = null, volume: number | null = null): Promise<void> {
    const settings = await browser.storage.sync.get([AUDIO, VOLUME]);
    audio = audio ?? settings[AUDIO] ?? 'alert1.mp3';
    volume = volume ?? (settings[VOLUME] ? settings[VOLUME] / 100 : 1);
    await playAudio(audio!, volume);
}

async function playAudio(audio: string, volume: number): Promise<void> {
    const audioUrl = browser.runtime.getURL(`audio/${audio}`);
    const audioElement = new Audio(audioUrl);
    audioElement.volume = volume;
    audioElement.preload = "auto";
    audioElement.load();

    try {
        await audioElement.play();
    } catch (e) {
        console.error("Audio playback failed:", e);
        await browser.tabs.executeScript({
            code: `(function() {
                const audio = new Audio("${audioUrl}");
                audio.volume = ${volume};
                audio.play();
            })();`
        });
    }
}

async function handleMessages(message: { target: string; type: string; data?: any }): Promise<void> {
    if (message.target !== 'background') return;

    switch (message.type) {
        case 'play-sound':
            await handlePlaySound();
            sendNotification();
            break;
        case 'show-notification':
            sendNotification();
            break;
        case 'change-alert-type':
            setupTitleAlert();
            break;
        case 'new-studies':
            await handleNewStudies(message.data);
            break;
        case 'resetValues':
            await setInitialValues();
            break;
    }
}

async function handleNewStudies(studies: Study[]) {
    if (!studies || studies.length === 0) return;

    const settings = await browser.storage.sync.get([
        SHOW_NOTIFICATION,
        AUDIO_ACTIVE,
        FOCUS_PROLIFIC,
        AUDIO,
        VOLUME,
        USE_OLD,
    ]);

    if (settings[USE_OLD] === true) return;

    if (settings[AUDIO_ACTIVE] ?? true) {
        const audio = settings[AUDIO] ?? 'alert1.mp3';
        const volume = settings[VOLUME] ? settings[VOLUME] / 100 : 1;
        await playAudio(audio, volume);
    }

    if (settings[FOCUS_PROLIFIC] ?? false) {
        await focusProlific();
    }

    if (settings[SHOW_NOTIFICATION] ?? true) {
        studies
            .sort((a, b) => getFloatValueFromMoneyString(b.reward || "0") - getFloatValueFromMoneyString(a.reward || "0"))
            .forEach((study, index) => {
                setTimeout(() => sendNotification(study), index * 1000);
            });
    }

    await updateCounterAndBadge(studies.length);
}

async function updateBadge(counter: number): Promise<void> {
    await browser.browserAction.setBadgeText({ text: counter.toString() });
    await browser.browserAction.setBadgeBackgroundColor({ color: "#9dec14" });
}

async function updateCounterAndBadge(count: number = 1): Promise<void> {
    const currentCounter = await getValueFromStorageBg(COUNTER, 0);
    const newCounter = currentCounter + count;
    await browser.storage.sync.set({ [COUNTER]: newCounter });
    await updateBadge(count);
}

async function setInitialValues(): Promise<void> {
    await browser.storage.local.set({[CURRENT_STUDIES]: []});
    await browser.storage.sync.set({
        [AUDIO_ACTIVE]: true,
        [AUDIO]: "alert1.mp3",
        [SHOW_NOTIFICATION]: true,
        [FOCUS_PROLIFIC]: false,
        [USE_OLD]: false,
        [OPEN_PROLIFIC]: false,
        [VOLUME]: 100,
        [ACTIVE_TAB]: "settings",
        [TRACK_IDS]: true,
        [STUDY_HISTORY_LEN]: 100,
        [SORT_STUDIES]: "created+",
        [REFRESH_RATE]: 0,
        "reward": 0,
        "rewardPerHour": 0,
        "time": 0,
        "researcherBlacklist": [],
        "nameBlacklist": []
    });
}

async function initialize() {
    if (await getValueFromStorageBg(USE_OLD, false)) {
        setupTitleAlert();
    }
}

function sendNotification(study: Study | null = null): void {
    let title = TITLE;
    let message = MESSAGE;
    let id = "";

    if (study) {
        id = study.id || "";
        title = study.title && study.researcher ? `${study.title}\nBy ${study.researcher}` : TITLE;
        message = [
            study.reward && `Reward: ${study.reward}`,
            study.rewardPerHour && `Reward per hour: ${study.rewardPerHour}`,
            study.time && `Time: ${study.time}`
        ].filter(Boolean).join('\n') || MESSAGE;
    }

    void browser.notifications.create(id, {
        type: 'basic',
        iconUrl: browser.runtime.getURL(ICON_URL),
        title,
        message
    });
}

function getFloatValueFromMoneyString(value: string): number {
    const firstWord = value.split(" ")[0];
    if (!firstWord) return 0;

    const amount = parseFloat(firstWord.replace(/[£$]/g, ''));
    return firstWord.startsWith('$') ? amount * 0.8 : amount;
}
