// Listen for messages from the extension
chrome.runtime.onMessage.addListener(msg => {
    if ('play' in msg) playAudio(msg.play);
});

// Play sound with access to DOM APIs
function playAudio({ source, volume }) {
    const audio = new Audio(source);
    audio.volume = volume;
    audio.play();
}
chrome.runtime.onMessage.addListener(handleMessages);

async function handleMessages(message) {
    // Return early if this message isn't meant for the offscreen document.
    if (message.target !== 'offscreen-doc') {
        return;
    }

    // Dispatch the message to an appropriate handler.
    switch (message.type) {
        case 'play-sound':
            await playSound(message.data);
            break;
    }
}

async function playSound(data) {
    try {
        // Error if we received the wrong kind of data.
        if (typeof data !== 'object' || !('audio' in data) || !('volume' in data)) {
            throw new TypeError(
                `Value provided must be an 'object' with 'audio' and 'volume' properties, got '${typeof data}'.`
            );
        }
        // `document.execCommand('copy')` works against the user's selection in a web
        // page. As such, we must insert the string we want to copy to the web page
        // and to select that content in the page before calling `execCommand()`.
        let audio = new Audio('/audio/' + data.audio);
        audio.volume = data.volume;
        audio.play();
    } catch (error) {
        console.error(error);
    }
}
