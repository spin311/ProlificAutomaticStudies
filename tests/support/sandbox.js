// Recorded calls are copied with toPlain(): objects created inside the vm belong to
// another realm, and node:assert's deepStrictEqual compares prototypes.
// Shared fakes for running the compiled extension scripts (chrome/dist/*.js)
// in a vm sandbox: a fake chrome.* API, a fake Prolific page and a mocked clock.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..", "..");
const CLOCK_START = 1_700_000_000_000;
const STUDIES_LIST_SELECTOR = 'div[data-testid="studies-list"]';

function readDist(build, file) {
    return fs.readFileSync(path.join(ROOT, build, "dist", file), "utf8");
}

function makeEvent() {
    const listeners = [];
    return {
        addListener: (fn) => listeners.push(fn),
        removeListener: (fn) => listeners.splice(listeners.indexOf(fn) >>> 0, 1),
        hasListener: (fn) => listeners.includes(fn),
        async fire(...args) {
            for (const fn of [...listeners]) await fn(...args);
        },
    };
}

function makeStorageArea(areaName, initial, onChanged) {
    const data = { ...initial };
    const pick = (keys) => {
        if (keys == null) return { ...data };
        const list = Array.isArray(keys) ? keys : typeof keys === "string" ? [keys] : Object.keys(keys);
        return Object.fromEntries(list.filter((key) => key in data).map((key) => [key, data[key]]));
    };
    return {
        data,
        get(keys, callback) {
            const result = pick(keys);
            if (callback) {
                callback(result);
                return undefined;
            }
            return Promise.resolve(result);
        },
        async set(items) {
            const changes = Object.fromEntries(
                Object.entries(items).map(([key, value]) => [key, { oldValue: data[key], newValue: value }])
            );
            Object.assign(data, items);
            await onChanged.fire(changes, areaName);
        },
    };
}

// One storage per "browser": share it between tabs to simulate several Prolific tabs.
function createStorage({ sync = {}, local = {} } = {}) {
    const onChanged = makeEvent();
    return {
        onChanged,
        sync: makeStorageArea("sync", sync, onChanged),
        local: makeStorageArea("local", local, onChanged),
    };
}

const toPlain = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

function matchesPattern(pattern, url) {
    const regex = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
    return regex.test(url);
}

function createChrome({ storage = createStorage(), tabs = [] } = {}) {
    const calls = { messages: [], notifications: [], tabUpdates: [], reloads: [], createdTabs: [], errors: [] };
    const chrome = {
        storage,
        runtime: {
            id: "test-extension",
            onMessage: makeEvent(),
            onInstalled: makeEvent(),
            onStartup: makeEvent(),
            ContextType: { OFFSCREEN_DOCUMENT: "OFFSCREEN_DOCUMENT" },
            sendMessage: async (message) => {
                calls.messages.push(toPlain(message));
            },
            getURL: (file) => `chrome-extension://test-extension/${file}`,
            getContexts: async () => [],
            setUninstallURL: () => {},
        },
        offscreen: {
            Reason: { AUDIO_PLAYBACK: "AUDIO_PLAYBACK" },
            createDocument: async () => {},
        },
        notifications: {
            onClicked: makeEvent(),
            onButtonClicked: makeEvent(),
            create: (idOrOptions, options) => {
                calls.notifications.push(
                    toPlain(typeof idOrOptions === "string" ? { id: idOrOptions, ...options } : { id: "", ...idOrOptions })
                );
            },
            clear: () => {},
        },
        tabs: {
            query: async ({ url }) => tabs.filter((tab) => matchesPattern(url, tab.url)),
            reload: async (tabId) => {
                calls.reloads.push(tabId);
            },
            update: async (tabId, props) => {
                calls.tabUpdates.push({ tabId, props: toPlain(props) });
            },
            create: async (props) => {
                calls.createdTabs.push(toPlain(props));
            },
            sendMessage: async () => {},
        },
        action: {
            setBadgeText: async () => {},
            setBadgeBackgroundColor: async () => {},
        },
    };
    return { chrome, calls };
}

// navigator.locks of one browser profile; share it between tabs like storage.
function createLocks() {
    const queues = new Map();
    return {
        request(name, callback) {
            const result = (queues.get(name) ?? Promise.resolve()).then(() => callback());
            queues.set(name, result.catch(() => {}));
            return result;
        },
    };
}

// A Prolific tab as content scripts see it. `page` lets a test change it.
function createPage({ hasStudiesList = true, focused = false, random = 0.5, locks = createLocks() } = {}) {
    const page = { hasStudiesList, focused, random, reloads: 0, performanceObservers: [] };
    const math = Object.create(Math);
    math.random = () => page.random;
    class FakePerformanceObserver {
        constructor(callback) {
            this.callback = callback;
            page.performanceObservers.push(this);
        }
        observe() {}
        disconnect() {}
    }
    page.emitResource = (url) => {
        page.performanceObservers.forEach((observer) =>
            observer.callback({ getEntries: () => [{ name: url, entryType: "resource" }] })
        );
    };
    const globals = {
        window: new EventTarget(),
        document: {
            body: {},
            querySelector: (selector) => (selector === STUDIES_LIST_SELECTOR && page.hasStudiesList ? {} : null),
            hasFocus: () => page.focused,
        },
        location: {
            reload: () => {
                page.reloads += 1;
            },
        },
        PerformanceObserver: FakePerformanceObserver,
        MutationObserver: class {
            observe() {}
            disconnect() {}
        },
        CustomEvent,
        Math: math,
        navigator: { locks },
    };
    return { page, globals };
}

// Runs the given compiled files in one shared global scope, like scripts in one extension world.
function loadScripts(sources, { chrome, globals = {}, consoleOverride } = {}) {
    const sandbox = {
        chrome,
        console: consoleOverride ?? console,
        Date,
        URL,
        setTimeout: (...args) => setTimeout(...args),
        clearTimeout: (...args) => clearTimeout(...args),
        setInterval: (...args) => setInterval(...args),
        clearInterval: (...args) => clearInterval(...args),
        ...globals,
    };
    vm.createContext(sandbox);
    sources.forEach(({ name, code }) => vm.runInContext(code, sandbox, { filename: name }));
    return sandbox;
}

function dist(build, file) {
    return { name: `${build}/dist/${file}`, code: readDist(build, file) };
}

// Mocks setTimeout/setInterval/Date for this test. Create sandboxes after calling it.
function startClock(t) {
    t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: CLOCK_START });
}

async function settle() {
    for (let i = 0; i < 30; i++) await new Promise((resolve) => setImmediate(resolve));
}

// Moves the mocked clock forward in 1-second steps, letting async work finish in between.
async function advance(t, ms) {
    await settle();
    for (let elapsed = 0; elapsed < ms; elapsed += 1000) {
        t.mock.timers.tick(Math.min(1000, ms - elapsed));
        await settle();
    }
}

const elapsedSeconds = (timestamp) => Math.round((timestamp - CLOCK_START) / 1000);

module.exports = {
    CLOCK_START,
    createStorage,
    createLocks,
    createChrome,
    createPage,
    loadScripts,
    toPlain,
    dist,
    startClock,
    settle,
    advance,
    elapsedSeconds,
};
