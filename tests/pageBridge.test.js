// Page bridge (chrome|firefox/dist/pageBridge.js): reaches Prolific's own page objects and
// asks the page's studies store to refresh, reporting how it went.
// Run: node --test tests/
const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { loadScripts, dist, settle, toPlain } = require("./support/sandbox");

const RATE_LIMITED_ROUTE = "error.participant-studies-rate-limited";

// A minimal stand-in for Prolific's Vue app: Pinia stores and the router.
function fakeProlificApp({ fetchList = async () => {}, otherStores = [], studies = [] } = {}) {
    const fetchCalls = [];
    const route = { value: { name: "studies" } };
    const studiesStore = {
        displayStudiesList: studies,
        fetchList: (options) => {
            fetchCalls.push(toPlain(options));
            return fetchList(route);
        },
    };
    const stores = new Map([["participant/studies", studiesStore], ...otherStores.map((store, i) => [`store-${i}`, store])]);
    const app = { config: { globalProperties: { $pinia: { _s: stores }, $router: { currentRoute: route } } } };
    return { app, fetchCalls };
}

// A study as Prolific's participant/studies store holds it (amounts in pence/cents).
const prolificStudy = (id, overrides = {}) => ({
    id,
    name: `Study ${id}`,
    researcher: { id: "r1", name: "Agate Astica" },
    study_reward: { amount: 107, currency: "GBP" },
    study_average_reward_per_hour: { amount: 1211, currency: "GBP" },
    study_estimated_reward_per_hour: { amount: 1300, currency: "GBP" },
    estimated_completion_time: 5,
    total_available_places: 300,
    places_taken: 97,
    is_official_prolific_study: false,
    ...overrides,
});
const PROJECT = { id: "p1", title: "AI tasks" };

// The bridge answers synchronously, inside dispatchEvent, like across Chrome's worlds.
function requestProjectStudies(window) {
    let detail = null;
    const onResult = (event) => { detail = event.detail; };
    window.addEventListener("psn:project-studies-result", onResult);
    window.dispatchEvent(new CustomEvent("psn:project-studies-request"));
    window.removeEventListener("psn:project-studies-result", onResult);
    return detail === null ? null : JSON.parse(detail);
}

const BUILDS = ["chrome", "firefox"];

for (const build of BUILDS) {
  describe(build, () => {
    function loadBridge(app, window = new EventTarget()) {
        const page = app ? { __vue_app__: app } : {};
        const root = build === "firefox" ? { wrappedJSObject: page } : page;
        const document = { getElementById: (id) => (id === "app" ? root : null) };
        const cloneInto = (value) => value;
        loadScripts([dist(build, "pageBridge.js")], { globals: { window, document, CustomEvent, cloneInto } });
        return window;
    }

    async function requestRefresh(window, id = "request-1") {
        const results = [];
        window.addEventListener("psn:refresh-result", (event) => results.push(JSON.parse(event.detail)));
        window.dispatchEvent(new CustomEvent("psn:refresh-request", { detail: id }));
        await settle();
        return results.find((result) => result.id === id)?.status;
    }

    test("refreshes the studies list through the page's own store", async () => {
        // Arrange
        const { app, fetchCalls } = fakeProlificApp();
        const window = loadBridge(app);

        // Act
        const status = await requestRefresh(window);

        // Assert
        assert.equal(status, "ok");
        assert.deepEqual(fetchCalls, [{ automatic: true }]);
    });

    test("does not refresh while the account has a restriction", async () => {
        // Arrange
        const { app, fetchCalls } = fakeProlificApp({
            otherStores: [{ activeBotDetectionRestriction: { trigger: "BOT_DETECTION" } }],
        });
        const window = loadBridge(app);

        // Act
        const status = await requestRefresh(window);

        // Assert
        assert.equal(status, "restricted");
        assert.deepEqual(fetchCalls, []);
    });

    test("reports when Prolific answers with its rate-limit page", async () => {
        // Arrange: on HTTP 429 Prolific's fetchList awaits a router navigation to its
        // rate-limit route before it resolves
        const { app } = fakeProlificApp({
            fetchList: async (route) => {
                await new Promise((resolve) => setImmediate(resolve));
                route.value = { name: RATE_LIMITED_ROUTE };
            },
        });
        const window = loadBridge(app);

        // Act
        const status = await requestRefresh(window);

        // Assert
        assert.equal(status, "rate-limited");
    });

    test("reports an error when the refresh fails", async () => {
        // Arrange
        const { app } = fakeProlificApp({
            fetchList: async () => {
                throw new Error("401");
            },
        });
        const window = loadBridge(app);

        // Act
        const status = await requestRefresh(window);

        // Assert
        assert.equal(status, "error");
    });

    test("reports unavailable when the page has no Prolific app to refresh", async () => {
        // Arrange
        const window = loadBridge(null);

        // Act
        const status = await requestRefresh(window);

        // Assert
        assert.equal(status, "unavailable");
    });

    test("ignores requests without a string id", async () => {
        // Arrange
        const { app, fetchCalls } = fakeProlificApp();
        const window = loadBridge(app);

        // Act
        window.dispatchEvent(new CustomEvent("psn:refresh-request", { detail: { id: 1 } }));
        await settle();

        // Assert
        assert.deepEqual(fetchCalls, []);
    });

    test("refreshes at most once per 25 seconds whoever asks", async () => {
        // Arrange: any script on the page can send the request event
        const { app, fetchCalls } = fakeProlificApp();
        const window = loadBridge(app);

        // Act
        const first = await requestRefresh(window, "first");
        const second = await requestRefresh(window, "second");

        // Assert
        assert.equal(first, "ok");
        assert.equal(second, "throttled");
        assert.equal(fetchCalls.length, 1);
    });

    describe("project studies", () => {
        test("answers with the studies Prolific keeps out of its Studies list", () => {
            // Arrange: Prolific's list shows studies without a project, and official ones
            const { app } = fakeProlificApp({ studies: [
                prolificStudy("a"),
                prolificStudy("b", { project: PROJECT }),
                prolificStudy("c", { project: PROJECT, is_official_prolific_study: true }),
            ] });
            const window = loadBridge(app);

            // Act
            const studies = requestProjectStudies(window);

            // Assert
            assert.deepEqual(studies, [{
                id: "b",
                name: "Study b",
                host: "Agate Astica",
                reward: { amount: 107, currency: "GBP" },
                rewardPerHour: { amount: 1211, currency: "GBP" },
                completionMinutes: 5,
                totalPlaces: 300,
                placesTaken: 97,
            }]);
        });

        test("uses the host name and hourly rate that Prolific's card shows", () => {
            // Arrange: no average rate yet, and the study is published by an institution
            const { app } = fakeProlificApp({ studies: [prolificStudy("b", {
                project: PROJECT,
                publisher: { name: "A lab", institution: { name: "University of Somewhere" } },
                study_average_reward_per_hour: { amount: 0, currency: "GBP" },
            })] });
            const window = loadBridge(app);

            // Act
            const [study] = requestProjectStudies(window);

            // Assert
            assert.equal(study.host, "University of Somewhere");
            assert.deepEqual(study.rewardPerHour, { amount: 1300, currency: "GBP" });
        });

        test("answers with no studies when the page has no studies store", () => {
            // Arrange
            const window = loadBridge(null);

            // Act + Assert
            assert.deepEqual(requestProjectStudies(window), []);
        });
    });

    test("answers each request once when the bridge is loaded twice", async () => {
        // Arrange
        const { app, fetchCalls } = fakeProlificApp();
        const window = loadBridge(app);
        loadBridge(app, window);
        const results = [];
        window.addEventListener("psn:refresh-result", (event) => results.push(event.detail));

        // Act
        window.dispatchEvent(new CustomEvent("psn:refresh-request", { detail: "only" }));
        await settle();

        // Assert
        assert.equal(fetchCalls.length, 1);
        assert.equal(results.length, 1);
    });
  });
}
