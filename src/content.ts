type  StudyContent = {
    id: string | null;
    title: string | null;
    researcher: string | null;
    places: number | null;
    reward: string | null;
    rewardPerHour: string | null;
    time: string | null;
    limitedCapacity: boolean | null;
};
const targetSelector = 'div[data-testid="studies-list"]';
let globalObserver: MutationObserver | null = null;
let isProcessing: boolean = false;  // A global promise to avoid concurrency issues
let isObserverInitializing: boolean = false;
const NUMBER_OF_STUDIES_TO_STORE = 50;


async function waitForElement(selector: string): Promise<Element | null> {
    const useOld = await getValueFromStorageContentScript("useOld", false);
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
        const target = document.querySelector(selector);
        if (target) {
            observer.disconnect();
            resolve(target);
        }
    });
}

function handleContentMessages(message: { target: string; type: any; data?: any; }): Promise<void> {
    console.log(message);

    if (message.target !== "content"  && message.target !== 'everything') {
        return Promise.resolve();
    }
    switch (message.type) {
        case "change-alert-type":
            if (message.data === "website") {
                console.log("Changing to website observer");
                observeStudyChanges();
            } else {
                console.log("Disconnecting observer");
                globalObserver?.disconnect();
                globalObserver = null;
            }
            return Promise.resolve();
        default:
            return Promise.resolve();
    }

}

function isObserverActive(): boolean {
    return globalObserver !== null;
}

chrome.runtime.onMessage.addListener(handleContentMessages);
observeStudyChanges();
function observeStudyChanges(): void {
    if (isObserverActive() || isObserverInitializing) return;
    isObserverInitializing = true;
    waitForElement(targetSelector).then(async (targetNode) => {
        isObserverInitializing = false;
        if (!targetNode || isObserverActive()) {
            console.log("targetNode not found or observer already exists");
            return;
        }

        console.log("observer created");
        // Observe for dynamic content updates within the target element
        globalObserver = new MutationObserver(async (mutationsList) => {
            if (isProcessing) return;
            for (const mutation of mutationsList) {
                if (
                    mutation.addedNodes.length ||
                    mutation.removedNodes.length
                ) {
                    await extractAndSendStudies(targetNode);
                    console.log("extracting mutation studies")
                    break;
                }
            }
        });

        // Initial check if studies are already loaded
        await extractAndSendStudies(targetNode);
        console.log("extracting initial studies")
        globalObserver.observe(targetNode, { childList: true, subtree: true });
    });
}



async function extractAndSendStudies(targetNode: Element): Promise<void> {
    try {
        if (isProcessing) return;
        isProcessing = true;
        console.log(`Extracting studies at time ${new Date().toLocaleTimeString()}`);
        const studies = await extractStudies(targetNode);
        if (studies.length > 0) {
            console.log(`Extracting studies from ${studies.length} studies`);
            console.log(studies);
            chrome.runtime.sendMessage({
                target: "background",
                type: "new-studies",
                data: studies,
            });
        }
        else {
            console.log("No new studies found");
        }
        isProcessing = false;
    }
    catch (e) {
        console.error(e);
        isProcessing = false;
    } finally {
        isProcessing = false;
    }

}

async function extractStudies(targetNode: Element): Promise<StudyContent[]> {
    const studyElements = targetNode.querySelectorAll("li[class='list-item']");
    const shouldIgnoreOldStudies = await getValueFromStorageContentScript<boolean>("trackIds", true);
    if (!studyElements || studyElements.length === 0) {
        if (!shouldIgnoreOldStudies) {
            await chrome.storage.sync.set({["currentStudies"]: []});
        }
        return [];
    }
    const studies: StudyContent[] = [];
    const numberOfStudiesToStore = await getValueFromStorageContentScript<number>("studyHistoryLen", NUMBER_OF_STUDIES_TO_STORE);
    let savedStudies: StudyContent[] = await getValueFromStorageContentScript<StudyContent[]>("currentStudies", []);
    const studyIds = savedStudies.map((study) => study.id);
        studyElements.forEach((study) => {
            const id = study.getAttribute("data-testid")?.split("-")[1];
            if (!id ||  studyIds?.includes(id)) return;
            const title = getTextContent(study, '[data-testid="title"]');
            const researcher = getTextContent(study, '[data-testid="host"]')?.split(" ")
                .slice(1)
                .join(" ") || null;
            const places = parseInt(
                getTextContent(study, '[data-testid="study-tag-places"]')?.split(" ")[0] || "0");
            const reward = getTextContent(study, '[data-testid="study-tag-reward"]');
            const rewardPerHour = getTextContent(study, '[data-testid="study-tag-reward-per-hour"]')?.replace("/hr", "") || null;
            const time =getTextContent(study, '[data-testid="study-tag-completion-time"]');
            studies.push({
                id,
                title,
                researcher,
                places,
                reward,
                rewardPerHour,
                time,
                limitedCapacity: false,
            });
        });
    if (shouldIgnoreOldStudies) {
        savedStudies = [...savedStudies, ...studies];
    }
    if (savedStudies.length > numberOfStudiesToStore) {
        savedStudies = savedStudies.slice(-numberOfStudiesToStore);
    }
    await chrome.storage.sync.set({"currentStudies": savedStudies});

    return studies;
}

function getValueFromStorageContentScript<T>(key: string, defaultValue: T): Promise<T> {
    return new Promise((resolve): void => {
        chrome.storage.sync.get(key, function (result): void {
            resolve((result[key] !== undefined) ? result[key] as T : defaultValue);
        });
    });
}

function getTextContent(element: Element | null, selector: string): string | null {
    return element?.querySelector(selector)?.textContent || null;
}
