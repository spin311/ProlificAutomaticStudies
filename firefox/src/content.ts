type StudyContent = {
    id: string | null;
    title: string | null;
    researcher: string | null;
    reward: string | null;
    rewardPerHour: string | null;
    time: string | null;
    timeInMinutes: number | null;
    limitedCapacity: boolean | null;
    createdAt: string | null;
};

const targetSelector = 'div[data-testid="studies-list"]';
let globalObserver: MutationObserver | null = null;
let isProcessing = false;
let isObserverInitializing = false;

const NUMBER_OF_STUDIES_TO_STORE = 100;
const REWARD = "reward";
const REWARD_PER_HOUR = "rewardPerHour";
const TIME = 'time';
const NAME_BLACKLIST = "nameBlacklist";
const RESEARCHER_BLACKLIST = "researcherBlacklist";

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

        // Check immediately if element exists
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
                globalObserver?.disconnect();
                globalObserver = null;
            }
            break;
    }
}

browser.runtime.onMessage.addListener(handleContentMessages);
observeStudyChanges();

function observeStudyChanges(): void {
    if (globalObserver || isObserverInitializing) return;
    isObserverInitializing = true;

    waitForElement(targetSelector).then(async (targetNode) => {
        isObserverInitializing = false;
        if (!targetNode || globalObserver) return;

        // Create observer for dynamic content
        globalObserver = new MutationObserver(async (mutations) => {
            if (isProcessing) return;
            const hasChanges = mutations.some(mutation =>
                mutation.addedNodes.length || mutation.removedNodes.length
            );
            if (hasChanges) await extractAndSendStudies(targetNode);
        });

        // Initial extraction
        await extractAndSendStudies(targetNode);
        globalObserver.observe(targetNode, { childList: true, subtree: true });
    });
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
    } catch (error) {
        console.error("Error extracting studies:", error);
    } finally {
        isProcessing = false;
    }
}

async function extractStudies(targetNode: Element): Promise<StudyContent[]> {
    const studyElements = targetNode.querySelectorAll("li[class='list-item']");
    if (!studyElements || studyElements.length === 0) return [];

    // Get all storage values in one call
    const storageValues = await browser.storage.sync.get([
        "trackIds", "studyHistoryLen", "currentStudies",
        REWARD, REWARD_PER_HOUR, TIME,
        NAME_BLACKLIST, RESEARCHER_BLACKLIST
    ]);

    const shouldIgnoreOldStudies = storageValues["trackIds"] ?? true;
    const numberOfStudiesToStore = storageValues["studyHistoryLen"] ?? NUMBER_OF_STUDIES_TO_STORE;
    const reward = storageValues[REWARD] ?? 0;
    const rewardPerHour = storageValues[REWARD_PER_HOUR] ?? 0;
    const time = storageValues[TIME] ?? 0;
    const nameBlacklist: string[] = (storageValues[NAME_BLACKLIST] || []).map((s: string) => s.toLowerCase());
    const researcherBlacklist: string[] = (storageValues[RESEARCHER_BLACKLIST] || []).map((s: string) => s.toLowerCase());

    let savedStudies: StudyContent[] = storageValues["currentStudies"] || [];
    const existingIds = new Set(savedStudies.map(study => study.id));
    const newStudies: StudyContent[] = [];

    studyElements.forEach(studyElement => {
        const id = studyElement.getAttribute("data-testid")?.split("-")[1] || null;
        if (!id || existingIds.has(id)) return;

        const title = getTextContent(studyElement, '[data-testid="title"]');
        const researcherRaw = getTextContent(studyElement, '[data-testid="host"]');
        const researcher = researcherRaw?.split(" ").slice(1).join(" ") || null;
        const reward = getTextContent(studyElement, '[data-testid="study-tag-reward"]');
        const rewardPerHour = getTextContent(studyElement, '[data-testid="study-tag-reward-per-hour"]')?.replace("/hr", "") || null;
        const time = getTextContent(studyElement, '[data-testid="study-tag-completion-time"]');
        const timeInMinutes = parseTimeContent(time);

        newStudies.push({
            id,
            title,
            researcher,
            reward,
            rewardPerHour,
            time,
            timeInMinutes,
            limitedCapacity: false,
            createdAt: new Date().toISOString(),
        });
    });

    // Apply filters
    const filteredStudies = newStudies.filter(study => {
        if (reward > 0 && study.reward && getFloatValueFromMoney(study.reward) < reward) return false;
        if (time > 0 && study.timeInMinutes && study.timeInMinutes < time) return false;
        if (rewardPerHour > 0 && study.rewardPerHour && getFloatValueFromMoney(study.rewardPerHour) < rewardPerHour) return false;
        if (study.title && nameBlacklist.some(name => study.title!.toLowerCase().includes(name))) return false;
        return !(study.researcher && researcherBlacklist.some(res => study.researcher!.toLowerCase().includes(res)));

    });

    // Update saved studies
    if (shouldIgnoreOldStudies) {
        savedStudies = [...savedStudies, ...filteredStudies];
        if (savedStudies.length > numberOfStudiesToStore) {
            savedStudies = savedStudies.slice(-numberOfStudiesToStore);
        }
        await browser.storage.sync.set({ "currentStudies": savedStudies });
    }

    return filteredStudies;
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