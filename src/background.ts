chrome.runtime.onInstalled.addListener(async (details: { reason: string; }): Promise<void> => {
    if(details.reason === "install"){
        await chrome.storage.sync.set({ "audioActive": true });
        await chrome.storage.sync.set({ "audio": "alert1.mp3" });
        await new Promise(resolve => setTimeout(resolve, 1000));
        await chrome.tabs.create({url: "https://spin311.github.io/ProlificStudiesGoogle/", active: true});
    }
});
//if title of tab changes, check if it is a prolific study
chrome.tabs.onUpdated.addListener(function (tabId:number, changeInfo:chrome.tabs.TabChangeInfo, tab:chrome.tabs.Tab):void {
    if(tab.title && tab.title.toLowerCase().includes('prolific')) {
        if (changeInfo.title && changeInfo.title !== 'Prolific') {
            //send a notification
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'images/icon.png',
                title: 'Prolific Studies',
                message: 'A new study has been posted on Prolific!'
            });
            //play a sound
            chrome.storage.sync.get("audioActive", function (result): void {
            if(result.audioActive) {
                playAudioMessage();
            }
            });
            //increment counter
            updateCounter();
        }
    }
});

function playAudioMessage(): void {
    chrome.runtime.sendMessage({action: "playAudio"});
}

async function updateCounter(): Promise<void> {
    chrome.storage.sync.get("counter", function (result): void {
        let counter = result.counter;
        if (counter === undefined) {
            counter = 1;
        }
        else {
            counter++;
        }
        chrome.storage.sync.set({ "counter": counter }, function (): void {
            if(chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError);
            }
            else {
                chrome.browserAction.setBadgeText({text: counter.toString()});
            }
        });
    });
}


