"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var _a;
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
browser.notifications.onClicked.addListener((notificationId) => {
    const url = notificationId
        ? `https://app.prolific.com/studies/${notificationId}`
        : "https://app.prolific.com/";
    void browser.tabs.create({ url, active: true });
    void browser.notifications.clear(notificationId);
});
(_a = browser.notifications.onButtonClicked) === null || _a === void 0 ? void 0 : _a.addListener((notificationId, buttonIndex) => {
    if (buttonIndex === 0) {
        const url = notificationId
            ? `https://app.prolific.com/studies/${notificationId}`
            : "https://app.prolific.com/";
        void browser.tabs.create({ url, active: true });
    }
    void browser.notifications.clear(notificationId);
});
browser.runtime.onInstalled.addListener((_a) => __awaiter(void 0, [_a], void 0, function* ({ reason }) {
    var _b, _c, _d;
    if (reason === "install") {
        yield setInitialValues();
        yield new Promise(resolve => setTimeout(resolve, 1000));
        yield browser.tabs.create({ url: "https://svitspindler.com/prolific-studies-notifier", active: true });
        (_c = (_b = browser.runtime).setUninstallURL) === null || _c === void 0 ? void 0 : _c.call(_b, `https://svitspindler.com/uninstall?extension=${encodeURIComponent("Prolific Studies Notifier Firefox")}`);
    }
    else if (reason === "update") {
        const result = yield browser.storage.sync.get([CURRENT_STUDIES]);
        yield browser.storage.local.set({ [CURRENT_STUDIES]: (_d = result[CURRENT_STUDIES]) !== null && _d !== void 0 ? _d : [] });
        yield browser.storage.sync.set({ [REFRESH_RATE]: 0 });
        yield browser.browserAction.setBadgeText({ text: "New" });
    }
}));
browser.runtime.onStartup.addListener(() => __awaiter(void 0, void 0, void 0, function* () {
    if (yield getValueFromStorageBg(OPEN_PROLIFIC, false)) {
        yield browser.tabs.create({ url: "https://app.prolific.com/", active: false });
    }
}));
function getValueFromStorageBg(key, defaultValue) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield browser.storage.sync.get(key);
        return result[key] !== undefined ? result[key] : defaultValue;
    });
}
function setupTitleAlert() {
    browser.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e;
        if (!((_a = tab.url) === null || _a === void 0 ? void 0 : _a.includes('https://app.prolific.com/')) || !tab.title || changeInfo.status !== 'complete')
            return;
        const previousTitle = yield getValueFromStorageBg(PROLIFIC_TITLE, 'Prolific');
        const newTitle = tab.title.trim();
        yield browser.storage.sync.set({ [PROLIFIC_TITLE]: newTitle });
        const useOld = yield getValueFromStorageBg(USE_OLD, false);
        if (!useOld || newTitle === previousTitle || newTitle === 'Prolific')
            return;
        const previousNumber = getNumberFromTitle(previousTitle);
        const currentNumber = getNumberFromTitle(newTitle);
        if (currentNumber <= previousNumber)
            return;
        const settings = yield browser.storage.sync.get([
            FOCUS_PROLIFIC,
            SHOW_NOTIFICATION,
            AUDIO_ACTIVE,
            AUDIO,
            VOLUME
        ]);
        if ((_b = settings[SHOW_NOTIFICATION]) !== null && _b !== void 0 ? _b : true)
            sendNotification();
        if ((_c = settings[AUDIO_ACTIVE]) !== null && _c !== void 0 ? _c : true) {
            const audio = (_d = settings[AUDIO]) !== null && _d !== void 0 ? _d : 'alert1.mp3';
            const volume = settings[VOLUME] ? settings[VOLUME] / 100 : 1;
            yield playAudio(audio, volume);
        }
        if ((_e = settings[FOCUS_PROLIFIC]) !== null && _e !== void 0 ? _e : false)
            yield focusProlific();
        yield updateCounterAndBadge(currentNumber - previousNumber);
    }));
}
function getNumberFromTitle(title) {
    const match = title.match(/\((\d+)\)/);
    return match ? parseInt(match[1]) : 0;
}
function focusProlific() {
    return __awaiter(this, void 0, void 0, function* () {
        const tabs = yield browser.tabs.query({ url: "*://app.prolific.com/*" });
        if (tabs.length > 0) {
            yield browser.tabs.update(tabs[0].id, { active: true });
        }
        else {
            yield browser.tabs.create({ url: "https://app.prolific.com/", active: true });
        }
    });
}
function handlePlaySound() {
    return __awaiter(this, arguments, void 0, function* (audio = null, volume = null) {
        var _a;
        const settings = yield browser.storage.sync.get([AUDIO, VOLUME]);
        audio = (_a = audio !== null && audio !== void 0 ? audio : settings[AUDIO]) !== null && _a !== void 0 ? _a : 'alert1.mp3';
        volume = volume !== null && volume !== void 0 ? volume : (settings[VOLUME] ? settings[VOLUME] / 100 : 1);
        yield playAudio(audio, volume);
    });
}
function playAudio(audio, volume) {
    return __awaiter(this, void 0, void 0, function* () {
        const audioUrl = browser.runtime.getURL(`audio/${audio}`);
        const audioElement = new Audio(audioUrl);
        audioElement.volume = volume;
        audioElement.preload = "auto";
        audioElement.load();
        try {
            yield audioElement.play();
        }
        catch (e) {
            console.error("Audio playback failed:", e);
            yield browser.tabs.executeScript({
                code: `(function() {
                const audio = new Audio("${audioUrl}");
                audio.volume = ${volume};
                audio.play();
            })();`
            });
        }
    });
}
function handleMessages(message) {
    return __awaiter(this, void 0, void 0, function* () {
        if (message.target !== 'background')
            return;
        switch (message.type) {
            case 'play-sound':
                yield handlePlaySound();
                sendNotification();
                break;
            case 'show-notification':
                sendNotification();
                break;
            case 'change-alert-type':
                setupTitleAlert();
                break;
            case 'new-studies':
                yield handleNewStudies(message.data);
                break;
            case 'resetValues':
                yield setInitialValues();
                break;
        }
    });
}
function handleNewStudies(studies) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        if (!studies || studies.length === 0)
            return;
        const settings = yield browser.storage.sync.get([
            SHOW_NOTIFICATION,
            AUDIO_ACTIVE,
            FOCUS_PROLIFIC,
            AUDIO,
            VOLUME,
            USE_OLD,
        ]);
        if (settings[USE_OLD] === true)
            return;
        if ((_a = settings[AUDIO_ACTIVE]) !== null && _a !== void 0 ? _a : true) {
            const audio = (_b = settings[AUDIO]) !== null && _b !== void 0 ? _b : 'alert1.mp3';
            const volume = settings[VOLUME] ? settings[VOLUME] / 100 : 1;
            yield playAudio(audio, volume);
        }
        if ((_c = settings[FOCUS_PROLIFIC]) !== null && _c !== void 0 ? _c : false) {
            yield focusProlific();
        }
        if ((_d = settings[SHOW_NOTIFICATION]) !== null && _d !== void 0 ? _d : true) {
            studies
                .sort((a, b) => getFloatValueFromMoneyString(b.reward || "0") - getFloatValueFromMoneyString(a.reward || "0"))
                .forEach((study, index) => {
                setTimeout(() => sendNotification(study), index * 1000);
            });
        }
        yield updateCounterAndBadge(studies.length);
    });
}
function updateBadge(counter) {
    return __awaiter(this, void 0, void 0, function* () {
        yield browser.browserAction.setBadgeText({ text: counter.toString() });
        yield browser.browserAction.setBadgeBackgroundColor({ color: "#9dec14" });
    });
}
function updateCounterAndBadge() {
    return __awaiter(this, arguments, void 0, function* (count = 1) {
        const currentCounter = yield getValueFromStorageBg(COUNTER, 0);
        const newCounter = currentCounter + count;
        yield browser.storage.sync.set({ [COUNTER]: newCounter });
        yield updateBadge(count);
    });
}
function setInitialValues() {
    return __awaiter(this, void 0, void 0, function* () {
        yield browser.storage.local.set({ [CURRENT_STUDIES]: [] });
        yield browser.storage.sync.set({
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
    });
}
function initialize() {
    return __awaiter(this, void 0, void 0, function* () {
        if (yield getValueFromStorageBg(USE_OLD, false)) {
            setupTitleAlert();
        }
    });
}
function sendNotification(study = null) {
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
function getFloatValueFromMoneyString(value) {
    const firstWord = value.split(" ")[0];
    if (!firstWord)
        return 0;
    const amount = parseFloat(firstWord.replace(/[£$]/g, ''));
    return firstWord.startsWith('$') ? amount * 0.8 : amount;
}
