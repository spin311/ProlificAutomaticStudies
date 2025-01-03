import Reason = chrome.offscreen.Reason;
import ContextType = chrome.runtime.ContextType;

type Study = {
    id: string | null;
    title: string | null;
    researcher: string | null;
    places: number | null;
    reward: string | null;
    rewardPerHour: string | null;
    time: string | null;
    limitedCapacity: boolean | null;
};

const AUDIO_ACTIVE = "audioActive";
const SHOW_NOTIFICATION = "showNotification";
const OPEN_PROLIFIC = "openProlific";
const AUDIO = "audio";
const VOLUME = "volume";
const COUNTER = "counter";
const ICON_URL = "imgs/logo.png";
const TITLE = "Prolific Automatic Studies";
const MESSAGE = "A new study has been posted on Prolific!";
let creating: Promise<void> | null = null; // A global promise to avoid concurrency issues

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
    if (reason === "install") {
        await setInitialValues();
        await chrome.tabs.create({
            url: "https://spin311.github.io/ProlificAutomaticStudies/",
            active: true,
        });
    }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (
        tab.url?.includes("https://app.prolific.com") &&
        changeInfo.status === "complete"
    ) {
        try {
            await initializeProlificObserver(tabId);
        } catch (error) {
            console.error("Error initializing observer:", error);
        }
    }
});

async function initializeProlificObserver(tabId: number): Promise<void> {
    await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
            return new Promise<void>((resolve) => {
                if (document.readyState === "complete") {
                    resolve();
                } else {
                    document.addEventListener(
                        "DOMContentLoaded",
                        () => resolve(),
                        { once: true }
                    );
                }
            });
        },
    });

    await chrome.scripting.executeScript({
        target: { tabId },
        func: observeProlificList,
    });
}

function observeProlificList(): void {
    const targetSelector = 'ul[class="list"]';

    function waitForTarget(): Promise<Element | null> {
        return new Promise((resolve) => {
            let retries = 10;

            function checkTarget() {
                const target = document.querySelector(targetSelector);
                if (target || retries <= 0) {
                    resolve(target || null);
                } else {
                    retries--;
                    setTimeout(checkTarget, 500);
                }
            }

            checkTarget();
        });
    }

    waitForTarget().then((targetNode) => {
        if (!targetNode) {
            console.error("Prolific list element not found.");
            return;
        }

        const observer = new MutationObserver(() => {
            const newStudies = extractStudies(targetNode);
            newStudies.forEach((study) => {
                console.log("New study detected:", study);
            });
        });

        observer.observe(targetNode, { childList: true, subtree: true });
    });

    function extractStudies(targetNode: Element): Study[] {
        const studies: Study[] = [];
        const studyElements = targetNode.querySelectorAll("li[class='list-item']");

        studyElements.forEach((study) => {
            const id = study.getAttribute("data-testid")?.split("-")[1];
            const title = study.querySelector('[data-testid="title"]')?.textContent || null;
            const researcher = study
                .querySelector('[data-testid="host"]')
                ?.textContent?.split(" ")
                .slice(1)
                .join(" ") || null;
            const places = parseInt(
                study
                    .querySelector('[data-testid="study-tag-places"]')
                    ?.textContent?.split(" ")[0] || "0"
            );
            const reward =
                study
                    .querySelector('[data-testid="study-tag-reward"]')
                    ?.textContent || null;
            const rewardPerHour =
                study
                    .querySelector('[data-testid="study-tag-reward-per-hour"]')
                    ?.textContent?.replace("/hr", "") || null;
            const time =
                study.querySelector('[data-testid="study-tag-completion-time"]')
                    ?.textContent || null;
            if (id) {
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
            }
        });

        return studies;
    }

    function parseTime(timeText: string | null): number | null {
        if (!timeText) return null;

        const timeParts = timeText.match(/(\d+)\s*h\s*(\d+)?\s*mins?/);
        if (timeParts) {
            const hours = parseInt(timeParts[1]) || 0;
            const minutes = parseInt(timeParts[2]) || 0;
            return hours * 60 + minutes;
        }

        const minutesOnly = timeText.match(/(\d+)\s*mins?/);
        return minutesOnly ? parseInt(minutesOnly[1]) : null;
    }
}

function notifyNewStudy(study: Study): void {
    chrome.notifications.create({
        type: "basic",
        iconUrl: chrome.runtime.getURL(ICON_URL),
        title: TITLE,
        message: `${study.title} by ${study.researcher}`,
        buttons: [{ title: "Open Prolific" }, { title: "Dismiss" }],
    });

    chrome.notifications.onClicked.addListener(() => {
        chrome.tabs.create({ url: "https://app.prolific.com/", active: true });
    });
}

async function setInitialValues(): Promise<void> {
    await chrome.storage.sync.set({
        [AUDIO_ACTIVE]: true,
        [AUDIO]: "alert1.mp3",
        [SHOW_NOTIFICATION]: true,
        [VOLUME]: 100,
    });
}


