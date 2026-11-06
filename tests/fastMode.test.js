// Opt-in fast mode (chrome/dist/fastMode.js): asks Prolific's Studies page to
// refresh more often than its own 2 minutes, with safeguards.
// Run: node --test tests/
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
    createChrome,
    createStorage,
    createLocks,
    createPage,
    loadScripts,
    dist,
    startClock,
    advance,
    elapsedSeconds,
} = require("./support/sandbox");

const MINUTE = 60 * 1000;
const FAST_MODE_ON = { fastMode: true, fastModeInterval: 60 };

// Opens a Prolific tab running fast mode. Fast mode settings live in storage.local.
// `statuses` are the page's answers to refresh requests in order (the last one
// repeats); null means the page never answers.
function openTab({
    settings = FAST_MODE_ON,
    sync = {},
    storage = createStorage({ sync, local: settings }),
    statuses = ["ok"],
    ...pageOptions
} = {}) {
    const { chrome, calls } = createChrome({ storage });
    const { page, globals } = createPage(pageOptions);
    const refreshes = [];
    const queue = statuses === null ? null : [...statuses];
    globals.window.addEventListener("psn:refresh-request", (event) => {
        refreshes.push(elapsedSeconds(Date.now()));
        if (queue === null) return;
        const status = queue.length > 1 ? queue.shift() : queue[0];
        globals.window.dispatchEvent(
            new CustomEvent("psn:refresh-result", { detail: JSON.stringify({ id: event.detail, status }) })
        );
    });
    loadScripts([dist("chrome", "fastMode.js")], { chrome, globals });
    return { calls, page, refreshes, storage };
}

const gaps = (times) => times.slice(1).map((time, i) => time - times[i]);

test("does not refresh the page when fast mode is off", async (t) => {
    // Arrange
    startClock(t);
    const { refreshes } = openTab({ settings: {} });

    // Act
    await advance(t, 10 * MINUTE);

    // Assert
    assert.deepEqual(refreshes, []);
});

test("ignores a fast mode setting synced from another device", async (t) => {
    // Arrange: turning it on is a per-device decision
    startClock(t);
    const { refreshes } = openTab({ settings: {}, sync: FAST_MODE_ON });

    // Act
    await advance(t, 10 * MINUTE);

    // Assert
    assert.deepEqual(refreshes, []);
});

test("refreshes after 60 seconds when no interval is set", async (t) => {
    // Arrange: random 0.5 means no variation
    startClock(t);
    const { refreshes } = openTab({ settings: { fastMode: true } });

    // Act
    await advance(t, 59 * 1000);
    const before = refreshes.length;
    await advance(t, 2 * 1000);

    // Assert
    assert.equal(before, 0);
    assert.deepEqual(refreshes, [60]);
});

test("varies the interval down to 25% shorter", async (t) => {
    // Arrange
    startClock(t);
    const { refreshes } = openTab({ random: 0 });

    // Act
    await advance(t, 3 * MINUTE);

    // Assert: 60 s * 0.75
    assert.deepEqual(refreshes, [45, 90, 135, 180]);
});

test("varies the interval up to 25% longer", async (t) => {
    // Arrange
    startClock(t);
    const { refreshes } = openTab({ random: 0.999999 });

    // Act
    await advance(t, 3 * MINUTE);

    // Assert: 60 s * 1.25
    assert.deepEqual(refreshes, [75, 150]);
});

test("never refreshes more often than every 30 seconds", async (t) => {
    // Arrange: a too-short interval and the shortest random variation
    startClock(t);
    const { refreshes } = openTab({ settings: { fastMode: true, fastModeInterval: 5 }, random: 0 });

    // Act
    await advance(t, 5 * MINUTE);

    // Assert
    assert.ok(refreshes.length > 0);
    assert.ok(refreshes[0] >= 30);
    assert.ok(gaps(refreshes).every((gap) => gap >= 30), `gaps: ${gaps(refreshes)}`);
});

test("lets only one Prolific tab refresh at a time", async (t) => {
    // Arrange: two tabs with different random variation share storage and locks
    startClock(t);
    const storage = createStorage({ local: FAST_MODE_ON });
    const locks = createLocks();
    const tabA = openTab({ storage, locks, random: 0.2 });
    const tabB = openTab({ storage, locks, random: 0.8 });

    // Act
    await advance(t, 10 * MINUTE);

    // Assert: refreshes from all tabs stay at least 75% of the interval apart
    const all = [...tabA.refreshes, ...tabB.refreshes].sort((a, b) => a - b);
    assert.ok(all.length > 0);
    assert.ok(gaps(all).every((gap) => gap >= 45), `gaps: ${gaps(all)}`);
});

test("refreshes once when several tabs' timers fire at the same moment", async (t) => {
    // Arrange: identical timing, as after the computer wakes from sleep
    startClock(t);
    const storage = createStorage({ local: FAST_MODE_ON });
    const locks = createLocks();
    const tabs = [1, 2, 3].map(() => openTab({ storage, locks }));

    // Act
    await advance(t, 10 * MINUTE);

    // Assert
    const all = tabs.flatMap((tab) => tab.refreshes).sort((a, b) => a - b);
    assert.ok(all.length > 0);
    assert.ok(gaps(all).every((gap) => gap >= 45), `gaps: ${gaps(all)}`);
});

test("does not refresh while the Studies list is not on the page", async (t) => {
    // Arrange: logged out, on another Prolific page, or on Prolific's error page
    startClock(t);
    const { refreshes } = openTab({ hasStudiesList: false });

    // Act
    await advance(t, 10 * MINUTE);

    // Assert
    assert.deepEqual(refreshes, []);
});

test("pauses for 30 minutes and tells the user when the account is restricted", async (t) => {
    // Arrange
    startClock(t);
    const { refreshes, calls } = openTab({ statuses: ["restricted", "ok"] });

    // Act
    await advance(t, 30 * MINUTE);
    const duringPause = [...refreshes];
    await advance(t, 90 * 1000);

    // Assert
    assert.deepEqual(duringPause, [60]);
    assert.deepEqual(refreshes, [60, 1860]);
    assert.deepEqual(calls.messages, [
        { target: "background", type: "fast-mode-paused", data: { reason: "restricted", minutes: 30 } },
    ]);
});

test("pauses for an hour and tells the user when Prolific rate-limits", async (t) => {
    // Arrange
    startClock(t);
    const { refreshes, calls } = openTab({ statuses: ["rate-limited", "ok"] });

    // Act
    await advance(t, 60 * MINUTE);
    const duringPause = [...refreshes];
    await advance(t, 90 * 1000);

    // Assert
    assert.deepEqual(duringPause, [60]);
    assert.deepEqual(refreshes, [60, 3660]);
    assert.deepEqual(calls.messages, [
        { target: "background", type: "fast-mode-paused", data: { reason: "rate-limited", minutes: 60 } },
    ]);
});

test("keeps a pause when fast mode is switched off and on again", async (t) => {
    // Arrange
    startClock(t);
    const { refreshes, storage } = openTab({ statuses: ["rate-limited", "ok"] });
    await advance(t, 2 * MINUTE);

    // Act
    await storage.local.set({ fastMode: false });
    await storage.local.set({ fastMode: true });
    await advance(t, 30 * MINUTE);

    // Assert
    assert.deepEqual(refreshes, [60]);
});

test("doubles the wait after each failed refresh, up to 15 minutes", async (t) => {
    // Arrange
    startClock(t);
    const { refreshes } = openTab({ statuses: ["error"] });

    // Act
    await advance(t, 46 * MINUTE);

    // Assert
    assert.deepEqual(gaps(refreshes).slice(0, 5), [120, 240, 480, 900, 900]);
});

test("keeps backing off after the Prolific tab is reloaded", async (t) => {
    // Arrange: the first refresh fails; then the tab reloads (a fresh script, same storage)
    startClock(t);
    const storage = createStorage({ local: FAST_MODE_ON });
    const before = openTab({ storage, statuses: ["error"] });
    await advance(t, 61 * 1000);
    before.page.hasStudiesList = false;

    // Act
    const after = openTab({ storage, statuses: ["error"] });
    await advance(t, 3 * MINUTE);

    // Assert: waits out the doubled interval (until 180 s) instead of starting over
    assert.deepEqual(before.refreshes, [60]);
    assert.deepEqual(after.refreshes, [181]);
});

test("backs off when the page never answers", async (t) => {
    // Arrange: e.g. Prolific changed its page and the bridge cannot find its refresh
    startClock(t);
    const { refreshes } = openTab({ statuses: null });

    // Act
    await advance(t, 5 * MINUTE);

    // Assert: 60 s, then a 20 s timeout and a doubled wait of 120 s
    assert.deepEqual(refreshes, [60, 200]);
});

test("stops when fast mode is switched off", async (t) => {
    // Arrange
    startClock(t);
    const { refreshes, storage } = openTab();
    await advance(t, 61 * 1000);

    // Act
    await storage.local.set({ fastMode: false });
    await advance(t, 10 * MINUTE);

    // Assert
    assert.deepEqual(refreshes, [60]);
});

test("starts when fast mode is switched on", async (t) => {
    // Arrange
    startClock(t);
    const { refreshes, storage } = openTab({ settings: {} });
    await advance(t, MINUTE);

    // Act
    await storage.local.set({ fastMode: true });
    await advance(t, 61 * 1000);

    // Assert
    assert.deepEqual(refreshes, [120]);
});

test("does not refresh in title mode", async (t) => {
    // Arrange
    startClock(t);
    const { refreshes } = openTab({ sync: { useOld: true } });

    // Act
    await advance(t, 10 * MINUTE);

    // Assert
    assert.deepEqual(refreshes, []);
});
