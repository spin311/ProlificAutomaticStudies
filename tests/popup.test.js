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
        function openPopup({ local = {}, sync = {} } = {}) {
            const storage = createStorage({ local, sync });
            const { chrome } = createChrome({ storage });
            const elements = {
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
            return { popup, elements, storage };
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
    });
}
