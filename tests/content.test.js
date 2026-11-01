// Behaviour tests for the compiled content scripts (chrome/dist/content.js and
// firefox/dist/content.js). Build both first (tsc -p chrome, tsc -p firefox),
// then run: node --test tests/content.test.js
//
// Each script runs in a vm sandbox with a fake extension storage and a fake
// Prolific studies list, so each "scan" is what happens when Prolific's page
// mutates and the MutationObserver fires.
const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const BUILDS = ["chrome", "firefox"].map((name) => ({
    name,
    source: fs.readFileSync(path.join(__dirname, "..", name, "dist", "content.js"), "utf8"),
}));

function makeStorageArea(initial) {
    const data = { ...initial };
    return {
        data,
        async get(keys) {
            const list = Array.isArray(keys) ? keys : [keys];
            return Object.fromEntries(list.filter((k) => k in data).map((k) => [k, data[k]]));
        },
        async set(items) {
            Object.assign(data, items);
        },
    };
}

function fakeStudyNode(id) {
    const fields = {
        '[data-testid="title"]': `Study ${id}`,
        '[data-testid="host"]': "By Some Lab",
        '[data-testid="study-tag-reward"]': "£1.00",
        '[data-testid="study-tag-reward-per-hour"]': "£10.00/hr",
        '[data-testid="study-tag-completion-time"]': "6 mins",
    };
    return {
        getAttribute: (name) => (name === "data-testid" ? `study-${id}` : null),
        querySelector: (sel) => (sel in fields ? { textContent: fields[sel] } : null),
    };
}

// Lets the script's async start-up (storage reads, observer setup) finish.
async function settle() {
    for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

// Loads a content script against a page whose study list can be changed
// between scans. Returns helpers to change the page and run one scan.
async function loadBuild(build, { sync = {}, local = {}, storage = null } = {}) {
    const sent = [];
    const observers = [];
    let visibleIds = [];

    const studiesList = {
        querySelectorAll: () => visibleIds.map(fakeStudyNode),
    };
    // Chrome uses chrome.*, Firefox uses browser.*; both get the same fake.
    const extensionApi = {
        storage: storage ?? { sync: makeStorageArea(sync), local: makeStorageArea(local) },
        runtime: {
            onMessage: { addListener() {} },
            sendMessage: async (message) => {
                sent.push(message);
            },
        },
    };
    const sandbox = {
        chrome: extensionApi,
        browser: extensionApi,
        console,
        Promise,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        MutationObserver: class {
            constructor(callback) {
                this.callback = callback;
                this.isActive = false;
                observers.push(this);
            }
            observe() {
                this.isActive = true;
            }
            disconnect() {
                this.isActive = false;
            }
        },
        document: {
            body: {},
            querySelector: (sel) => (sel === 'div[data-testid="studies-list"]' ? studiesList : null),
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(build.source, sandbox, { filename: `${build.name}/dist/content.js` });
    await settle();

    return {
        chrome: extensionApi,
        showStudies(ids) {
            visibleIds = ids;
        },
        // One page mutation -> one scan. Returns the ids notified by this scan.
        async scan() {
            const before = sent.length;
            const mutation = [{ addedNodes: [{}], removedNodes: [], type: "childList" }];
            for (const observer of observers.filter((o) => o.isActive)) {
                await observer.callback(mutation);
            }
            return sent
                .slice(before)
                .filter((m) => m.type === "new-studies")
                .flatMap((m) => m.data.map((s) => s.id));
        },
    };
}

const ids = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

for (const build of BUILDS) {
describe(build.name, () => {
const loadContentScript = (options) => loadBuild(build, options);


test("notifies each listed study once when more studies are listed than the history keeps", async () => {
    // Arrange: 120 studies listed, "Number of studies to remember" = 100 (default)
    const page = await loadContentScript({ sync: { trackIds: true, studyHistoryLen: 100 } });
    page.showStudies(ids("s", 120));

    // Act
    const first = await page.scan();
    const second = await page.scan();
    const third = await page.scan();

    // Assert: the 20 studies trimmed from history must not be re-notified
    assert.equal(first.length, 120);
    assert.deepEqual(second, []);
    assert.deepEqual(third, []);
});

test("does not re-notify listed studies after a new one appears when 'Show each study only once' is off", async () => {
    // Arrange
    const page = await loadContentScript({ sync: { trackIds: false, studyHistoryLen: 100 } });
    page.showStudies(["a", "b", "c"]);
    await page.scan();

    // Act: a new study is published, then the page keeps mutating
    page.showStudies(["a", "b", "c", "d"]);
    const afterNewStudy = await page.scan();
    const nextMutation = await page.scan();
    const laterMutation = await page.scan();

    // Assert
    assert.deepEqual(afterNewStudy, ["d"]);
    assert.deepEqual(nextMutation, []);
    assert.deepEqual(laterMutation, []);
});

test("does not re-notify a study that briefly leaves the list when 'Show each study only once' is off", async () => {
    // Arrange
    const page = await loadContentScript({ sync: { trackIds: false, studyHistoryLen: 100 } });
    page.showStudies(["a", "b"]);
    await page.scan();
    page.showStudies(["b"]);
    await page.scan();

    // Act
    page.showStudies(["a", "b"]);
    const reappeared = await page.scan();

    // Assert
    assert.deepEqual(reappeared, []);
});

test("does not re-notify a study that reappears when 'Show each study only once' is on", async () => {
    // Arrange
    const page = await loadContentScript({ sync: { trackIds: true, studyHistoryLen: 100 } });
    page.showStudies(["a", "b"]);
    await page.scan();
    page.showStudies(["b"]);
    await page.scan();

    // Act
    page.showStudies(["a", "b"]);
    const reappeared = await page.scan();

    // Assert
    assert.deepEqual(reappeared, []);
});

test("does not re-notify listed studies after the Prolific tab is reloaded", async () => {
    // Arrange: 120 listed studies were seen by a previous page load
    const sync = { trackIds: true, studyHistoryLen: 100 };
    const before = await loadContentScript({ sync });
    before.showStudies(ids("s", 120));
    await before.scan();

    // Act: tab reload = fresh content script, same extension storage
    const after = await loadContentScript({ sync, local: before.chrome.storage.local.data });
    after.showStudies(ids("s", 120));
    const notified = await after.scan();

    // Assert
    assert.deepEqual(notified, []);
});

test("keeps the study history capped at 'Number of studies to remember'", async () => {
    // Arrange
    const page = await loadContentScript({ sync: { trackIds: true, studyHistoryLen: 100 } });
    page.showStudies(ids("s", 120));

    // Act
    await page.scan();
    await page.scan();

    // Assert
    assert.equal(page.chrome.storage.local.data.currentStudies.length, 100);
});

test("still skips studies excluded by the minimum reward filter", async () => {
    // Arrange: every fake study pays £1.00, filter requires £2.00
    const page = await loadContentScript({ sync: { trackIds: true, studyHistoryLen: 100, reward: 2 } });
    page.showStudies(["a", "b"]);

    // Act
    const notified = await page.scan();

    // Assert
    assert.deepEqual(notified, []);
});

test("does not re-notify listed studies after the list renders empty for a moment", async () => {
    // Arrange
    const page = await loadContentScript({ sync: { trackIds: true, studyHistoryLen: 100 } });
    page.showStudies(ids("s", 120));
    await page.scan();

    // Act: Prolific re-renders the list (empty, then full again)
    page.showStudies([]);
    await page.scan();
    page.showStudies(ids("s", 120));
    const notified = await page.scan();

    // Assert
    assert.deepEqual(notified, []);
});

test("notifies a new study once when two Prolific tabs show different lists", async () => {
    // Arrange: tab A is up to date, tab B still shows an older list
    const storage = { sync: makeStorageArea({ trackIds: false, studyHistoryLen: 100 }), local: makeStorageArea({}) };
    const tabA = await loadContentScript({ storage });
    const tabB = await loadContentScript({ storage });
    tabA.showStudies(["a", "b"]);
    tabB.showStudies(["a", "b"]);
    await tabA.scan();
    await tabB.scan();

    // Act
    tabA.showStudies(["a", "b", "c"]);
    const notified = [];
    for (let round = 0; round < 3; round++) {
        notified.push(...(await tabA.scan()), ...(await tabB.scan()));
    }

    // Assert
    assert.deepEqual(notified, ["c"]);
});

test("does not burst notifications on the first scan after upgrading from 3.6.0", async () => {
    // Arrange: 3.6.0 stored a full history (100 of the 120 listed) and no seen ids
    const history = ids("s", 100).map((id) => ({ id }));
    const page = await loadContentScript({ sync: { trackIds: true, studyHistoryLen: 100 }, local: { currentStudies: history } });
    page.showStudies(ids("s", 120));

    // Act
    const firstScan = await page.scan();
    page.showStudies([...ids("s", 120), "new"]);
    const afterNewStudy = await page.scan();

    // Assert
    assert.deepEqual(firstScan, []);
    assert.deepEqual(afterNewStudy, ["new"]);
});

test("notifies studies that pass the minimum reward filter", async () => {
    // Arrange: every fake study pays £1.00
    const page = await loadContentScript({ sync: { trackIds: true, studyHistoryLen: 100, reward: 0.5 } });
    page.showStudies(["a", "b"]);

    // Act
    const notified = await page.scan();

    // Assert
    assert.deepEqual(notified, ["a", "b"]);
});

test("notifies listed studies that were filtered out once the filter is relaxed", async () => {
    // Arrange
    const page = await loadContentScript({ sync: { trackIds: true, studyHistoryLen: 100, reward: 2 } });
    page.showStudies(["a"]);
    await page.scan();

    // Act
    page.chrome.storage.sync.data.reward = 0;
    const notified = await page.scan();

    // Assert
    assert.deepEqual(notified, ["a"]);
});
});
}
