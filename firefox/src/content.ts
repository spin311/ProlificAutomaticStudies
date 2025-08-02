type StudyContent = {
    id: string | null;
    title: string | null;
    researcher: string | null;
    reward: string | null;
    rewardPerHour: string | null;
    time: string | null;
    timeInMinutes: number | null;
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
    const localValues = await browser.storage.local.get(["currentStudies"]);

    const shouldIgnoreOldStudies = storageValues["trackIds"] ?? true;
    const numberOfStudiesToStore = storageValues["studyHistoryLen"] ?? NUMBER_OF_STUDIES_TO_STORE;
    const reward = storageValues[REWARD] ?? 0;
    const rewardPerHour = storageValues[REWARD_PER_HOUR] ?? 0;
    const time = storageValues[TIME] ?? 0;
    const nameBlacklist = (storageValues[NAME_BLACKLIST] || []).map((s: string) => s.toLowerCase());
    const researcherBlacklist = (storageValues[RESEARCHER_BLACKLIST] || []).map((s: string) => s.toLowerCase());

    let savedStudies: StudyContent[] = localValues["currentStudies"] || [];
    const existingIds = new Set(savedStudies.map(study => study.id));
    const newStudies: StudyContent[] = [];

    studyElements.forEach(el => {
        const id = el.getAttribute("data-testid")?.split("-")[1] || null;
        if (!id || existingIds.has(id)) return;

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
