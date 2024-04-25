"use strict";
document.addEventListener('click', function () {
    var audioHTML = new Audio(chrome.runtime.getURL('audio/alert1.mp3'));
    audioHTML.play();
});
console.log('playAlert.js');
