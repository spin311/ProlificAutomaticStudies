// Tab watchdog (chrome/dist/tabWatchdog.js): keeps the Prolific tab loaded and
// reloads the Studies page when Prolific's own 2-minute refresh has stopped.
// Run: node --test tests/
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createChrome, createStorage, createPage, loadScripts, dist, startClock, advance } = require("./support/sandbox");

const MINUTE = 60 * 1000;
const STUDIES_FETCH = "https://internal-api.prolific.com/api/v1/participant/studies/?sortBy=published_at&orderBy=asc";
const SINGLE_STUDY_FETCH = "https://internal-api.prolific.com/api/v1/participant/studies/0123456789abcdef01234567/";

function openStudiesTab({ storage = createStorage(), ...pageOptions } = {}) {
    const { chrome, calls } = createChrome({ storage });
    const { page, globals } = createPage(pageOptions);
    loadScripts([dist("chrome", "tabWatchdog.js")], { chrome, globals });
    return { chrome, calls, page };
}

test("asks the background to keep the Prolific tab loaded", async (t) => {
    // Arrange
    startClock(t);

    // Act
    const { calls } = openStudiesTab();
    await advance(t, 0);

    // Assert
    assert.deepEqual(calls.messages, [{ target: "background", type: "keep-tab-alive" }]);
});

test("reloads the Studies page when Prolific stops refreshing it", async (t) => {
    // Arrange
    startClock(t);
    const { page } = openStudiesTab();
    page.emitResource(STUDIES_FETCH);

    // Act
    await advance(t, 8 * MINUTE);

    // Assert
    assert.equal(page.reloads, 1);
});

test("does not reload while Prolific keeps refreshing the list", async (t) => {
    // Arrange
    startClock(t);
    const { page } = openStudiesTab();

    // Act: Prolific refreshes every 2 minutes
    for (let i = 0; i < 10; i++) {
        page.emitResource(STUDIES_FETCH);
        await advance(t, 2 * MINUTE);
    }

    // Assert
    assert.equal(page.reloads, 0);
});

test("does not reload while the user is on the Prolific tab", async (t) => {
    // Arrange
    startClock(t);
    const { page } = openStudiesTab({ focused: true });
    page.emitResource(STUDIES_FETCH);

    // Act
    await advance(t, 20 * MINUTE);

    // Assert
    assert.equal(page.reloads, 0);
});

test("does not reload before it has seen Prolific refresh the list", async (t) => {
    // Arrange: opening a single study is not a list refresh
    startClock(t);
    const { page } = openStudiesTab();
    page.emitResource(SINGLE_STUDY_FETCH);

    // Act
    await advance(t, 20 * MINUTE);

    // Assert
    assert.equal(page.reloads, 0);
});

test("does not reload when the Studies list is not on the page", async (t) => {
    // Arrange
    startClock(t);
    const { page } = openStudiesTab({ hasStudiesList: false });
    page.emitResource(STUDIES_FETCH);

    // Act
    await advance(t, 20 * MINUTE);

    // Assert
    assert.equal(page.reloads, 0);
});

test("reloads at most once every 15 minutes", async (t) => {
    // Arrange: the reload does not fix the page, so it stays stale
    startClock(t);
    const { page } = openStudiesTab();
    page.emitResource(STUDIES_FETCH);

    // Act
    await advance(t, 30 * MINUTE);

    // Assert: at about 6 and 21 minutes
    assert.equal(page.reloads, 2);
});

test("reloads only one of several stale Prolific tabs within 15 minutes", async (t) => {
    // Arrange: the second tab was opened 30 seconds later
    startClock(t);
    const storage = createStorage();
    const tabA = openStudiesTab({ storage });
    tabA.page.emitResource(STUDIES_FETCH);
    await advance(t, 30 * 1000);
    const tabB = openStudiesTab({ storage });
    tabB.page.emitResource(STUDIES_FETCH);

    // Act
    await advance(t, 10 * MINUTE);

    // Assert
    assert.equal(tabA.page.reloads + tabB.page.reloads, 1);
});

test("does not reload while fast mode is paused by a restriction or rate limit", async (t) => {
    // Arrange
    startClock(t);
    const storage = createStorage({ local: { fastModePausedUntil: Date.now() + 60 * MINUTE } });
    const { page } = openStudiesTab({ storage });
    page.emitResource(STUDIES_FETCH);

    // Act
    await advance(t, 20 * MINUTE);

    // Assert
    assert.equal(page.reloads, 0);
});

test("reloads its Studies tab once the extension has been updated", async (t) => {
    // Arrange: after an update this copy of the script is cut off from the extension
    startClock(t);
    const { page, chrome } = openStudiesTab();
    delete chrome.runtime.id;

    // Act
    await advance(t, 61 * 1000);

    // Assert
    assert.equal(page.reloads, 1);
});

test("waits for the user to leave the tab before reloading it after an update", async (t) => {
    // Arrange
    startClock(t);
    const { page, chrome } = openStudiesTab({ focused: true });
    delete chrome.runtime.id;

    // Act
    await advance(t, 3 * MINUTE);

    // Assert
    assert.equal(page.reloads, 0);
});
