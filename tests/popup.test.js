// Popup rendering (chrome|firefox/dist/popup.js): study and blacklist text comes
// from Prolific's page or the user, so it must be rendered as text, never as HTML.
// Run: node --test tests/
const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createChrome, createStorage, loadScripts, dist } = require("./support/sandbox");

// Just enough DOM for the popup's renderers. Setting innerHTML to markup fails the test.
class FakeElement {
    constructor(tagName) {
        this.tagName = tagName.toUpperCase();
        this.children = [];
        this.className = "";
        this.textContent = "";
        this.listeners = {};
        this.style = {};
        const names = () => this.className.split(" ").filter(Boolean);
        this.classList = {
            add: (...added) => (this.className = [...new Set([...names(), ...added])].join(" ")),
            remove: (...removed) => (this.className = names().filter((name) => !removed.includes(name)).join(" ")),
            contains: (name) => names().includes(name),
        };
    }
    set innerHTML(markup) {
        if (markup !== "") throw new Error(`innerHTML used with: ${markup}`);
        this.children = [];
    }
    append(...nodes) {
        this.children.push(...nodes.map((node) => (typeof node === "string" ? { text: node } : node)));
    }
    appendChild(node) {
        this.children.push(node);
        return node;
    }
    replaceChildren(...nodes) {
        this.children = [];
        this.append(...nodes);
    }
    addEventListener(type, listener) {
        this.listeners[type] = listener;
    }
    setAttribute(name, value) {
        this[name] = String(value);
    }
    getAttribute(name) {
        return this[name] ?? null;
    }
    querySelectorAll() {
        return [];
    }
}

const textOf = (node) => (node.text ?? node.textContent ?? "") + (node.children ?? []).map(textOf).join("");
const findAll = (node, className) => [
    ...(node.className?.split(" ").includes(className) ? [node] : []),
    ...(node.children ?? []).flatMap((child) => findAll(child, className)),
];

const HOSTILE_TITLE = '<img src=x onerror="alert(1)">Free money';
const HOSTILE_RESEARCHER = "<b>Lab</b>";
const study = (id, title, researcher = "A lab") => ({
    id,
    title,
    researcher,
    reward: "£1.00",
    rewardPerHour: "£10.00",
    time: "6 mins",
    timeInMinutes: 6,
    createdAt: "2026-11-06T10:00:00.000Z",
});

const BUILDS = ["chrome", "firefox"];

for (const build of BUILDS) {
    describe(build, () => {
        function openPopup({ local = {}, sync = {}, extensionId } = {}) {
            const storage = createStorage({ local, sync });
            const { chrome, calls } = createChrome({ storage });
            if (extensionId) chrome.runtime.id = extensionId;
            const elements = {
                reviewPrompt: Object.assign(new FakeElement("section"), { hidden: true }),
                reviewRate: new FakeElement("button"),
                reviewDismiss: new FakeElement("button"),
                reviewPromptCount: new FakeElement("span"),
                sponsorButton: new FakeElement("a"),
                sponsorPrompt: Object.assign(new FakeElement("section"), { hidden: true }),
                sponsorStart: new FakeElement("button"),
                sponsorDismiss: new FakeElement("button"),
                sponsorPromptCount: new FakeElement("span"),
                "studies-container": new FakeElement("div"),
                "search-studies": Object.assign(new FakeElement("input"), { value: "" }),
                "name-list": new FakeElement("div"),
                "researcher-list": new FakeElement("div"),
            };
            for (const tab of ["settings", "studies", "filters"]) {
                elements[tab] = new FakeElement("section");
                elements[`${tab}-tab`] = new FakeElement("li");
            }
            const document = {
                addEventListener() {},
                createElement: (tagName) => new FakeElement(tagName),
                getElementById: (id) => elements[id] ?? null,
            };
            const popup = loadScripts([dist(build, "popup.js")], { chrome, globals: { document } });
            return { popup, elements, storage, calls };
        }

        test("shows study titles and researchers as text, not HTML", async () => {
            // Arrange
            const { popup, elements } = openPopup({ local: { currentStudies: [study("a1", HOSTILE_TITLE, HOSTILE_RESEARCHER)] } });

            // Act
            await popup.populateStudies("", "created+");

            // Assert
            const container = elements["studies-container"];
            assert.equal(findAll(container, "study-title")[0].textContent, HOSTILE_TITLE);
            assert.equal(findAll(container, "study-researcher")[0].textContent, HOSTILE_RESEARCHER);
        });

        test("links to the study page with its id encoded", async () => {
            // Arrange
            const { popup, elements } = openPopup({ local: { currentStudies: [study('a1"><script>', "A study")] } });

            // Act
            await popup.populateStudies("", "created+");

            // Assert
            const [openLink] = findAll(elements["studies-container"], "open-btn");
            assert.equal(openLink.href, "https://app.prolific.com/studies/a1%22%3E%3Cscript%3E");
            assert.equal(openLink.rel, "noopener noreferrer");
        });

        test("shows a message when there are no studies", async () => {
            // Arrange
            const { popup, elements } = openPopup();

            // Act
            await popup.populateStudies("", "created+");

            // Assert
            assert.equal(textOf(elements["studies-container"]), "No studies available.");
        });

        test("deleting a study while searching keeps the studies the search hides", async () => {
            // Arrange
            const studies = [study("a1", "Survey about food"), study("b2", "Video task")];
            const { popup, elements, storage } = openPopup({ local: { currentStudies: studies } });
            elements["search-studies"].value = "survey";
            await popup.populateStudies("survey", "created+");

            // Act
            const [deleteButton] = findAll(elements["studies-container"], "delete-btn");
            await deleteButton.listeners.click();

            // Assert
            assert.deepEqual(storage.local.data.currentStudies.map((s) => s.id), ["b2"]);
        });

        test("shows blacklist words as text, not HTML", async () => {
            // Arrange
            const { popup, elements } = openPopup({ sync: { nameBlacklist: ["<i>survey</i>"] } });

            // Act
            await popup.populateBlacklist("name-list", "nameBlacklist");

            // Assert
            const [chip] = findAll(elements["name-list"], "blacklist-card");
            assert.equal(chip.children[0].textContent, "<i>survey</i>");
        });

        test("removes a blacklist word", async () => {
            // Arrange
            const { popup, elements, storage } = openPopup({ sync: { nameBlacklist: ["survey", "video"] } });
            await popup.populateBlacklist("name-list", "nameBlacklist");

            // Act
            const [removeButton] = findAll(elements["name-list"], "remove-btn");
            await removeButton.listeners.click();

            // Assert
            assert.deepEqual(storage.sync.data.nameBlacklist, ["video"]);
        });

        const visibleSections = (elements) =>
            ["settings", "studies", "filters"].filter((tab) => elements[tab].style.display === "block");

        test("opens on Settings when no tab was saved", async () => {
            // Arrange: e.g. an install that never stored one
            const { popup, elements } = openPopup();

            // Act
            await popup.setCurrentActiveTab();

            // Assert
            assert.deepEqual(visibleSections(elements), ["settings"]);
            assert.ok(elements["settings-tab"].classList.contains("active"));
        });

        test("opens on Settings when the saved tab no longer exists", async () => {
            // Arrange
            const { popup, elements } = openPopup({ sync: { activeTab: "earn" } });

            // Act
            await popup.setCurrentActiveTab();

            // Assert
            assert.deepEqual(visibleSections(elements), ["settings"]);
        });

        test("reopens the tab that was used last", async () => {
            // Arrange
            const { popup, elements } = openPopup({ sync: { activeTab: "filters" } });

            // Act
            await popup.setCurrentActiveTab();

            // Assert
            assert.deepEqual(visibleSections(elements), ["filters"]);
        });

        test("keeps Alert 1 selected when no sound is saved", async () => {
            // Arrange
            const { popup, elements } = openPopup();
            elements.selectAudio = Object.assign(new FakeElement("select"), { value: "alert1.mp3" });

            // Act
            await popup.setSelectState("selectAudio", "audio");

            // Assert
            assert.equal(elements.selectAudio.value, "alert1.mp3");
        });

        test("shows the same defaults the extension uses when nothing is saved", () => {
            // Arrange: settings with no saved value keep the popup HTML's own state
            const html = fs.readFileSync(path.join(__dirname, "..", build, "prod", "popup", "popup.html"), "utf8");
            const isChecked = (id) => new RegExp(`<input[^>]*id="${id}"[^>]*\\bchecked\\b`).test(html);

            // Act
            const ids = ["autoAudio", "showNotification", "trackIds", "focusProlific", "openProlific", "fastMode"];
            const defaults = Object.fromEntries(ids.map((id) => [id, isChecked(id)]));

            // Assert
            assert.deepEqual(defaults, {
                autoAudio: true, showNotification: true, trackIds: true, focusProlific: false, openProlific: false, fastMode: false,
            });
            assert.match(html, /<option value="alert1\.mp3" selected>/);
        });

        describe("review prompt", () => {
            const STORE_ID = "mlicfddkgjkeajfgkihplfbgpmbonbao";
            const storeId = build === "chrome" ? STORE_ID : undefined;
            const reviewUrl = (popup) => (build === "chrome" ? popup.getReviewUrl(STORE_ID) : popup.getReviewUrl());

            test("uses this store's review page", () => {
                // Arrange
                const { popup } = openPopup();

                // Act
                const url = reviewUrl(popup);

                // Assert
                assert.equal(
                    url,
                    build === "chrome"
                        ? `https://chromewebstore.google.com/detail/prolific-studies-notifier/${STORE_ID}/reviews`
                        : "https://addons.mozilla.org/firefox/addon/prolific-studies-notifier/reviews/"
                );
            });

            test("has no review page for an unknown Chrome extension id", { skip: build !== "chrome" }, () => {
                // Arrange
                const { popup } = openPopup();

                // Act + Assert
                assert.equal(popup.getReviewUrl("some-dev-id"), null);
                assert.equal(popup.getReviewUrl(undefined), null);
            });

            test("shows from 10 notified studies until answered", () => {
                // Arrange
                const { popup } = openPopup();
                const url = reviewUrl(popup);

                // Act + Assert
                assert.equal(popup.shouldShowReviewPrompt(9, undefined, url), false);
                assert.equal(popup.shouldShowReviewPrompt(10, undefined, url), true);
                assert.equal(popup.shouldShowReviewPrompt(500, "rated", url), false);
                assert.equal(popup.shouldShowReviewPrompt(500, "dismissed", url), false);
                assert.equal(popup.shouldShowReviewPrompt("12", undefined, url), false);
                assert.equal(popup.shouldShowReviewPrompt(50, undefined, null), false);
            });

            test("shows the card with the count and hides the Sponsor button", async () => {
                // Arrange
                const { popup, elements } = openPopup({ extensionId: storeId });

                // Act
                await popup.setupPrompts(42);

                // Assert
                assert.equal(elements.reviewPrompt.hidden, false);
                assert.equal(elements.reviewPromptCount.textContent, "42");
                assert.equal(elements.sponsorButton.hidden, true);
            });

            test("stays hidden below the threshold", async () => {
                // Arrange
                const { popup, elements } = openPopup({ extensionId: storeId });

                // Act
                await popup.setupPrompts(9);

                // Assert
                assert.equal(elements.reviewPrompt.hidden, true);
                assert.notEqual(elements.sponsorButton.hidden, true);
            });

            test("stays hidden once answered", async () => {
                // Arrange
                const { popup, elements } = openPopup({ extensionId: storeId, sync: { reviewPrompt: "dismissed" } });

                // Act
                await popup.setupPrompts(100);

                // Assert
                assert.equal(elements.reviewPrompt.hidden, true);
            });

            test("Rate it and Not now record when the review was answered", async () => {
                // Arrange
                const { popup, elements, storage } = openPopup({ extensionId: storeId });
                await popup.setupPrompts(20);
                const before = Date.now();

                // Act
                await elements.reviewDismiss.listeners.click();

                // Assert
                assert.ok(storage.sync.data.reviewPromptAnsweredAt >= before);
            });

            test("Not now stores 'dismissed' and brings the Sponsor button back", async () => {
                // Arrange
                const { popup, elements, storage, calls } = openPopup({ extensionId: storeId });
                await popup.setupPrompts(20);

                // Act
                await elements.reviewDismiss.listeners.click();

                // Assert
                assert.equal(storage.sync.data.reviewPrompt, "dismissed");
                assert.equal(elements.reviewPrompt.hidden, true);
                assert.equal(elements.sponsorButton.hidden, false);
                assert.equal(calls.createdTabs.length, 0);
            });

            test("Rate it stores 'rated' and opens the review page in a new tab", async () => {
                // Arrange
                const { popup, elements, storage, calls } = openPopup({ extensionId: storeId });
                await popup.setupPrompts(20);

                // Act
                await elements.reviewRate.listeners.click();

                // Assert
                assert.equal(storage.sync.data.reviewPrompt, "rated");
                assert.deepEqual(calls.createdTabs, [{ url: reviewUrl(popup), active: true }]);
                assert.equal(elements.reviewPrompt.hidden, true);
            });

            test("keeps the card hidden and logs when the storage read fails", async () => {
                // Arrange
                const { popup, elements, storage } = openPopup({ extensionId: storeId });
                storage.sync.get = async () => {
                    throw new Error("storage unavailable");
                };
                const logged = [];
                const originalError = console.error;
                console.error = (...args) => logged.push(args);

                // Act
                try {
                    await popup.setupPrompts(50);
                } finally {
                    console.error = originalError;
                }

                // Assert
                assert.equal(elements.reviewPrompt.hidden, true);
                assert.equal(logged.length, 1);
            });

            test("never shows for an unknown Chrome extension id", { skip: build !== "chrome" }, async () => {
                // Arrange
                const { popup, elements } = openPopup({ extensionId: "unpacked-dev-id" });

                // Act
                await popup.setupPrompts(100);

                // Assert
                assert.equal(elements.reviewPrompt.hidden, true);
            });

            test("popup HTML carries the card copy, report link and cross-promo with UTM tags", () => {
                // Arrange
                const html = fs.readFileSync(path.join(__dirname, "..", build, "prod", "popup", "popup.html"), "utf8");

                // Act + Assert
                assert.match(html, /Enjoying Prolific Studies Notifier\?/);
                assert.match(html, /A quick rating helps other participants find it\./);
                assert.match(html, /href="https:\/\/github\.com\/spin311\/ProlificAutomaticStudies\/issues\/new"/);
                assert.match(html, /More free tools by the same developer:/);
                assert.match(html, /utm_source=ProlificAutomaticStudies-popup&amp;utm_medium=cross-promo/);
            });
        });

        describe("sponsor milestone prompt", () => {
            const DAY = 24 * 60 * 60 * 1000;
            const NOW = 1_800_000_000_000;
            const STORE_ID = "mlicfddkgjkeajfgkihplfbgpmbonbao";
            const MILESTONE_URL = "https://github.com/sponsors/spin311?metadata_source=ProlificAutomaticStudies-milestone";
            const storeId = build === "chrome" ? STORE_ID : undefined;
            const reviewUrl = (popup) => (build === "chrome" ? popup.getReviewUrl(STORE_ID) : popup.getReviewUrl());
            const state = (popup, overrides = {}) => ({
                notifiedCount: 100,
                reviewUrl: reviewUrl(popup),
                reviewAnswer: "rated",
                reviewAnsweredAt: NOW - 7 * DAY,
                sponsorAnswer: undefined,
                now: NOW,
                ...overrides,
            });

            test("needs 100 notified studies", () => {
                // Arrange
                const { popup } = openPopup();

                // Act + Assert
                assert.equal(popup.shouldShowSponsorPrompt(state(popup, { notifiedCount: 99 })), false);
                assert.equal(popup.shouldShowSponsorPrompt(state(popup, { notifiedCount: 100 })), true);
                assert.equal(popup.shouldShowSponsorPrompt(state(popup, { notifiedCount: "500" })), false);
            });

            test("waits 7 days after the review was answered", () => {
                // Arrange
                const { popup } = openPopup();

                // Act + Assert
                assert.equal(popup.shouldShowSponsorPrompt(state(popup, { reviewAnsweredAt: NOW - 7 * DAY + 1 })), false);
                assert.equal(popup.shouldShowSponsorPrompt(state(popup, { reviewAnsweredAt: NOW - 7 * DAY })), true);
                assert.equal(popup.shouldShowSponsorPrompt(state(popup, { reviewAnsweredAt: undefined })), false);
            });

            test("waits while the review is unanswered", () => {
                // Arrange
                const { popup } = openPopup();

                // Act + Assert
                assert.equal(popup.shouldShowSponsorPrompt(state(popup, { reviewAnswer: undefined, reviewAnsweredAt: undefined })), false);
            });

            test("is asked once", () => {
                // Arrange
                const { popup } = openPopup();

                // Act + Assert
                assert.equal(popup.shouldShowSponsorPrompt(state(popup, { sponsorAnswer: "clicked" })), false);
                assert.equal(popup.shouldShowSponsorPrompt(state(popup, { sponsorAnswer: "dismissed" })), false);
            });

            test("skips the 7-day wait when the build has no review card", () => {
                // Arrange
                const { popup } = openPopup();

                // Act + Assert
                const noReview = state(popup, { reviewUrl: null, reviewAnswer: undefined, reviewAnsweredAt: undefined });
                assert.equal(popup.shouldShowSponsorPrompt(noReview), true);
                assert.equal(popup.shouldShowSponsorPrompt({ ...noReview, notifiedCount: 99 }), false);
            });

            test("never picks both cards", () => {
                // Arrange
                const { popup } = openPopup();
                const url = reviewUrl(popup);

                // Act + Assert
                const unanswered = { reviewAnswer: undefined, reviewAnsweredAt: undefined };
                assert.equal(popup.getDuePrompt(state(popup, { ...unanswered, notifiedCount: 500 })), "review");
                assert.equal(popup.getDuePrompt(state(popup)), "sponsor");
                assert.equal(popup.getDuePrompt(state(popup, { notifiedCount: 50 })), null);
                assert.equal(popup.getDuePrompt(state(popup, { reviewUrl: null, ...unanswered })), "sponsor");
                assert.notEqual(url, undefined);
            });

            test("shows only the sponsor card, with the count, after a week-old review answer", async () => {
                // Arrange
                const { popup, elements } = openPopup({
                    extensionId: storeId,
                    sync: { reviewPrompt: "rated", reviewPromptAnsweredAt: Date.now() - 8 * DAY },
                });

                // Act
                await popup.setupPrompts(150);

                // Assert
                assert.equal(elements.sponsorPrompt.hidden, false);
                assert.equal(elements.sponsorPromptCount.textContent, "150");
                assert.equal(elements.reviewPrompt.hidden, true);
                assert.equal(elements.sponsorButton.hidden, true);
            });

            test("shows only the review card when both are due", async () => {
                // Arrange
                const { popup, elements } = openPopup({ extensionId: storeId });

                // Act
                await popup.setupPrompts(150);

                // Assert
                assert.equal(elements.reviewPrompt.hidden, false);
                assert.equal(elements.sponsorPrompt.hidden, true);
            });

            test("shows the sponsor card on a Chrome build with an unknown id", { skip: build !== "chrome" }, async () => {
                // Arrange
                const { popup, elements } = openPopup({ extensionId: "unpacked-dev-id" });

                // Act
                await popup.setupPrompts(100);

                // Assert
                assert.equal(elements.sponsorPrompt.hidden, false);
                assert.equal(elements.reviewPrompt.hidden, true);
            });

            test("Sponsor on GitHub stores 'clicked' and opens the milestone link", async () => {
                // Arrange
                const { popup, elements, storage, calls } = openPopup({
                    extensionId: storeId,
                    sync: { reviewPrompt: "rated", reviewPromptAnsweredAt: Date.now() - 8 * DAY },
                });
                await popup.setupPrompts(120);

                // Act
                await elements.sponsorStart.listeners.click();

                // Assert
                assert.equal(storage.sync.data.sponsorPrompt, "clicked");
                assert.deepEqual(calls.createdTabs, [{ url: MILESTONE_URL, active: true }]);
                assert.equal(elements.sponsorPrompt.hidden, true);
                assert.equal(elements.sponsorButton.hidden, false);
            });

            test("Not now stores 'dismissed' and opens nothing", async () => {
                // Arrange
                const { popup, elements, storage, calls } = openPopup({
                    extensionId: storeId,
                    sync: { reviewPrompt: "dismissed", reviewPromptAnsweredAt: Date.now() - 8 * DAY },
                });
                await popup.setupPrompts(120);

                // Act
                await elements.sponsorDismiss.listeners.click();

                // Assert
                assert.equal(storage.sync.data.sponsorPrompt, "dismissed");
                assert.equal(calls.createdTabs.length, 0);
                assert.equal(elements.sponsorPrompt.hidden, true);
            });

            test("popup HTML carries the sponsor card copy", () => {
                // Arrange
                const html = fs.readFileSync(path.join(__dirname, "..", build, "prod", "popup", "popup.html"), "utf8");

                // Act + Assert
                assert.match(html, /studies<\/h2>/);
                assert.match(html, /monthly from \$2, or one-time\) keeps it working when Prolific changes\./);
                assert.match(html, /Sponsor on GitHub/);
            });
        });
    });
}
