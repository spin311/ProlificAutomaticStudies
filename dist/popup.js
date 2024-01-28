"use strict";
function playAlert() {
    chrome.storage.sync.get("audio", function (result) {
        console.log(result);
        if (chrome.runtime.lastError) {
            console.error(chrome.runtime.lastError);
        }
        else {
            let audio = new Audio('../audio/' + result.audio);
            audio.play();
        }
    });
}
chrome.runtime.onMessage.addListener(function (request) {
    if (request.action === "playAudio") {
        playAlert();
    }
    else {
        console.error("Unknown message received: " + request.action);
    }
});
document.addEventListener('DOMContentLoaded', function () {
    const autoAudio = document.getElementById("autoAudio");
    const selectAudio = document.getElementById("selectAudio");
    const counter = document.getElementById("counter");
    const playAudio = document.getElementById("playAudio");
    //check if user has already clicked the checkbox
    if (autoAudio) {
        setAudioCheckbox();
    }
    if (selectAudio) {
        setAudioOption();
    }
    if (counter) {
        setCounter();
    }
    if (playAudio) {
        playAudio.addEventListener("click", function () {
            playAlert();
        });
    }
    function setCounter() {
        chrome.storage.sync.get("counter", function (result) {
            const count = result.counter;
            if (count !== undefined) {
                counter.innerText = result.counter;
            }
        });
    }
    function setAudioOption() {
        chrome.storage.sync.get("audio", function (result) {
            selectAudio.value = result.audio;
        });
        selectAudio.addEventListener("change", function () {
            chrome.storage.sync.set({ "audio": selectAudio.value });
        });
    }
    function setAudioCheckbox() {
        chrome.storage.sync.get("audioActive", function (result) {
            autoAudio.checked = result.audioActive;
        });
        //listen for checkbox click
        autoAudio.addEventListener("click", function () {
            chrome.storage.sync.set({ "audioActive": autoAudio.checked });
        });
    }
});
