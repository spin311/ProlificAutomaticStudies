// Popup rendering (chrome|firefox/dist/popup.js): study and blacklist text comes
// from Prolific's page or the user, so it must be rendered as text, never as HTML.
// Run: node --test tests/
const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createChrome, createStorage, loadScripts, dist, startClock, advance } = require("./support/sandbox");

// Just enough DOM for the popup's renderers. Setting innerHTML to markup fails the test.
let activeElement = null;

class FakeElement {
    constructor(tagName) {
        this.tagName = tagName.toUpperCase();
        this.children = [];
        this.className = "";
        this.textContent = "";
        this.listeners = {};
        this.style = {};
        this.scrollTop = 0;
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
    // Pessimistic: replacing the rows may drop the scroll position (an emptied list
    // collapses and is clamped to 0), so the popup has to put it back itself.
    replaceChildren(...nodes) {
        this.children = [];
        this.scrollTop = 0;
        this.append(...nodes);
    }
    focus() {
        activeElement = this;
    }
    contains(node) {
        return node === this || this.children.some((child) => child.contains?.(node));
    }
    // Class selectors only (".name").
    querySelector(selector) {
        return findAll(this, selector.slice(1))[0] ?? null;
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
const study = (id, title, researcher = "A lab", overrides = {}) => ({
    id,
    title,
    researcher,
    reward: "£1.00",
    rewardPerHour: "£10.00",
    time: "6 mins",
    timeInMinutes: 6,
    places: "120 places",
    createdAt: "2026-11-06T10:00:00.000Z",
    ...overrides,
});

const BUILDS = ["chrome", "firefox"];

for (const build of BUILDS) {
    describe(build, () => {
        function openPopup({ local = {}, sync = {}, extensionId, search = "" } = {}) {
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
                "view-all": new FakeElement("button"),
                "view-saved": new FakeElement("button"),
                "saved-count": new FakeElement("span"),
                "layout-list": new FakeElement("button"),
                "layout-cards": new FakeElement("button"),
                openInTab: new FakeElement("button"),
                "search-studies": Object.assign(new FakeElement("input"), { value: "" }),
                "name-list": new FakeElement("div"),
                "researcher-list": new FakeElement("div"),
            };
            for (const tab of ["settings", "studies", "filters"]) {
                elements[tab] = new FakeElement("section");
                elements[`${tab}-tab`] = new FakeElement("li");
            }
            activeElement = null;
            const document = {
                get activeElement() {
                    return activeElement;
                },
                body: new FakeElement("body"),
                addEventListener() {},
                createElement: (tagName) => new FakeElement(tagName),
                getElementById: (id) => elements[id] ?? null,
            };
            const location = { search };
            const popup = loadScripts([dist(build, "popup.js")], { chrome, globals: { document, location } });
            elements.body = document.body;
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

        describe("study rows", () => {
            const rows = (elements) => findAll(elements["studies-container"], "study-card");

            test("shows pay, pay per hour, time and places on one line", async () => {
                // Arrange
                const { popup, elements } = openPopup({ local: { currentStudies: [study("a1", "A study")] } });

                // Act
                await popup.populateStudies("", "created+");

                // Assert
                const [meta] = findAll(elements["studies-container"], "study-meta");
                assert.equal(textOf(meta), "£1.00 · £10.00/hr · 6 mins · 120 places");
            });

            test("leaves places out for studies saved before places were recorded", async () => {
                // Arrange
                const old = study("a1", "A study", "A lab", { places: undefined });
                const { popup, elements } = openPopup({ local: { currentStudies: [old] } });

                // Act
                await popup.populateStudies("", "created+");

                // Assert
                const [meta] = findAll(elements["studies-container"], "study-meta");
                assert.equal(textOf(meta), "£1.00 · £10.00/hr · 6 mins");
            });

            test("makes the title a link to the study, so it can be copied or middle-clicked", async () => {
                // Arrange
                const { popup, elements } = openPopup({ local: { currentStudies: [study("a1", "A study")] } });

                // Act
                await popup.populateStudies("", "created+");

                // Assert
                const [title] = findAll(elements["studies-container"], "study-title");
                assert.equal(title.tagName, "A");
                assert.equal(title.href, "https://app.prolific.com/studies/a1");
                assert.equal(title.target, "_blank");
                assert.equal(title.rel, "noopener noreferrer");
            });

            test("shows when the study was found as day/month and time", async () => {
                // Arrange
                const { popup, elements } = openPopup({ local: { currentStudies: [study("a1", "A study")] } });
                const found = new Date("2026-11-06T10:00:00.000Z");
                const pad = (n) => String(n).padStart(2, "0");

                // Act
                await popup.populateStudies("", "created+");

                // Assert
                const [foundAt] = findAll(elements["studies-container"], "study-created-at");
                const expected = `${pad(found.getDate())}/${pad(found.getMonth() + 1)} ${pad(found.getHours())}:${pad(found.getMinutes())}`;
                assert.equal(foundAt.textContent, expected);
            });

            test("has a compact Open button that names the study for screen readers", async () => {
                // Arrange
                const { popup, elements } = openPopup({ local: { currentStudies: [study("a1", "A study")] } });

                // Act
                await popup.populateStudies("", "created+");

                // Assert
                const [openLink] = findAll(elements["studies-container"], "open-btn");
                assert.equal(openLink.textContent, "↗");
                assert.equal(openLink["aria-label"], "Open A study in a new tab");
            });

            test("greys out studies that were opened before", async () => {
                // Arrange
                const { popup, elements } = openPopup({
                    local: { currentStudies: [study("a1", "One"), study("b2", "Two")], openedStudyIds: ["a1"] },
                });

                // Act
                await popup.populateStudies("", "created+");

                // Assert
                assert.deepEqual(rows(elements).map((row) => row.classList.contains("is-opened")), [true, false]);
            });

            test("marks a study as opened when its link is clicked", async () => {
                // Arrange
                const { popup, elements, storage } = openPopup({ local: { currentStudies: [study("a1", "One")] } });
                await popup.populateStudies("", "created+");

                // Act: not awaited, the popup may close as soon as the tab opens
                const [openLink] = findAll(elements["studies-container"], "open-btn");
                openLink.listeners.click({ button: 0 });

                // Assert: the write was already issued inside the click handler
                assert.deepEqual([...storage.local.data.openedStudyIds], ["a1"]);
                assert.ok(rows(elements)[0].classList.contains("is-opened"));
            });

            test("marks a study as opened on middle-click, not on right-click", async () => {
                // Arrange
                const { popup, elements, storage } = openPopup({
                    local: { currentStudies: [study("a1", "One"), study("b2", "Two")] },
                });
                await popup.populateStudies("", "created+");
                const [first, second] = findAll(elements["studies-container"], "study-title");

                // Act
                await first.listeners.auxclick({ button: 1 });
                await second.listeners.auxclick({ button: 2 });

                // Assert
                assert.deepEqual([...storage.local.data.openedStudyIds], ["a1"]);
            });

            test("exports places as the last CSV column, quoting every value", () => {
                // Arrange
                const { popup } = openPopup();

                // Act
                const csv = popup.buildStudiesCsv([study("a1", 'Say "hi"')]);

                // Assert
                const [header, row] = csv.split("\n");
                assert.equal(header, "id,title,researcher,reward,rewardPerHour,time,timeInMinutes,createdAt,places");
                assert.equal(row, '"a1","Say ""hi""","A lab","£1.00","£10.00","6 mins","6","2026-11-06T10:00:00.000Z","120 places"');
            });

            test("keeps a study opened during a redraw that read the list before it", async () => {
                // Arrange: X opened, then Y opened while a redraw's storage read still held [X]
                const studies = [study("x", "X"), study("y", "Y"), study("z", "Z")];
                const { popup, elements, storage } = openPopup({ local: { currentStudies: studies } });
                await popup.populateStudies("", "created+");
                const titleLinks = () => findAll(elements["studies-container"], "study-title");
                await titleLinks()[0].listeners.click({ button: 0 });
                await titleLinks()[1].listeners.auxclick({ button: 1 });
                storage.local.data.openedStudyIds = ["x"];
                await popup.populateStudies("", "created+");

                // Act
                await titleLinks()[2].listeners.auxclick({ button: 1 });

                // Assert
                assert.deepEqual([...storage.local.data.openedStudyIds].sort(), ["x", "y", "z"]);
            });

            test("leaves the arrow out of the Tab order, since the title opens the same page", async () => {
                // Arrange
                const { popup, elements } = openPopup({ local: { currentStudies: [study("a1", "One")] } });

                // Act
                await popup.populateStudies("", "created+");

                // Assert
                const [openLink] = findAll(elements["studies-container"], "open-btn");
                assert.equal(openLink.tabIndex, -1);
            });

            test("remembers at most 1000 opened studies, dropping the oldest", () => {
                // Arrange
                const { popup } = openPopup();
                const ids = Array.from({ length: 1000 }, (_, i) => `s${i}`);

                // Act
                const added = popup.addOpenedStudyId(ids, "new");
                const reopened = popup.addOpenedStudyId(["a", "b"], "a");

                // Assert
                assert.equal(added.length, 1000);
                assert.equal(added[0], "s1");
                assert.equal(added[999], "new");
                assert.deepEqual([...reopened], ["b", "a"]);
            });
        });

        describe("search and scroll position", () => {
            const titles = (elements) => findAll(elements["studies-container"], "study-title").map((t) => t.textContent);
            const MINUTE = 60 * 1000;

            test("restores the last search when the popup opens", async () => {
                // Arrange
                const studies = [study("a1", "Survey about food"), study("b2", "Video task")];
                const { popup, elements } = openPopup({ local: { currentStudies: studies, searchStudies: "survey" } });

                // Act
                await popup.setupSearch();
                await popup.populateStudies();

                // Assert
                assert.equal(elements["search-studies"].value, "survey");
                assert.deepEqual(titles(elements), ["Survey about food"]);
            });

            test("saves the search while typing and forgets it once the box is cleared", async () => {
                // Arrange
                const { popup, elements, storage } = openPopup({ local: { currentStudies: [study("a1", "One")] } });
                await popup.setupSearch();
                const search = elements["search-studies"];

                // Act
                search.value = "food";
                await search.listeners.input();
                const typed = storage.local.data.searchStudies;
                search.value = "";
                await search.listeners.input();

                // Assert
                assert.equal(typed, "food");
                assert.equal(storage.local.data.searchStudies, "");
            });

            test("scrolls back to the top when the search changes", async () => {
                // Arrange
                const { popup, elements } = openPopup({ local: { currentStudies: [study("a1", "One"), study("b2", "Two")] } });
                await popup.setupSearch();
                await popup.populateStudies("", "created+");
                elements["studies-container"].scrollTop = 300;

                // Act
                elements["search-studies"].value = "two";
                await elements["search-studies"].listeners.input();

                // Assert
                assert.equal(elements["studies-container"].scrollTop, 0);
            });

            test("keeps the scroll position after deleting a study", async () => {
                // Arrange
                const studies = ["a", "b", "c"].map((id) => study(id, `Study ${id}`));
                const { popup, elements } = openPopup({ local: { currentStudies: studies } });
                await popup.populateStudies("", "created+");
                elements["studies-container"].scrollTop = 500;

                // Act
                const [, deleteButton] = findAll(elements["studies-container"], "delete-btn");
                await deleteButton.listeners.click();

                // Assert
                assert.deepEqual(titles(elements), ["Study a", "Study c"]);
                assert.equal(elements["studies-container"].scrollTop, 500);
            });

            test("keeps keyboard focus on the star after saving a study", async () => {
                // Arrange
                const { popup, elements } = openPopup({ local: { currentStudies: [study("a1", "One"), study("b2", "Two")] } });
                await popup.populateStudies("", "created+");
                const [, star] = findAll(elements["studies-container"], "save-btn");
                star.focus();

                // Act
                await star.listeners.click();

                // Assert
                const [, newStar] = findAll(elements["studies-container"], "save-btn");
                assert.notEqual(newStar, star);
                assert.equal(activeElement, newStar);
            });

            test("moves keyboard focus to the next study's Delete after a delete", async () => {
                // Arrange
                const studies = ["a", "b", "c"].map((id) => study(id, `Study ${id}`));
                const { popup, elements } = openPopup({ local: { currentStudies: studies } });
                await popup.populateStudies("", "created+");
                const [, deleteB] = findAll(elements["studies-container"], "delete-btn");
                deleteB.focus();

                // Act
                await deleteB.listeners.click();

                // Assert
                const [, deleteC] = findAll(elements["studies-container"], "delete-btn");
                assert.equal(activeElement, deleteC);
            });

            test("re-dates a restored scroll position, so it lasts 10 minutes from the last open", async () => {
                // Arrange
                const { popup, storage } = openPopup({
                    local: { currentStudies: [study("a1", "One")], studiesScroll: { top: 400, at: Date.now() - 9 * MINUTE } },
                });
                await popup.populateStudies("", "created+");

                // Act
                await popup.restoreStudiesScroll();

                // Assert
                assert.equal(storage.local.data.studiesScroll.top, 400);
                assert.ok(Date.now() - storage.local.data.studiesScroll.at < MINUTE);
            });

            test("saves the scroll position right away when a study is opened", async (t) => {
                // Arrange
                startClock(t);
                const { popup, elements, storage } = openPopup({ local: { currentStudies: [study("a1", "One")] } });
                await popup.populateStudies("", "created+");
                popup.watchStudiesScroll();
                const container = elements["studies-container"];
                container.scrollTop = 320;
                container.listeners.scroll();

                // Act: no time passes, the popup closes as soon as the tab opens
                const [openLink] = findAll(container, "open-btn");
                openLink.listeners.click({ button: 0 });

                // Assert
                assert.equal(storage.local.data.studiesScroll?.top, 320);
            });

            test("deletes from the latest saved list, keeping studies found after the list was drawn", async () => {
                // Arrange
                const { popup, elements, storage } = openPopup({ local: { currentStudies: [study("a1", "One"), study("b2", "Two")] } });
                await popup.populateStudies("", "created+");
                storage.local.data.currentStudies = [study("a1", "One"), study("b2", "Two"), study("c3", "Three")];

                // Act
                const [deleteButton] = findAll(elements["studies-container"], "delete-btn");
                await deleteButton.listeners.click();

                // Assert
                assert.deepEqual(storage.local.data.currentStudies.map((s) => s.id), ["b2", "c3"]);
            });

            test("reopens at the scroll position it was closed at", async () => {
                // Arrange
                const { popup, elements } = openPopup({
                    local: { currentStudies: [study("a1", "One")], studiesScroll: { top: 400, at: Date.now() - MINUTE } },
                });
                await popup.populateStudies("", "created+");

                // Act
                await popup.restoreStudiesScroll();

                // Assert
                assert.equal(elements["studies-container"].scrollTop, 400);
            });

            test("reopens at the top when it was closed more than 10 minutes ago", async () => {
                // Arrange
                const { popup, elements } = openPopup({
                    local: { currentStudies: [study("a1", "One")], studiesScroll: { top: 400, at: Date.now() - 11 * MINUTE } },
                });
                await popup.populateStudies("", "created+");

                // Act
                await popup.restoreStudiesScroll();

                // Assert
                assert.equal(elements["studies-container"].scrollTop, 0);
            });

            test("saves the scroll position shortly after scrolling stops", async (t) => {
                // Arrange
                startClock(t);
                const { popup, elements, storage } = openPopup({ local: { currentStudies: [study("a1", "One")] } });
                popup.watchStudiesScroll();
                const container = elements["studies-container"];

                // Act
                container.scrollTop = 120;
                container.listeners.scroll();
                container.scrollTop = 250;
                container.listeners.scroll();
                await advance(t, 1000);

                // Assert
                assert.equal(storage.local.data.studiesScroll.top, 250);
                assert.ok(Date.now() - storage.local.data.studiesScroll.at <= 1000);
            });
        });

        describe("saved studies", () => {
            const titles = (elements) => findAll(elements["studies-container"], "study-title").map((t) => t.textContent);
            // Array.from builds a test-realm array; arrays made inside the vm fail deepEqual.
            const ids = (studies) => Array.from(studies, (s) => s.id);

            test("saves a study with the star and marks it as saved", async () => {
                // Arrange
                const { popup, elements, storage } = openPopup({ local: { currentStudies: [study("a1", "One"), study("b2", "Two")] } });
                await popup.populateStudies("", "created+");

                // Act
                const [, saveButton] = findAll(elements["studies-container"], "save-btn");
                await saveButton.listeners.click();

                // Assert
                assert.deepEqual(ids(storage.local.data.bookmarkedStudies), ["b2"]);
                const stars = findAll(elements["studies-container"], "save-btn").map((b) => b["aria-pressed"]);
                assert.deepEqual(stars, ["false", "true"]);
            });

            test("unsaves a saved study when its star is clicked again", async () => {
                // Arrange
                const one = study("a1", "One");
                const { popup, elements, storage } = openPopup({ local: { currentStudies: [one], bookmarkedStudies: [one] } });
                await popup.populateStudies("", "created+");

                // Act
                const [saveButton] = findAll(elements["studies-container"], "save-btn");
                await saveButton.listeners.click();

                // Assert
                assert.deepEqual(ids(storage.local.data.bookmarkedStudies), []);
            });

            test("Saved lists only saved studies, including ones gone from the history", async () => {
                // Arrange
                const { popup, elements } = openPopup({
                    local: { currentStudies: [study("a1", "One")], bookmarkedStudies: [study("x9", "Old but saved")], studiesView: "saved" },
                });

                // Act
                await popup.populateStudies("", "created+");

                // Assert
                assert.deepEqual(titles(elements), ["Old but saved"]);
                assert.equal(findAll(elements["studies-container"], "delete-btn").length, 0);
            });

            test("switches to Saved, remembers it and marks the pressed button", async () => {
                // Arrange
                const { popup, elements, storage } = openPopup({
                    local: { currentStudies: [study("a1", "One")], bookmarkedStudies: [study("b2", "Two")] },
                });
                popup.setupStudiesView();

                // Act
                await elements["view-saved"].listeners.click();

                // Assert
                assert.equal(storage.local.data.studiesView, "saved");
                assert.deepEqual(titles(elements), ["Two"]);
                assert.equal(elements["view-saved"]["aria-pressed"], "true");
                assert.equal(elements["view-all"]["aria-pressed"], "false");
            });

            test("shows how many studies are saved", async () => {
                // Arrange
                const { popup, elements } = openPopup({
                    local: { currentStudies: [study("a1", "One")], bookmarkedStudies: [study("a1", "One"), study("b2", "Two")] },
                });

                // Act
                await popup.populateStudies("", "created+");

                // Assert
                assert.equal(elements["saved-count"].textContent, "2");
            });

            test("explains the star when nothing is saved", async () => {
                // Arrange
                const { popup, elements } = openPopup({ local: { currentStudies: [study("a1", "One")], studiesView: "saved" } });

                // Act
                await popup.populateStudies("", "created+");

                // Assert
                assert.equal(textOf(elements["studies-container"]), "No saved studies yet. Click ☆ on a study to keep it here.");
            });

            test("deleting a saved study from All keeps it in Saved", async () => {
                // Arrange
                const one = study("a1", "One");
                const { popup, elements, storage } = openPopup({ local: { currentStudies: [one], bookmarkedStudies: [one] } });
                await popup.populateStudies("", "created+");

                // Act
                const [deleteButton] = findAll(elements["studies-container"], "delete-btn");
                await deleteButton.listeners.click();

                // Assert
                assert.deepEqual(ids(storage.local.data.currentStudies), []);
                assert.deepEqual(ids(storage.local.data.bookmarkedStudies), ["a1"]);
            });
        });

        describe("tab view", () => {
            const titles = (elements) => findAll(elements["studies-container"], "study-title").map((t) => t.textContent);

            test("Open in tab opens the popup page as a tab", async () => {
                // Arrange
                const { popup, elements, calls } = openPopup();
                popup.setupTabView();

                // Act
                await elements.openInTab.listeners.click();

                // Assert
                assert.deepEqual(calls.createdTabs, [{ url: "chrome-extension://test-extension/popup/popup.html?view=tab" }]);
            });

            test("as a tab it fills the page, hides Open in tab and opens on Studies", async () => {
                // Arrange
                const { popup, elements } = openPopup({ search: "?view=tab", sync: { activeTab: "settings" } });

                // Act
                popup.setupTabView();
                await popup.setCurrentActiveTab();

                // Assert
                assert.ok(elements.body.classList.contains("is-tab"));
                assert.equal(elements.openInTab.hidden, true);
                assert.equal(elements.studies.hidden, false);
            });

            test("as a popup it keeps its size and the last used section", async () => {
                // Arrange
                const { popup, elements } = openPopup({ sync: { activeTab: "settings" } });

                // Act
                popup.setupTabView();
                await popup.setCurrentActiveTab();

                // Assert
                assert.equal(elements.body.classList.contains("is-tab"), false);
                assert.notEqual(elements.openInTab.hidden, true);
                assert.equal(elements.settings.hidden, false);
            });

            test("redraws the list when studies change, keeping the scroll position", async () => {
                // Arrange
                const { popup, elements, storage } = openPopup({ local: { currentStudies: [study("a1", "One")] } });
                popup.watchStudyChanges();
                await popup.changeTab("studies");
                elements["studies-container"].scrollTop = 200;

                // Act
                await storage.local.set({ currentStudies: [study("a1", "One"), study("b2", "Two")] });

                // Assert
                assert.deepEqual(titles(elements), ["One", "Two"]);
                assert.equal(elements["studies-container"].scrollTop, 200);
            });

            test("does not redraw the list while another section is shown", async () => {
                // Arrange
                const { popup, elements, storage } = openPopup({ local: { currentStudies: [study("a1", "One")] } });
                popup.watchStudyChanges();
                await popup.changeTab("studies");
                await popup.changeTab("settings");

                // Act
                await storage.local.set({ currentStudies: [study("b2", "Two")] });

                // Assert
                assert.deepEqual(titles(elements), ["One"]);
            });
        });

        describe("list and card layouts", () => {
            const container = (elements) => elements["studies-container"];
            const textOfClass = (elements, className) => textOf(findAll(container(elements), className)[0] ?? {});

            test("popup HTML has a List / Cards switch, with List pressed", () => {
                // Arrange
                const html = fs.readFileSync(path.join(__dirname, "..", build, "prod", "popup", "popup.html"), "utf8");

                // Act
                const studies = html.match(/<section id="studies">([\s\S]*?)<\/section>/)?.[1] ?? "";

                // Assert
                assert.match(studies, /<button [^>]*id="layout-list"[^>]*aria-pressed="true"/);
                assert.match(studies, /<button [^>]*id="layout-cards"[^>]*aria-pressed="false"/);
            });

            test("shows compact list rows when no layout was chosen", async () => {
                // Arrange
                const { popup, elements } = openPopup({ local: { currentStudies: [study("a1", "A study")] } });

                // Act
                await popup.populateStudies("", "created+");

                // Assert
                assert.equal(findAll(container(elements), "is-compact").length, 1);
                assert.equal(findAll(container(elements), "is-detailed").length, 0);
                assert.equal(elements["layout-list"]["aria-pressed"], "true");
                assert.equal(elements["layout-cards"]["aria-pressed"], "false");
            });

            test("cards put every detail on its own labelled line", async () => {
                // Arrange
                const { popup, elements } = openPopup({ local: { currentStudies: [study("a1", "A study")], studiesLayout: "cards" } });

                // Act
                await popup.populateStudies("", "created+");

                // Assert
                assert.equal(findAll(container(elements), "is-detailed").length, 1);
                assert.equal(findAll(container(elements), "study-meta").length, 0);
                assert.equal(textOfClass(elements, "study-reward"), "Pay: £1.00");
                assert.equal(textOfClass(elements, "study-reward-hour"), "£10.00/hr");
                assert.equal(textOfClass(elements, "study-time"), "Time: 6 mins");
                assert.equal(textOfClass(elements, "study-places"), "120 places");
                assert.equal(textOfClass(elements, "study-researcher"), "A lab");
                assert.equal(elements["layout-cards"]["aria-pressed"], "true");
            });

            test("cards leave places out for studies saved before places were recorded", async () => {
                // Arrange
                const old = study("a1", "A study", "A lab", { places: undefined });
                const { popup, elements } = openPopup({ local: { currentStudies: [old], studiesLayout: "cards" } });

                // Act
                await popup.populateStudies("", "created+");

                // Assert
                assert.equal(findAll(container(elements), "study-places").length, 0);
            });

            test("cards keep the title link and labelled Open, Save and Delete buttons", async () => {
                // Arrange
                const { popup, elements } = openPopup({ local: { currentStudies: [study("a1", "A study")], studiesLayout: "cards" } });

                // Act
                await popup.populateStudies("", "created+");

                // Assert
                const [title] = findAll(container(elements), "study-title");
                assert.equal(title.tagName, "A");
                assert.equal(title.href, "https://app.prolific.com/studies/a1");
                assert.equal(textOfClass(elements, "open-btn"), "Open ↗");
                assert.equal(textOfClass(elements, "save-btn"), "☆ Save");
                assert.equal(textOfClass(elements, "delete-btn"), "Delete");
            });

            test("cards keep the labelled Open button in the Tab order", async () => {
                // Arrange
                const { popup, elements } = openPopup({ local: { currentStudies: [study("a1", "A study")], studiesLayout: "cards" } });

                // Act
                await popup.populateStudies("", "created+");

                // Assert
                const [openLink] = findAll(container(elements), "open-btn");
                assert.notEqual(openLink.tabIndex, -1);
            });

            test("cards grey out opened studies and save, unsave and delete like rows", async () => {
                // Arrange
                const { popup, elements, storage } = openPopup({
                    local: { currentStudies: [study("a1", "One"), study("b2", "Two")], openedStudyIds: ["a1"], studiesLayout: "cards" },
                });
                await popup.populateStudies("", "created+");
                const ids = (studies) => Array.from(studies, (s) => s.id);

                // Act
                await findAll(container(elements), "save-btn")[1].listeners.click();
                await findAll(container(elements), "delete-btn")[0].listeners.click();

                // Assert
                assert.deepEqual(ids(storage.local.data.bookmarkedStudies), ["b2"]);
                assert.deepEqual(ids(storage.local.data.currentStudies), ["b2"]);
                const [saveButton] = findAll(container(elements), "save-btn");
                assert.equal(textOf(saveButton), "★ Save");
                assert.equal(saveButton["aria-pressed"], "true");
            });

            test("marks an opened card right away", async () => {
                // Arrange
                const { popup, elements } = openPopup({ local: { currentStudies: [study("a1", "One")], studiesLayout: "cards" } });
                await popup.populateStudies("", "created+");

                // Act
                await findAll(container(elements), "open-btn")[0].listeners.click();

                // Assert
                assert.ok(findAll(container(elements), "study-card")[0].classList.contains("is-opened"));
            });

            // Rows and cards differ in height, so the old offset would land on another study.
            test("switching layout remembers it and redraws from the top", async () => {
                // Arrange
                const { popup, elements, storage } = openPopup({ local: { currentStudies: [study("a1", "One")] } });
                popup.setupStudiesLayout();
                await popup.populateStudies("", "created+");
                container(elements).scrollTop = 120;

                // Act
                await elements["layout-cards"].listeners.click();

                // Assert
                assert.equal(storage.local.data.studiesLayout, "cards");
                assert.equal(findAll(container(elements), "is-detailed").length, 1);
                assert.equal(container(elements).scrollTop, 0);

                // Act
                await elements["layout-list"].listeners.click();

                // Assert
                assert.equal(storage.local.data.studiesLayout, "list");
                assert.equal(findAll(container(elements), "is-compact").length, 1);
            });
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
            ["settings", "studies", "filters"].filter((tab) => elements[tab].hidden === false);

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

        test("shows a section with the hidden attribute and leaves its display to the CSS", async () => {
            // Arrange: the Studies section is a flex column, so its list can shrink to fit the popup
            const { popup, elements } = openPopup({ sync: { activeTab: "studies" } });

            // Act
            await popup.setCurrentActiveTab();

            // Assert
            assert.equal(elements.settings.hidden, true);
            assert.equal(elements.filters.hidden, true);
            assert.equal(elements.studies.hidden, false);
            assert.deepEqual(["settings", "studies", "filters"].map((tab) => elements[tab].style.display), [undefined, undefined, undefined]);
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

            test("popup HTML carries the card copy and report link", () => {
                // Arrange
                const html = fs.readFileSync(path.join(__dirname, "..", build, "prod", "popup", "popup.html"), "utf8");

                // Act + Assert
                assert.match(html, /Enjoying Prolific Studies Notifier\?/);
                assert.match(html, /A quick rating helps other participants find it\./);
                assert.match(html, /href="https:\/\/github\.com\/spin311\/ProlificAutomaticStudies\/issues\/new"/);
            });
        });

        describe("cross-promo", () => {
            const STORE = build === "chrome" ? "https://chromewebstore.google.com/" : "https://addons.mozilla.org/";

            test("popup HTML shows Free Game Claimer as a card with its icon, name and UTM tags", () => {
                // Arrange
                const html = fs.readFileSync(path.join(__dirname, "..", build, "prod", "popup", "popup.html"), "utf8");

                // Act
                const card = html.match(/<a ([^>]*class="promo-tile"[^>]*)>([\s\S]*?)<\/a>/);
                const iconPath = card?.[2].match(/<img [^>]*src="\/(imgs\/[^"]+)"/)?.[1];

                // Assert
                assert.ok(card, "promo card link is missing");
                const [, attributes, content] = card;
                assert.ok(attributes.includes(`href="${STORE}`), `card should link to ${STORE}`);
                assert.match(attributes, /utm_source=ProlificAutomaticStudies-popup&amp;utm_medium=cross-promo/);
                assert.match(attributes, /target="_blank" rel="noopener noreferrer"/);
                assert.match(content, /<strong[^>]*>Free Game Claimer<\/strong>/);
                assert.ok(iconPath, "promo card has no icon");
                assert.ok(fs.existsSync(path.join(__dirname, "..", build, "prod", iconPath)), `${iconPath} is not in the store build`);
            });

            test("popup HTML describes Free Game Claimer without 'by the same developer'", () => {
                // Arrange
                const html = fs.readFileSync(path.join(__dirname, "..", build, "prod", "popup", "popup.html"), "utf8");

                // Act
                const title = html.match(/<a [^>]*class="promo-tile"[^>]*title="([^"]*)"/)?.[1];

                // Assert
                assert.equal(title, "A free extension that claims free games for you");
            });
        });

        describe("popup HTML tooltips", () => {
            const html = () => fs.readFileSync(path.join(__dirname, "..", build, "prod", "popup", "popup.html"), "utf8");
            const section = (id) => html().match(new RegExp(`<section id="${id}">([\\s\\S]*?)</section>`))?.[1] ?? "";

            test("Filters has no tooltips", () => {
                assert.doesNotMatch(section("filters"), /tooltip/);
            });

            test("Fast mode says when to use it, that it calls Prolific's API, and that it's at your own risk", () => {
                // Act
                const tooltip = section("settings").match(/<label for="fastMode"[\s\S]*?data-tooltip="([^"]*)"/)?.[1];

                // Assert
                assert.equal(tooltip, "Only use if normal detection doesn't work. Calls Prolific's API. Use at your own risk.");
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
