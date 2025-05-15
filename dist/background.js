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
var Reason = chrome.offscreen.Reason;
var ContextType = chrome.runtime.ContextType;
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
const REWARD = "reward";
const REWARD_PER_HOUR = "rewardPerHour";
const ACTIVE_TAB = "activeTab";
const ICON_URL = 'imgs/logo.png';
const TITLE = 'Prolific Automatic Studies';
const MESSAGE = 'A new study is available on Prolific!';
const USE_OLD = "useOld";
const PROLIFIC_TITLE = "prolificTitle";
const TRACK_IDS = "trackIds";
const STUDY_HISTORY_LEN = "studyHistoryLen";
let creating = null; // A global promise to avoid concurrency issues
initialize();
chrome.runtime.onMessage.addListener(handleMessages);
chrome.notifications.onClicked.addListener(function (notificationId) {
    if (!!notificationId) {
        chrome.tabs.create({ url: `https://app.prolific.com/studies/${notificationId}`, active: true });
    }
    else {
        chrome.tabs.create({ url: "https://app.prolific.com/", active: true });
    }
    chrome.notifications.clear(notificationId);
});
chrome.notifications.onButtonClicked.addListener(function (notificationId, buttonIndex) {
    if (buttonIndex === 0) {
        if (!!notificationId) {
            chrome.tabs.create({ url: `https://app.prolific.com/studies/${notificationId}`, active: true });
        }
        else {
            chrome.tabs.create({ url: "https://app.prolific.com/", active: true });
        }
    }
    chrome.notifications.clear(notificationId);
});
chrome.runtime.onInstalled.addListener((details) => __awaiter(void 0, void 0, void 0, function* () {
    if (details.reason === "install") {
        yield setInitialValues();
        yield new Promise(resolve => setTimeout(resolve, 1000));
        yield chrome.tabs.create({ url: "https://spin311.github.io/ProlificAutomaticStudies/", active: true });
        chrome.runtime.setUninstallURL(`https://svitspindler.com/uninstall?extension=${encodeURI("Prolific Studies Notifier")}`);
    }
    else if (details.reason === "update") {
        chrome.action.setBadgeText({ text: "New" });
        chrome.storage.sync.set({
            [STUDY_HISTORY_LEN]: 100,
            [TRACK_IDS]: true,
        });
        chrome.runtime.setUninstallURL(`https://svitspindler.com/uninstall?extension=${encodeURI("Prolific Studies Notifier")}`);
    }
}));
function getValueFromStorage(key, defaultValue) {
    return new Promise((resolve) => {
        chrome.storage.sync.get(key, function (result) {
            resolve((result[key] !== undefined) ? result[key] : defaultValue);
        });
    });
}
function setupTitleAlert() {
    const tabsOnUpdatedListener = (_, _changeInfo, tab) => __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e;
        const previousTitle = yield getValueFromStorage(PROLIFIC_TITLE, 'Prolific');
        if (tab.url && tab.url.includes('https://app.prolific.com/')) {
        }
        if (tab.url && tab.url.includes('https://app.prolific.com/') && tab.title && tab.title !== previousTitle && tab.status === 'complete') {
            const newTitle = tab.title.trim();
            if (newTitle === 'Prolific') {
                yield chrome.storage.sync.set({ [PROLIFIC_TITLE]: newTitle });
                return;
            }
            const titleStorageValues = yield chrome.storage.sync.get([USE_OLD, FOCUS_PROLIFIC, SHOW_NOTIFICATION, AUDIO_ACTIVE, AUDIO, VOLUME]);
            const useOld = (_a = titleStorageValues[USE_OLD]) !== null && _a !== void 0 ? _a : false;
            if (!useOld) {
                chrome.tabs.onUpdated.removeListener(tabsOnUpdatedListener);
                return;
            }
            const previousNumber = getNumberFromTitle(previousTitle);
            const currentNumber = getNumberFromTitle(tab.title);
            const shouldFocusProlific = (_b = titleStorageValues[FOCUS_PROLIFIC]) !== null && _b !== void 0 ? _b : false;
            yield chrome.storage.sync.set({ [PROLIFIC_TITLE]: newTitle });
            if (currentNumber > previousNumber) {
                const shouldSendNotification = (_c = titleStorageValues[SHOW_NOTIFICATION]) !== null && _c !== void 0 ? _c : true;
                if (shouldSendNotification) {
                    sendNotification();
                }
                const shouldPlayAudio = (_d = titleStorageValues[AUDIO_ACTIVE]) !== null && _d !== void 0 ? _d : true;
                if (shouldPlayAudio) {
                    const audio = (_e = titleStorageValues[AUDIO]) !== null && _e !== void 0 ? _e : 'alert1.mp3';
                    const volume = titleStorageValues[VOLUME] ? titleStorageValues[VOLUME] / 100 : 100;
                    yield playAudio(audio, volume);
                }
                if (shouldFocusProlific) {
                    yield focusProlific();
                }
                yield updateCounterAndBadge(currentNumber - previousNumber);
            }
        }
    });
    chrome.tabs.onUpdated.addListener(tabsOnUpdatedListener);
}
function getNumberFromTitle(title) {
    const match = title.match(/\((\d+)\)/);
    return match ? parseInt(match[1]) : 0;
}
function focusProlific() {
    return __awaiter(this, void 0, void 0, function* () {
        const tabs = yield chrome.tabs.query({ url: "*://app.prolific.com/*" });
        if (tabs.length > 0) {
            yield chrome.tabs.update(tabs[0].id, { active: true });
        }
        else {
            yield chrome.tabs.create({ url: "https://app.prolific.com/", active: true });
        }
    });
}
function handlePlaySound() {
    return __awaiter(this, arguments, void 0, function* (audio = null, volume = null) {
        var _a;
        if (!audio || !volume) {
            const audioValues = yield chrome.storage.sync.get([AUDIO, VOLUME]);
            audio = (_a = audioValues[AUDIO]) !== null && _a !== void 0 ? _a : 'alert1.mp3';
            volume = audioValues[VOLUME] ? audioValues[VOLUME] / 100 : 100;
        }
        yield playAudio(audio, volume);
    });
}
function handleMessages(message) {
    return __awaiter(this, void 0, void 0, function* () {
        // Return early if this message isn't meant for the offscreen document.
        if (message.target !== 'background') {
            return Promise.resolve();
        }
        // Dispatch the message to an appropriate handler.
        switch (message.type) {
            case 'play-sound':
                yield handlePlaySound();
                sendNotification();
                break;
            case 'show-notification':
                sendNotification();
                break;
            case 'clear-badge':
                yield chrome.action.setBadgeText({ text: '' });
                break;
            case 'change-alert-type':
                setupTitleAlert();
                break;
            case 'new-studies':
                yield handleNewStudies(message.data);
                break;
        }
    });
}
function handleNewStudies(studies) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f;
        if (!studies)
            return;
        const studiesStorageValues = yield chrome.storage.sync.get([
            SHOW_NOTIFICATION,
            AUDIO_ACTIVE,
            FOCUS_PROLIFIC,
            REWARD,
            REWARD_PER_HOUR,
            AUDIO,
            VOLUME,
            USE_OLD
        ]);
        if (studiesStorageValues[USE_OLD] === true)
            return;
        const shouldShowNotification = (_a = studiesStorageValues[SHOW_NOTIFICATION]) !== null && _a !== void 0 ? _a : true;
        const shouldPlayAudio = (_b = studiesStorageValues[AUDIO_ACTIVE]) !== null && _b !== void 0 ? _b : true;
        const shouldFocusProlific = (_c = studiesStorageValues[FOCUS_PROLIFIC]) !== null && _c !== void 0 ? _c : false;
        const reward = (_d = studiesStorageValues[REWARD]) !== null && _d !== void 0 ? _d : 0;
        const rewardPerHour = (_e = studiesStorageValues[REWARD_PER_HOUR]) !== null && _e !== void 0 ? _e : 0;
        if (reward > 0 || rewardPerHour > 0) {
            studies = studies.filter((study) => {
                if (reward && study.reward && getFloatValueFromMoneyString(study.reward) < reward) {
                    return false;
                }
                return !(rewardPerHour && study.rewardPerHour && getFloatValueFromMoneyString(study.rewardPerHour) < rewardPerHour);
            });
        }
        if (studies.length === 0)
            return;
        if (shouldPlayAudio) {
            const audio = (_f = studiesStorageValues[AUDIO]) !== null && _f !== void 0 ? _f : 'alert1.mp3';
            const volume = studiesStorageValues[VOLUME] ? studiesStorageValues[VOLUME] / 100 : 100;
            yield playAudio(audio, volume);
        }
        if (shouldFocusProlific) {
            yield focusProlific();
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
        yield updateCounterAndBadge(studies.length);
    });
}
chrome.runtime.onStartup.addListener(function () {
    return __awaiter(this, void 0, void 0, function* () {
        if (yield getValueFromStorage(OPEN_PROLIFIC, false)) {
            yield chrome.tabs.create({ url: "https://app.prolific.com/", active: false });
        }
    });
});
function initialize() {
    return __awaiter(this, void 0, void 0, function* () {
        if (yield getValueFromStorage(USE_OLD, false)) {
            setupTitleAlert();
        }
    });
}
function playAudio() {
    return __awaiter(this, arguments, void 0, function* (audio = 'alert1.mp3', volume) {
        yield setupOffscreenDocument('audio/audio.html');
        const req = {
            audio: audio,
            volume: volume
        };
        yield chrome.runtime.sendMessage({
            type: 'play-sound',
            target: 'offscreen-doc',
            data: req
        });
    });
}
function setInitialValues() {
    return __awaiter(this, void 0, void 0, function* () {
        yield chrome.storage.sync.set({
            [AUDIO_ACTIVE]: true,
            [AUDIO]: "alert1.mp3",
            [SHOW_NOTIFICATION]: true,
            [VOLUME]: 100,
            [ACTIVE_TAB]: "settings",
            [TRACK_IDS]: true,
            [STUDY_HISTORY_LEN]: 100
        });
    });
}
function sendNotification(study = null) {
    let title = TITLE;
    let message = MESSAGE;
    let id = "";
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
    const options = {
        type: 'basic',
        iconUrl: chrome.runtime.getURL(ICON_URL),
        title: title,
        message: message,
        buttons: [{ title: 'Open Study' }, { title: 'Dismiss' }],
    };
    chrome.notifications.create(id, options);
}
function updateBadge(counter) {
    return __awaiter(this, void 0, void 0, function* () {
        yield chrome.action.setBadgeText({ text: counter.toString() });
        yield chrome.action.setBadgeBackgroundColor({ color: "#9dec14" });
        setTimeout(() => __awaiter(this, void 0, void 0, function* () {
            yield chrome.action.setBadgeText({ text: '' });
        }), 20000);
    });
}
function updateCounterAndBadge() {
    return __awaiter(this, arguments, void 0, function* (count = 1) {
        yield updateBadge(count);
        let counter = (yield getValueFromStorage(COUNTER, 0)) + count;
        yield chrome.storage.sync.set({ [COUNTER]: counter });
    });
}
function setupOffscreenDocument(path) {
    return __awaiter(this, void 0, void 0, function* () {
        // Check all windows controlled by the service worker to see if one
        // of them is the offscreen document with the given path
        const offscreenUrl = chrome.runtime.getURL(path);
        const existingContexts = yield chrome.runtime.getContexts({
            contextTypes: [ContextType.OFFSCREEN_DOCUMENT],
            documentUrls: [offscreenUrl]
        });
        if (existingContexts.length > 0) {
            return;
        }
        if (creating) {
            yield creating;
        }
        else {
            creating = chrome.offscreen.createDocument({
                url: path,
                reasons: [Reason.AUDIO_PLAYBACK],
                justification: 'Audio playback'
            });
            yield creating;
            creating = null;
        }
    });
}
function getFloatValueFromMoneyString(value) {
    const firstWord = value.split(" ")[0];
    if (firstWord.charAt(0) === '£') {
        return parseFloat(firstWord.slice(1));
    }
    else if (firstWord.charAt(0) === '$') {
        return parseFloat(firstWord.slice(1)) * 0.8;
    }
    else {
        return 0;
    }
}
