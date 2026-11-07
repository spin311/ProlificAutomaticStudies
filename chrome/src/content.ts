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
let isProcessing: boolean = false;

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

function handleContentMessages(message: { target: string; type: any; data?: any; }): Promise<void> {
    if (message.target !== "content" && message.target !== 'everything') {
        return Promise.resolve();
    }
    switch (message.type) {
        case "change-alert-type":
            if (message.data === "website") {
                observeStudyChanges();
            } else {
                disconnectObserver();
            }
            return Promise.resolve();
        default:
            return Promise.resolve();
    }
}

function isObserverActive(): boolean {
    return globalObserver !== null;
}

function disconnectObserver() {
    globalObserver?.disconnect();
    globalObserver = null;

    if (globalInterval !== null) {
        clearInterval(globalInterval);
        globalInterval = null;
    }
}

chrome.runtime.onMessage.addListener(handleContentMessages);
void observeStudyChanges();

async function observeStudyChanges(): Promise<void> {
    if (isObserverActive()) return;

    globalObserver = new MutationObserver(async (mutationsList) => {
        const targetNode = document.querySelector(targetSelector);
        if (!targetNode || isProcessing) return;

        const hasChanges = mutationsList.some(mutation =>
            mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0 || mutation.type === 'childList'
        );

        if (hasChanges) {
            await extractAndSendStudies(targetNode);
        }
    });

    globalObserver.observe(document.body, { childList: true, subtree: true });

    // Setup polling fallback
    const result = await chrome.storage.sync.get(["refreshRate"]);
    const refreshRate = result["refreshRate"];
    if (refreshRate && refreshRate > 0) {
        const timer = (result["refreshRate"] ?? 5) * 1000;
        globalInterval = setInterval(async () => {
            const node = await waitForElement(targetSelector);
            if (node && !isProcessing) {
                await extractAndSendStudies(node);
            }
        }, timer);
    }
}

async function extractAndSendStudies(targetNode: Element): Promise<void> {
    try {
        if (isProcessing) return;
        isProcessing = true;
        const studies = await extractStudies(targetNode);
        if (studies.length > 0) {
            void chrome.runtime.sendMessage({
                target: "background",
                type: "new-studies",
                data: studies,
            });
        }
    } finally {
        isProcessing = false;
    }
}

async function waitForElement(selector: string): Promise<Element | null> {
    return new Promise((resolve) => {
        const observer = new MutationObserver(() => {
            const target = document.querySelector(selector);
            if (target) {
                observer.disconnect();
                resolve(target);
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        const target = document.querySelector(selector);
        if (target) {
            observer.disconnect();
            resolve(target);
        }
    });
}

async function extractStudies(targetNode: Element): Promise<StudyContent[]> {
    const studyElements = targetNode.querySelectorAll("li[class='list-item']");
    const storageValues = await chrome.storage.sync.get([
        "trackIds",
        "studyHistoryLen",
        REWARD,
        REWARD_PER_HOUR,
        TIME,
        NAME_BLACKLIST,
        RESEARCHER_BLACKLIST,
    ]);
    const localValues = await chrome.storage.local.get([
        "currentStudies",
        SEEN_STUDY_IDS,
    ]);

    const shouldIgnoreOldStudies: boolean = storageValues["trackIds"] ?? true;
    if (!studyElements || studyElements.length === 0) {
        if (!shouldIgnoreOldStudies) {
            await chrome.storage.local.set({["currentStudies"]: []});
        }
        return [];
    }

    let studies: StudyContent[] = [];
    const numberOfStudiesToStore = storageValues["studyHistoryLen"] ?? NUMBER_OF_STUDIES_TO_STORE;
    let savedStudies: StudyContent[] = localValues["currentStudies"] ?? [];
    const reward: number = storageValues[REWARD] ?? 0;
    const rewardPerHour: number = storageValues[REWARD_PER_HOUR] ?? 0;
    const time: number = storageValues[TIME] ?? 0;
    const nameBlacklist: string[] = storageValues[NAME_BLACKLIST] ?? [];
    const researcherBlacklist: string[] = storageValues[RESEARCHER_BLACKLIST] ?? [];
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
        savedStudies.forEach((study) => knownIds.add(study.id));
    }

    function shouldIncludeStudy(study: StudyContent) {
        if (reward && study.reward && getFloatValueFromMoneyStringContent(study.reward) < reward) return false;
        if (time && study.timeInMinutes && study.timeInMinutes < time) return false;
        if (nameBlacklist.some((name) => study.title?.toLowerCase().includes(name))) return false;
        if (researcherBlacklist.some((researcher) => study.researcher?.toLowerCase().includes(researcher))) return false;
        return !(rewardPerHour && study.rewardPerHour && getFloatValueFromMoneyStringContent(study.rewardPerHour) < rewardPerHour);
    }

    function shouldFilterStudies() {
        return reward > 0 || rewardPerHour > 0 || time > 0 || nameBlacklist.length > 0 || researcherBlacklist.length > 0;
    }

    studyElements.forEach((study) => {
        const id = getStudyId(study);
        if (!id || knownIds.has(id)) return;
        const title = getTextContent(study, '[data-testid="title"]');
        const researcher = getTextContent(study, '[data-testid="host"]')?.split(" ").slice(1).join(" ") || null;
        const reward = getTextContent(study, '[data-testid="study-tag-reward"]');
        const rewardPerHour = getTextContent(study, '[data-testid="study-tag-reward-per-hour"]')?.replace("/hr", "") || null;
        const time = getTextContent(study, '[data-testid="study-tag-completion-time"]');
        const timeInMinutes = parseTimeContent(time);
        studies.push({
            id,
            title,
            researcher,
            reward,
            rewardPerHour,
            time,
            timeInMinutes,
            places: getPlaces(study),
            createdAt: new Date().toISOString(),
        });
    });

    if (shouldFilterStudies()) {
        studies = studies.filter((study) => shouldIncludeStudy(study));
    }

    if (shouldIgnoreOldStudies) {
        savedStudies = [...savedStudies, ...studies];
    } else {
        savedStudies = studies;
    }
    if (savedStudies.length > numberOfStudiesToStore) {
        savedStudies = savedStudies.slice(-numberOfStudiesToStore);
    }
    if (studies.length > 0) {
        await chrome.storage.local.set({"currentStudies": savedStudies});
    }

    const updatedSeenIds = getUpdatedSeenIds(seenIds, listedIds, studies);
    if (!haveSameIds(storedSeenIds ?? [], updatedSeenIds)) {
        await chrome.storage.local.set({[SEEN_STUDY_IDS]: updatedSeenIds});
    }

    return studies;
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
        ...listedIds.filter((id) => seen.has(id)),
        ...notified.map((study) => study.id).filter((id): id is string => id !== null),
    ]);
    return [...seenIds.filter((id) => !recent.has(id)), ...recent].slice(-SEEN_STUDY_IDS_LIMIT);
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

function getTextContent(element: Element | null, selector: string): string | null {
    return element?.querySelector(selector)?.textContent || null;
}

function parseTimeContent(value: string | null): number {
    if (!value) return 0;
    const hourMatch = value.match(/(\d+)\s*hour/);
    const minMatch = value.match(/(\d+)\s*min/);

    const hours = hourMatch ? parseInt(hourMatch[1], 10) : 0;
    const minutes = minMatch ? parseInt(minMatch[1], 10) : 0;

    return hours * 60 + minutes;
}

function getFloatValueFromMoneyStringContent(value: string): number {
    const firstWord = value.split(" ")[0];
    if (firstWord.charAt(0) === '£') {
        return parseFloat(firstWord.slice(1));
    } else if (firstWord.charAt(0) === '$') {
        return parseFloat(firstWord.slice(1)) * 0.8;
    } else {
        return 0;
    }
}
