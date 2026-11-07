type StudyContent = {
    id: string | null;
    title: string | null;
    researcher: string | null;
    reward: string | null;
    rewardPerHour: string | null;
    time: string | null;
    timeInMinutes: number | null;
    places: string | null;
    createdAt: string | null;
};

const targetSelector = 'div[data-testid="studies-list"]';
let globalObserver: MutationObserver | null = null;
let globalInterval: number | null = null;
let isProcessing = false;
let isObserverInitializing = false;

const NUMBER_OF_STUDIES_TO_STORE = 100;
const REWARD = "reward";
const REWARD_PER_HOUR = "rewardPerHour";
const TIME = 'time';
const NAME_BLACKLIST = "nameBlacklist";
const RESEARCHER_BLACKLIST = "researcherBlacklist";
const SEEN_STUDY_IDS = "seenStudyIds";
// Well above the number of studies Prolific lists at once, so a listed study
// is never dropped while it is still on the page.
const SEEN_STUDY_IDS_LIMIT = 1000;

browser.runtime.onMessage.addListener(handleContentMessages);
observeStudyChanges();

async function getValueFromStorage<T>(key: string, defaultValue: T): Promise<T> {
    const result = await browser.storage.sync.get(key);
    return result[key] !== undefined ? result[key] as T : defaultValue;
}

async function waitForElement(selector: string): Promise<Element | null> {
    const useOld = await getValueFromStorage("useOld", false);
    if (useOld) return null;

    return new Promise((resolve) => {
        const observer = new MutationObserver(() => {
            const target = document.querySelector(selector);
            if (target) {
                observer.disconnect();
                resolve(target);
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });

        const existingElement = document.querySelector(selector);
        if (existingElement) {
            observer.disconnect();
            resolve(existingElement);
        }
    });
}

function handleContentMessages(message: { target: string; type: string; data?: any; }): void {
    if (message.target !== "content" && message.target !== 'everything') return;

    switch (message.type) {
        case "change-alert-type":
            if (message.data === "website") {
                observeStudyChanges();
            } else {
                disconnectObserver();
            }
            break;
    }
}

function disconnectObserver(): void {
    globalObserver?.disconnect();
    globalObserver = null;

    if (globalInterval !== null) {
        clearInterval(globalInterval);
        globalInterval = null;
    }
}

function isObserverActive(): boolean {
    return globalObserver !== null;
}

async function observeStudyChanges(): Promise<void> {
    if (isObserverActive() || isObserverInitializing) return;
    isObserverInitializing = true;

    const targetNode = await waitForElement(targetSelector);
    isObserverInitializing = false;
    if (!targetNode) return;

    globalObserver = new MutationObserver(async (mutations) => {
        if (isProcessing) return;
        const hasChanges = mutations.some(m =>
            m.addedNodes.length > 0 || m.removedNodes.length > 0
        );
        if (hasChanges) await extractAndSendStudies(targetNode);
    });

    globalObserver.observe(targetNode, { childList: true, subtree: true });
    await extractAndSendStudies(targetNode);

    const storage = await browser.storage.sync.get(["refreshRate"]);
    const refreshRate = storage["refreshRate"];
    if (refreshRate && refreshRate > 0) {
        const intervalMs = refreshRate * 1000;
        globalInterval = setInterval(async () => {
            const node = await waitForElement(targetSelector);
            if (node && !isProcessing) {
                await extractAndSendStudies(node);
            }
        }, intervalMs);
    }
}

async function extractAndSendStudies(targetNode: Element): Promise<void> {
    if (isProcessing) return;
    isProcessing = true;

    try {
        const studies = await extractStudies(targetNode);
        if (studies.length > 0) {
            await browser.runtime.sendMessage({
                target: "background",
                type: "new-studies",
                data: studies,
            });
        }
    } catch (e) {
        console.error("Error extracting studies:", e);
    } finally {
        isProcessing = false;
    }
}

async function extractStudies(targetNode: Element): Promise<StudyContent[]> {
    const studyElements = targetNode.querySelectorAll("li.list-item");
    if (!studyElements.length) return [];

    const storageValues = await browser.storage.sync.get([
        "trackIds", "studyHistoryLen",
        REWARD, REWARD_PER_HOUR, TIME,
        NAME_BLACKLIST, RESEARCHER_BLACKLIST
    ]);
    const localValues = await browser.storage.local.get(["currentStudies", SEEN_STUDY_IDS]);

    const shouldIgnoreOldStudies = storageValues["trackIds"] ?? true;
    const numberOfStudiesToStore = storageValues["studyHistoryLen"] ?? NUMBER_OF_STUDIES_TO_STORE;
    const reward = storageValues[REWARD] ?? 0;
    const rewardPerHour = storageValues[REWARD_PER_HOUR] ?? 0;
    const time = storageValues[TIME] ?? 0;
    const nameBlacklist = (storageValues[NAME_BLACKLIST] || []).map((s: string) => s.toLowerCase());
    const researcherBlacklist = (storageValues[RESEARCHER_BLACKLIST] || []).map((s: string) => s.toLowerCase());

    let savedStudies: StudyContent[] = localValues["currentStudies"] || [];
    // Studies already seen on the page are never new, however short the history
    // is. Before this, studies trimmed from the history while still listed were
    // re-notified on every page mutation. The set only grows (up to its limit),
    // so an empty re-render or a second tab with an older list can't reset it.
    const listedIds = getStudyIds(studyElements);
    const storedSeenIds: string[] | undefined = localValues[SEEN_STUDY_IDS];
    // First scan after upgrading: adopt what is listed without notifying it again.
    const isFirstScanAfterUpgrade = storedSeenIds === undefined && savedStudies.length > 0;
    const seenIds = isFirstScanAfterUpgrade ? listedIds : storedSeenIds ?? [];
    const knownIds = new Set<string | null>(seenIds);
    if (shouldIgnoreOldStudies) {
        savedStudies.forEach(study => knownIds.add(study.id));
    }
    const newStudies: StudyContent[] = [];

    studyElements.forEach(el => {
        const id = getStudyId(el);
        if (!id || knownIds.has(id)) return;

        const title = getTextContent(el, '[data-testid="title"]');
        const researcherRaw = getTextContent(el, '[data-testid="host"]');
        const researcher = researcherRaw?.split(" ").slice(1).join(" ") || null;
        const reward = getTextContent(el, '[data-testid="study-tag-reward"]');
        const rewardPerHour = getTextContent(el, '[data-testid="study-tag-reward-per-hour"]')?.replace("/hr", "") || null;
        const time = getTextContent(el, '[data-testid="study-tag-completion-time"]');
        const timeInMinutes = parseTimeContent(time);

        newStudies.push({
            id,
            title,
            researcher,
            reward,
            rewardPerHour,
            time,
            timeInMinutes,
            places: getPlaces(el),
            createdAt: new Date().toISOString(),
        });
    });

    const filteredStudies = newStudies.filter(study => {
        if (reward > 0 && study.reward && getFloatValueFromMoney(study.reward) < reward) return false;
        if (time > 0 && study.timeInMinutes && study.timeInMinutes < time) return false;
        if (rewardPerHour > 0 && study.rewardPerHour && getFloatValueFromMoney(study.rewardPerHour) < rewardPerHour) return false;
        if (study.title && nameBlacklist.some((name: string) => study.title!.toLowerCase().includes(name))) return false;
        return !(study.researcher && researcherBlacklist.some((res: string) => study.researcher!.toLowerCase().includes(res)));
    });

    savedStudies = shouldIgnoreOldStudies
        ? [...savedStudies, ...filteredStudies]
        : filteredStudies;

    if (savedStudies.length > numberOfStudiesToStore) {
        savedStudies = savedStudies.slice(-numberOfStudiesToStore);
    }

    await browser.storage.local.set({ "currentStudies": savedStudies });

    const updatedSeenIds = getUpdatedSeenIds(seenIds, listedIds, filteredStudies);
    if (!haveSameIds(storedSeenIds ?? [], updatedSeenIds)) {
        await browser.storage.local.set({ [SEEN_STUDY_IDS]: updatedSeenIds });
    }

    return filteredStudies;
}

function getStudyId(study: Element): string | null {
    return study.getAttribute("data-testid")?.split("-")[1] || null;
}

function getStudyIds(studyElements: NodeListOf<Element>): string[] {
    return Array.from(studyElements)
        .map(getStudyId)
        .filter((id): id is string => id !== null);
}

// Moves still-listed seen ids to the end (most recent) and adds the newly
// notified ones. Filtered-out studies are not added, so relaxing a filter
// still notifies them.
function getUpdatedSeenIds(seenIds: string[], listedIds: string[], notified: StudyContent[]): string[] {
    const seen = new Set(seenIds);
    const recent = new Set([
        ...listedIds.filter(id => seen.has(id)),
        ...notified.map(study => study.id).filter((id): id is string => id !== null),
    ]);
    return [...seenIds.filter(id => !recent.has(id)), ...recent].slice(-SEEN_STUDY_IDS_LIMIT);
}

function haveSameIds(previous: string[], current: string[]): boolean {
    return previous.length === current.length && previous.every((id, index) => id === current[index]);
}

// Prolific shows places left as "120 places", or an infinity sign when a study has no limit.
// It is the count when the study was first seen, so it goes stale.
function getPlaces(study: Element): string | null {
    if (study.querySelector('[data-testid="study-tag-places-infinite"]')) return "∞ places";
    return getTextContent(study, '[data-testid="study-tag-places"]')?.trim() || null;
}

function getTextContent(element: Element, selector: string): string | null {
    const target = element.querySelector(selector);
    return target?.textContent?.trim() || null;
}

function parseTimeContent(value: string | null): number {
    if (!value) return 0;

    let minutes = 0;
    const hourMatch = value.match(/(\d+)\s*h/);
    const minMatch = value.match(/(\d+)\s*m/);

    if (hourMatch) minutes += parseInt(hourMatch[1], 10) * 60;
    if (minMatch) minutes += parseInt(minMatch[1], 10);

    return minutes;
}

function getFloatValueFromMoney(value: string): number {
    if (!value) return 0;
    const amount = parseFloat(value.replace(/[£$]/g, ''));
    return value.startsWith('$') ? amount * 0.8 : amount;
}
