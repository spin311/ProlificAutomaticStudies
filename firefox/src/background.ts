type Study = {
    id: string | null;
    title: string | null;
    researcher: string | null;
    reward: string | null;
    rewardPerHour: string | null;
    time: string | null;
    timeInMinutes: number | null;
    // Missing on studies saved before 4.2.0.
    places?: string | null;
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
const FAST_MODE_ENABLED_KEY = "fastMode";
const FAST_MODE_INTERVAL_KEY = "fastModeInterval";
const FAST_MODE_PAUSED_NOTIFICATION_ID = "fast-mode-paused";
const PROLIFIC_STUDIES_URL = "https://app.prolific.com/studies";
// Pages that only list studies, so reloading them cannot lose anything.
const PROLIFIC_STUDIES_LIST_PATHS = ["/", "/studies", "/studies/"];

void initialize();
browser.runtime.onMessage.addListener(handleMessages);

browser.notifications.onClicked.addListener((notificationId: string): void => {
    const url = notificationId === FAST_MODE_PAUSED_NOTIFICATION_ID
        ? PROLIFIC_STUDIES_URL
        : notificationId
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
        await fillMissingSettings();
        await browser.browserAction.setBadgeText({ text: "New" });
    }
    // Tabs that were already open may not run the new version until reloaded.
    if (reason === "install" || reason === "update") {
        await reloadProlificStudiesTabs();
    }
});

async function reloadProlificStudiesTabs(): Promise<void> {
    try {
        const tabs = await browser.tabs.query({ url: "https://app.prolific.com/*" });
        const studiesTabs = tabs.filter((tab) => tab.id !== undefined && isProlificStudiesList(tab.url));
        await Promise.all(studiesTabs.map((tab) => browser.tabs.reload(tab.id!)));
    } catch (error) {
        console.error("Prolific Studies Notifier: could not reload Prolific tabs", error);
    }
}

function isProlificStudiesList(url: string | undefined): boolean {
    if (!url) return false;
    try {
        return PROLIFIC_STUDIES_LIST_PATHS.includes(new URL(url).pathname);
    } catch {
        return false;
    }
}

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
    browser.tabs.onUpdated.addListener(async (_tabId, _changeInfo, tab) => {
        // Prolific rewrites "(N) Prolific" in place, and that update carries only the new
        // title, never changeInfo.status. So check the loaded tab, not this update's status.
        if (!tab.url?.includes('https://app.prolific.com/') || !tab.title || tab.status !== 'complete') return;

        const previousTitle = await getValueFromStorageBg(PROLIFIC_TITLE, 'Prolific');
        const newTitle = tab.title.trim();
        // Most updates (favicon, audio, ...) keep the title: skip them without a sync write.
        if (newTitle === previousTitle) return;
        await browser.storage.sync.set({ [PROLIFIC_TITLE]: newTitle });

        const useOld = await getValueFromStorageBg(USE_OLD, false);
        if (!useOld || newTitle === 'Prolific') return;

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
            const volume = (settings[VOLUME] ?? 100) / 100;
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
    volume = volume ?? ((settings[VOLUME] ?? 100) / 100);
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

async function handleMessages(message: { target: string; type: string; data?: any }, sender: browser.runtime.MessageSender): Promise<void> {
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
        case 'keep-tab-alive':
            // Stops Firefox from unloading the Prolific tab to save memory.
            if (sender.tab?.id !== undefined) {
                await browser.tabs.update(sender.tab.id, { autoDiscardable: false } as browser.tabs._UpdateUpdateProperties);
            }
            break;
        case 'fast-mode-paused':
            showFastModePausedNotification(message.data);
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
        const volume = (settings[VOLUME] ?? 100) / 100;
        try {
            await playAudio(audio, volume);
        } catch (error) {
            // A failed sound must not also cost the user the notification.
            console.error("Prolific Studies Notifier: could not play the alert sound", error);
        }
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

// What a fresh install starts with. Updates fill in any of these that are missing
// (e.g. an install that never ran the first-install setup) without changing
// settings the user already chose.
const DEFAULT_SYNC_SETTINGS: Record<string, unknown> = {
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
};

// Local, not sync: fast mode is a per-device risk decision.
const DEFAULT_LOCAL_SETTINGS: Record<string, unknown> = {
    [FAST_MODE_ENABLED_KEY]: false,
    [FAST_MODE_INTERVAL_KEY]: 60,
};

async function setInitialValues(): Promise<void> {
    await browser.storage.local.set({ [CURRENT_STUDIES]: [], ...DEFAULT_LOCAL_SETTINGS });
    await browser.storage.sync.set(DEFAULT_SYNC_SETTINGS);
}

async function fillMissingSettings(): Promise<void> {
    await fillMissingIn(browser.storage.sync, DEFAULT_SYNC_SETTINGS);
    await fillMissingIn(browser.storage.local, DEFAULT_LOCAL_SETTINGS);
}

async function fillMissingIn(area: browser.storage.StorageArea, defaults: Record<string, unknown>): Promise<void> {
    const stored = await area.get(Object.keys(defaults));
    const missing: Record<string, unknown> = {};
    Object.keys(defaults).forEach((key) => {
        if (stored[key] === undefined) missing[key] = defaults[key];
    });
    if (Object.keys(missing).length > 0) {
        await area.set(missing);
    }
}

function showFastModePausedNotification(data: { reason?: string; minutes?: number } | undefined): void {
    const minutes = data?.minutes ?? 60;
    const reason = data?.reason === "restricted"
        ? "Your Prolific account has a temporary restriction."
        : "Prolific asked for fewer checks.";
    void browser.notifications.create(FAST_MODE_PAUSED_NOTIFICATION_ID, {
        type: 'basic',
        iconUrl: browser.runtime.getURL(ICON_URL),
        title: `Fast mode paused for ${minutes} minutes`,
        message: `${reason} New studies still appear every 2 minutes.`,
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
