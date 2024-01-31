"use strict";
chrome.storage.sync.get("audio", function (result) {
    if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
    }
    else {
        let audio = new Audio(chrome.runtime.getURL('audio/' + result.audio));
        audio.play();
    }
});
