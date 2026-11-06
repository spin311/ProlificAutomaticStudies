// Background service worker (chrome/dist/background.js): reliability behaviour.
// Run: node --test tests/
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createChrome, createStorage, loadScripts, dist, startClock, advance, settle } = require("./support/sandbox");

const PROLIFIC_TABS = [
    { id: 1, url: "https://app.prolific.com/studies" },
    { id: 2, url: "https://app.prolific.com/" },
    { id: 3, url: "https://app.prolific.com/submissions" },
    { id: 4, url: "https://app.prolific.com/studies/0123456789abcdef01234567" },
    { id: 5, url: "https://example.com/studies" },
];

function loadBackground({ tabs = [], sync = {} } = {}) {
    const { chrome, calls } = createChrome({ storage: createStorage({ sync }), tabs });
    const quietConsole = { ...console, error: (...args) => calls.errors.push(args) };
    loadScripts([dist("chrome", "background.js")], { chrome, consoleOverride: quietConsole });
    return { chrome, calls };
}

const study = { id: "0123456789abcdef01234567", title: "A study", researcher: "A lab", reward: "£1.00" };

test("reloads open Prolific Studies tabs after the extension updates", async () => {
    // Arrange
    const { chrome, calls } = loadBackground({ tabs: PROLIFIC_TABS });

    // Act
    await chrome.runtime.onInstalled.fire({ reason: "update" });

    // Assert: only the Studies list, never a study, submission or other site
    assert.deepEqual(calls.reloads, [1, 2]);
});

test("reloads open Prolific Studies tabs after a fresh install", async (t) => {
    // Arrange
    startClock(t);
    const { chrome, calls } = loadBackground({ tabs: PROLIFIC_TABS });

    // Act: the install handler waits a second before opening the welcome page
    const installed = chrome.runtime.onInstalled.fire({ reason: "install" });
    await advance(t, 2000);
    await installed;

    // Assert
    assert.deepEqual(calls.reloads, [1, 2]);
});

test("does not reload tabs when Chrome itself updates", async () => {
    // Arrange
    const { chrome, calls } = loadBackground({ tabs: PROLIFIC_TABS });

    // Act
    await chrome.runtime.onInstalled.fire({ reason: "chrome_update" });

    // Assert
    assert.deepEqual(calls.reloads, []);
});

test("keeps the Prolific tab from being unloaded by Chrome", async () => {
    // Arrange
    const { chrome, calls } = loadBackground();

    // Act
    await chrome.runtime.onMessage.fire({ target: "background", type: "keep-tab-alive" }, { tab: { id: 7 } });

    // Assert
    assert.deepEqual(calls.tabUpdates, [{ tabId: 7, props: { autoDiscardable: false } }]);
});

test("still shows the study notification when the alert sound fails", async () => {
    // Arrange
    const { chrome, calls } = loadBackground();
    chrome.offscreen.createDocument = async () => {
        throw new Error("offscreen document could not be created");
    };

    // Act
    await chrome.runtime.onMessage.fire({ target: "background", type: "new-studies", data: [study] }, {});
    await settle();

    // Assert
    assert.equal(calls.notifications.length, 1);
    assert.equal(calls.notifications[0].id, study.id);
    assert.equal(calls.errors.length, 1);
});


