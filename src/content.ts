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
const targetSelector = 'section[class="available-studies-section"]';

const NUMBER_OF_IDS_TO_STORE = 50;

function waitForTarget(): Promise<Element | null> {
    return new Promise((resolve) => {
        let retries = 20;

        function checkTarget() {
            let timer = 500;
            const target = document.querySelector(targetSelector);
            if (target || retries <= 0) {
                console.log("Prolific list element found." + target);
                resolve(target || null);
            } else {
                console.log("Prolific list element not found. Retries left: " + retries);
                retries--;
                timer += 100;
                setTimeout(checkTarget, timer);
            }
        }
        checkTarget();
    });
}

waitForTarget().then(async (targetNode) => {
    if (!targetNode) {
        console.error("Prolific list element not found.");
        return;
    }
    const observer = new MutationObserver(async (mutationsList) => {
        for (const mutations of mutationsList) {
            if (mutations.type === "childList") {
                const newStudies = await extractStudies(targetNode);
                if (newStudies.length > 0) {
                    try {
                        chrome.runtime.sendMessage({
                            target: "background",
                            type: "new-studies",
                            data: newStudies,
                        });
                    } catch (error) {
                        console.error("Error sending message to background:", error);
                    }
                    newStudies.forEach((study) => {
                        console.log("New study detected:", study);
                    });
                }
            }
        }
    });
    const newStudies = await extractStudies(targetNode);
    if (newStudies.length > 0) {
        try {
            chrome.runtime.sendMessage({
                target: "background",
                type: "new-studies",
                data: newStudies,
            });
        } catch (error) {
            console.error("Error sending message to background:", error);
        }
        newStudies.forEach((study) => {
            console.log("New study detected:", study);
        });
    }
    observer.observe(targetNode, {childList: true, subtree: true});
});

async function extractStudies(targetNode: Element): Promise<StudyContent[]> {
    const studies: StudyContent[] = [];
    const studyElements = targetNode.querySelectorAll("li[class='list-item']");
    if (!studyElements || studyElements.length === 0) {
        return studies;
    }
    console.log("Extracting studies" + studyElements);
    try {
        const studyIds: string[] = await getValueFromStorageContentScript<string[]>("studyIds", []);
        let studyIdsNew: string[]  = studyIds;
        studyElements.forEach((study) => {
            const id = study.getAttribute("data-testid")?.split("-")[1];
            if (!id || (studyIds && studyIds.includes(id))) return;
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
            studyIdsNew.push(id);
        });
        if (studyIdsNew.length > NUMBER_OF_IDS_TO_STORE) {
            studyIdsNew = studyIdsNew.slice(-NUMBER_OF_IDS_TO_STORE);
        }
        await chrome.storage.sync.set({["studyIds"]: studyIdsNew});
    } catch (e) {
        console.error("Error extracting studies: " + e);
    }
    return studies;
}

function getValueFromStorageContentScript<T>(key: string, defaultValue: T): Promise<T> {
    return new Promise((resolve): void => {
        chrome.storage.sync.get(key, function (result): void {
            resolve((result[key] !== undefined) ? result[key] as T : defaultValue);
        });
    });
}
