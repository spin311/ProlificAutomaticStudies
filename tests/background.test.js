// Background script (chrome|firefox/dist/background.js): reliability behaviour.
// Run: node --test tests/
const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { createChrome, createStorage, loadScripts, dist, startClock, advance, settle } = require("./support/sandbox");

const PROLIFIC_TABS = [
    { id: 1, url: "https://app.prolific.com/studies" },
    { id: 2, url: "https://app.prolific.com/" },
    { id: 3, url: "https://app.prolific.com/submissions" },
    { id: 4, url: "https://app.prolific.com/studies/0123456789abcdef01234567" },
    { id: 5, url: "https://example.com/studies" },
];

const BUILDS = ["chrome", "firefox"];

for (const build of BUILDS) {
  describe(build, () => {
    function loadBackground({ tabs = [], sync = {}, local = {}, audioFails = false } = {}) {
        const storage = createStorage({ sync, local });
        const { chrome, calls } = createChrome({ storage, tabs });
        const quietConsole = { ...console, error: (...args) => calls.errors.push(args) };
        calls.sounds = [];
        // Firefox plays sounds from the background page with new Audio().
        class FakeAudio {
            load() {}
            async play() {
                if (audioFails) throw new Error("audio blocked");
                calls.sounds.push({ volume: this.volume });
            }
        }
        loadScripts([dist(build, "background.js")], { chrome, globals: { Audio: FakeAudio }, consoleOverride: quietConsole });
        return { chrome, calls, storage };
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
        const { chrome, calls } = loadBackground({ audioFails: true });
        chrome.offscreen.createDocument = async () => {
            throw new Error("offscreen document could not be created");
        };
        chrome.tabs.executeScript = async () => {
            throw new Error("no permission to inject into the active tab");
        };

        // Act
        await chrome.runtime.onMessage.fire({ target: "background", type: "new-studies", data: [study] }, {});
        await new Promise((resolve) => setTimeout(resolve, 20));

        // Assert
        assert.equal(calls.notifications.length, 1);
        assert.equal(calls.notifications[0].id, study.id);
        assert.ok(calls.errors.length >= 1);
    });

    test("tells the user when fast mode pauses", async () => {
        // Arrange
        const { chrome, calls } = loadBackground();

        // Act
        await chrome.runtime.onMessage.fire(
            { target: "background", type: "fast-mode-paused", data: { reason: "rate-limited", minutes: 60 } },
            {}
        );

        // Assert
        assert.equal(calls.notifications.length, 1);
        assert.equal(calls.notifications[0].id, "fast-mode-paused");
        assert.match(calls.notifications[0].title, /60 minutes/);
    });

    test("does not open a study page when the fast mode notice is clicked", async () => {
        // Arrange
        const { chrome, calls } = loadBackground();

        // Act
        await chrome.notifications.onClicked.fire("fast-mode-paused");

        // Assert
        assert.deepEqual(calls.createdTabs, [{ url: "https://app.prolific.com/studies", active: true }]);
    });

        // Volume the alert was played at: Chrome sends it to its offscreen document, Firefox sets it on new Audio().
        const playedVolume = (calls) =>
            calls.messages.find((m) => m.type === "play-sound" && m.target === "offscreen-doc")?.data.volume ?? calls.sounds[0]?.volume;

        test("turns on sound, notifications and notify-once on a fresh install", async (t) => {
            // Arrange
            startClock(t);
            const { chrome, storage } = loadBackground();

            // Act
            const installed = chrome.runtime.onInstalled.fire({ reason: "install" });
            await advance(t, 2000);
            await installed;

            // Assert
            const { audioActive, showNotification, trackIds, audio, volume, activeTab } = storage.sync.data;
            assert.deepEqual({ audioActive, showNotification, trackIds, audio, volume, activeTab },
                { audioActive: true, showNotification: true, trackIds: true, audio: "alert1.mp3", volume: 100, activeTab: "settings" });
            assert.equal(storage.local.data.fastMode, false);
        });

        test("fills in missing settings on update without changing saved ones", async () => {
            // Arrange: an install that only ever saved two settings
            const { chrome, storage } = loadBackground({ sync: { audioActive: false, volume: 40 } });

            // Act
            await chrome.runtime.onInstalled.fire({ reason: "update" });

            // Assert
            const { audioActive, volume, showNotification, trackIds, audio, activeTab } = storage.sync.data;
            assert.deepEqual({ audioActive, volume, showNotification, trackIds, audio, activeTab },
                { audioActive: false, volume: 40, showNotification: true, trackIds: true, audio: "alert1.mp3", activeTab: "settings" });
            assert.equal(storage.local.data.fastMode, false);
            assert.equal(storage.local.data.fastModeInterval, 60);
        });

        test("plays the alert at full volume when no volume is saved", async () => {
            // Arrange
            const { chrome, calls } = loadBackground();

            // Act
            await chrome.runtime.onMessage.fire({ target: "background", type: "new-studies", data: [study] }, {});

            // Assert
            assert.equal(playedVolume(calls), 1);
            assert.equal(calls.errors.length, 0);
        });

        test("plays the alert silently when the volume is set to 0", async () => {
            // Arrange
            const { chrome, calls } = loadBackground({ sync: { volume: 0 } });

            // Act
            await chrome.runtime.onMessage.fire({ target: "background", type: "new-studies", data: [study] }, {});

            // Assert
            assert.equal(playedVolume(calls), 0);
        });
  });
}
