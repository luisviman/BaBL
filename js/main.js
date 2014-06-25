'use strict';

////////////////////////////////////////////////////////////////////////////////
//SETTINGS:

// Media settings:
var AUDIO_CONSTRAINT = true; // true -> Activates audio

// Instant translation settings:
var ENABLE_DRAFT_TRANSLATION = true; // false -> Add delay but save characters

// STUN/TURN servers:
var PC_CONFIG_CHROME = {'iceServers': [
        {'url': 'stun:stun.l.google.com:19302'},
        {'url': 'turn:toto@adana4.rice.iit.edu:3479', 'credential': 'password'}]};
var PC_CONFIG_FIREFOX = {'iceServers': [
        {'url': 'stun:stun.services.mozilla.com'},
        {'url': 'turn:toto@adana4.rice.iit.edu:3479', 'credential': 'password'}]};
var PC_CONFIG_OTHER = {'iceServers': [
        {'url': 'stun:adana4.rice.iit.edu:3479'},
        {'url': 'turn:toto@adana4.rice.iit.edu:3479', 'credential': 'password'}]};

// Datachannel settings:
var DATACHANNEL_CONFIG = {
    ordered: true // Ordered and reliable by default in most browsers
};


////////////////////////////////////////////////////////////////////////////////
// SOCKET CONNECTION:

// VARIABLES:
var username;
var room;
var socket;
var pc = {}; // Peer connections container

// EXECUTION:
// Makes sure that the username has been defined
checkUsername();

// Recovers username and room
username = location.pathname.split('&username=')[1];
room = location.pathname.split('&username=')[0].split('/room=')[1];

// Socket connection
socket = io.connect();

// Request to join socket room
console.log('>> BaBL: Request to join room', room, 'sent');
socket.emit('request to join', username, room);

// SOCKET EVENTS:
// Room created: Proceed to get user media
socket.on('room created', function(room) {
    console.log('>> BaBL: Room', room, 'created');
    recognition.start(); // Speech recognition initialization
    startGetUserMedia();
});

// Room joined: Get userlist and proceed to get user media
socket.on('room joined', function(room, userlist) {
    console.log('>> BaBL: This user has joined room', room);
    for (var i = 0; i < userlist.length; i++) {
        pc[userlist[i]] = 'no init'; // The 'no init' value helps in case the pc needs to be updated
    }
    recognition.start(); // Speech recognition initialization
    startGetUserMedia();
});

// A new client joined the room: create peer connection
socket.on('new user joined', function(user, room) {
    console.log('>> BaBL: User', user, 'joined room', room);
    createPeerConnection(user);
});

// Username in use: Avoids duplicated usernames in a room
socket.on('username in use', function(username, room) {
    alert('Username ' + username + ' already in use in room ' + room);
    window.location = '/room=' + room;
});

// Received message from other user
socket.on('message', function(message, fromUser) {
    console.log('>> BaBL: Received', message.type, 'from user', fromUser + ':', message);
    if (message.type === 'offer') {
        pc[fromUser].setRemoteDescription(new RTCSessionDescription(message));
        answerCall(fromUser);
    } else if (message.type === 'answer') {
        pc[fromUser].setRemoteDescription(new RTCSessionDescription(message));
    } else if (message.type === 'candidate') {
        var candidate = new RTCIceCandidate({sdpMLineIndex: message.label,
            candidate: message.candidate});
        pc[fromUser].addIceCandidate(candidate);
    }
});

// Handles remote users disconnections
socket.on('user disconnected', function(user) {
    console.log('>> BaBL: User', user, 'disconnected');
    var remoteArea = document.getElementById('remoteArea');
    var remoteUserArea = document.getElementById('remoteUserAreaFor' + user);
    remoteArea.removeChild(remoteUserArea);
    pc[user].close();
    delete pc[user];
    delete dataChannels[user];
    manageRemoteAreasClassNames();
});

// Handles requests concerning subtitles turning on or off the speech recognition
socket.on('subtitles request', function(message, fromUser, language) {
    console.log('>> BaBL: Recieved request to', message, 'subtitles from user', fromUser);
    // If it is a request to start, the speech recognition will be started if needed
    if (message === 'start') {
        dataChannels[fromUser].isRemoteUserRequestingSubtitles = true;
        dataChannels[fromUser].remoteUserLanguage = language;
        if (isSpeechRecognitionEnabled === false) {
            recognition.start();
        }
        // If it is a request to stop and nobody needs subtitles anymore the speech
        // recognition will be turned off
    } else if (message === 'stop') {
        dataChannels[fromUser].isRemoteUserRequestingSubtitles = false;
        dataChannels[fromUser].remoteUserLanguage = '';
        // Counts how many users are requesting subtitles
        var speechRecognitionRequests = 0;
        for (var user in dataChannels) {
            if (dataChannels[user].isRemoteUserRequestingSubtitles) {
                speechRecognitionRequests += 1;
            }
        }
        // And stops the speech recogniton if nobody is requesting subtitles
        if (speechRecognitionRequests === 0) {
            recognition.stop();
        }
    }
});

socket.on('translation', function(translatedText, fromUser, isFinal) {
    var remoteUserSubtitles = document.getElementById('remoteUserSubtitlesFor' + fromUser);
    remoteUserSubtitles.innerText = translatedText;

    // Spoken subtitles logic
    if (isSpeechSynthesisEnabled && isFinal) {
        speak(translatedText);
    }

    // Transcription storage logic
    if (isTranscriptionStorageEnabled === true) {
        saveTranscription(translatedText, fromUser);
    }
});

// Log received: Handles logs sent by the server
socket.on('log', function(array) {
    console.log.apply(console, array);
});

// FUNCTIONS:
// Function that makes sure that the username has been defined
function checkUsername() {
    if (location.pathname.indexOf('&username=') < 0) {
        username = prompt('Enter username:');
        var roomURL;
        if (username === null) {
            roomURL = '/';
        } else {
            roomURL = location.pathname + '&username=' + username;
        }
        window.location = roomURL;
    }
    if (location.pathname.split('&username=')[1] === '') {
        username = prompt('Enter username:');
        var roomURL;
        if (username === null) {
            roomURL = '/';
        } else {
            roomURL = location.pathname + username;
        }
        window.location = roomURL;
    }
}

// Function for sending a message to the rest of users in the room
function sendMessageToRoom(message) {
    console.log('>> BaBL: Sending', message.type, 'to room:', message);
    socket.emit('message to room', message);
}

// Function for sending a message to other user in the room
function sendMessageToUser(message, toUser) {
    console.log('>> BaBL: Sending', message.type, 'to user', toUser + ':', message);
    socket.emit('message to user', message, toUser);
}


////////////////////////////////////////////////////////////////////////////////
// GET USER MEDIA:

// VARIABLES:
var constraints = {video: true, audio: AUDIO_CONSTRAINT};
var localVideo = document.getElementById('localVideo');
var localStream;

// EXECUTION:
function startGetUserMedia() {
    var localUserTitle = document.getElementById('localUserTitle');
    localUserTitle.innerHTML += username;
    navigator.getUserMedia(constraints, onGetUserMediaSuccess, onGetUserMediaError);
    console.log('>> BaBL: Getting user media with constraints', constraints);
}

// getUserMedia succesfull callback
function onGetUserMediaSuccess(stream) {
    localStream = stream;
    attachMediaStream(localVideo, stream);
    console.log('>> BaBL: Local stream ready');
    // Create peer connections, data channels and call already joined users
    for (var user in pc) {
        if (pc[user] === 'no init') {
            createPeerConnection(user);
            createDataChannel(user);
        }
        call(user);
    }
}

// getUserMedia error handling
function onGetUserMediaError(error) {
    console.error('>> BaBL: navigator.getUserMedia error:', error);
    alert('An error occurred when accessing media');
}


////////////////////////////////////////////////////////////////////////////////
// PEER CONNECTION:

// VARIABLES:
var remoteStream; // Can be used for managing the stream
var pc_config;
var pc_constraints = {
    'optional': [
        {'DtlsSrtpKeyAgreement': true}
    ]};

// EXECUTION:
// Ice servers selection dpending on the browser used
if (webrtcDetectedBrowser === 'chrome') {
    pc_config = PC_CONFIG_CHROME;
} else if (webrtcDetectedBrowser === 'firefox') {
    pc_config = PC_CONFIG_FIREFOX;
} else {
    pc_config = PC_CONFIG_OTHER;
}

// Create peer connections inside the pc element
function createPeerConnection(user) {
    try {
        pc[user] = new RTCPeerConnection(pc_config, pc_constraints);
        console.log('>> BaBL: Created RTCPeerConnnection for user', user,
                'with:\n', '  config:', JSON.stringify(pc_config),
                '\n   constraints:', JSON.stringify(pc_constraints));
    } catch (e) {
        console.error('>> BaBL: Failed to create PeerConnection for user',
                user, ', exception:', e.message);
        alert('Cannot create RTCPeerConnection object');
        window.location = '/error.html';
    }

    // Events definition
    pc[user].onaddstream = handleRemoteStreamAdded;
    pc[user].onremovestream = handleRemoteStreamRemoved;
    pc[user].onicecandidate = handleICECandidate;
    pc[user].ondatachannel = handleDataChannel;

    /*An error may occur at this point due to race conditions (although never happended before)*/
    pc[user].addStream(localStream);

    // HANDLERS:
    // Handles added remote streams
    function handleRemoteStreamAdded(event) {

        // Creates the DOM elements needed for a remote user and attaches the media
        var remoteArea = document.getElementById('remoteArea');

        var remoteUserArea = document.createElement('div');
        remoteUserArea.className = 'remoteUserArea uk-panel uk-panel-box uk-panel-box-primary';
        remoteUserArea.id = 'remoteUserAreaFor' + user;
        remoteArea.appendChild(remoteUserArea);

        var remoteUserTitle = document.createElement('div');
        remoteUserTitle.className = 'remoteUserTitle';
        remoteUserTitle.innerHTML = user;
        remoteUserArea.appendChild(remoteUserTitle);

        var remoteUserOverlay = document.createElement('div');
        remoteUserOverlay.className = 'uk-overlay';
        remoteUserArea.appendChild(remoteUserOverlay);

        var remoteUserVideo = document.createElement('video');
        remoteUserVideo.className = 'remoteUserVideo';
        remoteUserVideo.id = 'remoteUserVideoFor' + user;
        remoteUserVideo.autoplay = 'autoplay';
        remoteUserOverlay.appendChild(remoteUserVideo);
        attachMediaStream(remoteUserVideo, event.stream);
        console.log('>> BaBL: Remote stream added');
        remoteStream = event.stream;

        var remoteUserOverlayArea = document.createElement('div');
        remoteUserOverlayArea.className = 'uk-overlay-area';
        remoteUserOverlay.appendChild(remoteUserOverlayArea);

        var remoteUserOverlayAreaContent = document.createElement('div');
        remoteUserOverlayAreaContent.className = 'uk-overlay-area-content';
        remoteUserOverlayAreaContent.innerHTML = '<p>Subtitles settings:</p>';
        remoteUserOverlayArea.appendChild(remoteUserOverlayAreaContent);

        var subtitlesButtons = document.createElement('div');
        subtitlesButtons.className = 'uk-button-group';
        subtitlesButtons.setAttribute('data-uk-button-radio', '');
        remoteUserOverlayAreaContent.appendChild(subtitlesButtons);

        var subtitlesButtonNone = document.createElement('button');
        subtitlesButtonNone.innerHTML = 'Off'; /* None or Off */
        subtitlesButtonNone.className = 'uk-button uk-button-primary uk-active';
        subtitlesButtonNone.id = 'subtitlesButtonNoneFor' + user;
        subtitlesButtonNone.setAttribute('data-uk-tooltip', "{pos:'bottom'}");
        subtitlesButtonNone.title = 'No subtitles displayed';
        subtitlesButtons.appendChild(subtitlesButtonNone);

        var subtitlesButtonOriginal = document.createElement('button');
        subtitlesButtonOriginal.innerHTML = 'Original'; /* On, CC or Original*/
        subtitlesButtonOriginal.className = 'uk-button uk-button-primary';
        subtitlesButtonOriginal.id = 'subtitlesButtonOriginalFor' + user;
        subtitlesButtonOriginal.setAttribute('data-uk-tooltip', "{pos:'bottom'}");
        subtitlesButtonOriginal.title = "Subtitles are displayed in " + user + "'s language";
        subtitlesButtons.appendChild(subtitlesButtonOriginal);

        var subtitlesButtonTranslated = document.createElement('button');
        subtitlesButtonTranslated.innerHTML = 'Translated'; /*Translate or Translated*/
        subtitlesButtonTranslated.className = 'uk-button uk-button-primary';
        subtitlesButtonTranslated.id = 'subtitlesButtonTranslatedFor' + user;
        subtitlesButtonTranslated.setAttribute('data-uk-tooltip', "{pos:'bottom'}");
        subtitlesButtonTranslated.title = 'Subtitles are translated to your language';
        subtitlesButtons.appendChild(subtitlesButtonTranslated);

        var subtitlesButtonSpoken = document.createElement('button');
        subtitlesButtonSpoken.innerHTML = 'Spoken';
        subtitlesButtonSpoken.className = 'uk-button uk-button-primary';
        subtitlesButtonSpoken.id = 'subtitlesButtonSpokenFor' + user;
        subtitlesButtonSpoken.setAttribute('data-uk-tooltip', "{pos:'bottom'}");
        subtitlesButtonSpoken.title = 'You can hear ' + user + ' in your own language';
        subtitlesButtons.appendChild(subtitlesButtonSpoken);

        var remoteUserSubtitles = document.createElement('div');
        remoteUserSubtitles.className = 'remoteUserSubtitles uk-overlay-caption';
        remoteUserSubtitles.id = 'remoteUserSubtitlesFor' + user;
        remoteUserSubtitles.style.visibility = 'hidden';
        remoteUserOverlay.appendChild(remoteUserSubtitles);

        // Click handlers for the subtitles settings
        subtitlesButtonNone.onclick = function() {
            if (subtitlesButtonNone.classList.item(2) !== 'uk-active') {
                requestSubtitlesToStop(user);
                isSpeechSynthesisEnabled = false;
            }
        };
        subtitlesButtonOriginal.onclick = function() {
            if (subtitlesButtonOriginal.classList.item(2) !== 'uk-active') {
                requestSubtitlesToStart(user, '', 'visible');
                isSpeechSynthesisEnabled = false;
            }
        };
        subtitlesButtonTranslated.onclick = function() {
            if (subtitlesButtonTranslated.classList.item(2) !== 'uk-active') {
                requestSubtitlesToStart(user, recognition.lang, 'visible');
                isSpeechSynthesisEnabled = false;
            }
        };
        subtitlesButtonSpoken.onclick = function() {
            if (subtitlesButtonSpoken.classList.item(2) !== 'uk-active') {
                requestSubtitlesToStart(user, recognition.lang, 'visible');
                isSpeechSynthesisEnabled = true;
            }
        };

        // Manages the classnames that will adapt the size of the remote user area
        manageRemoteAreasClassNames();
    }

    // Handles removed remote streams removing the associated DOM elements
    function handleRemoteStreamRemoved(event) {
        var remoteArea = document.getElementById('remoteArea');
        var remoteUserArea = document.getElementById('remoteUserAreaFor' + user);
        remoteArea.removeChild(remoteUserArea);
        console.log('>> BaBL: Remote stream removed. Event:', event);
    }

    // Sends ICE candidates
    function handleICECandidate(event) {
        if (event.candidate) {
            sendMessageToUser({
                type: 'candidate',
                label: event.candidate.sdpMLineIndex,
                id: event.candidate.sdpMid,
                candidate: event.candidate.candidate},
            user);
        } else {
            console.log('>> BaBL: All candidates sent to user', user);
        }
    }

    // Handles data channel
    function handleDataChannel(event) {
        dataChannels[user] = event.channel;
        setDataChannelEvents(user);
        dataChannels[user].isRemoteUserRequestingSubtitles = false;
        dataChannels[user].remoteLanguage = '';
        dataChannels[user].isLocalUserRequestingSubtitles = false;
        dataChannels[user].isLocalUserRequestingTranslatedSubtitles = false;
    }
}

// FUNCTIONS:
// Adapts the width of the remotes areas to the number of users
function manageRemoteAreasClassNames() {
    var remoteUserAreas = document.getElementsByClassName('remoteUserArea');
    if (Object.keys(pc).length === 1) {
        for (var i = 0; i < remoteUserAreas.length; i++) {
            remoteUserAreas[i].classList.add('remoteUserArea1');
            remoteUserAreas[i].classList.remove('remoteUserArea2');
            remoteUserAreas[i].classList.remove('remoteUserArea3');
        }
    } else if (Object.keys(pc).length === 2) {
        for (var i = 0; i < remoteUserAreas.length; i++) {
            remoteUserAreas[i].classList.add('remoteUserArea2');
            remoteUserAreas[i].classList.remove('remoteUserArea1');
            remoteUserAreas[i].classList.remove('remoteUserArea3');
        }
    } else {
        for (var i = 0; i < remoteUserAreas.length; i++) {
            remoteUserAreas[i].classList.add('remoteUserArea3');
            remoteUserAreas[i].classList.remove('remoteUserArea1');
            remoteUserAreas[i].classList.remove('remoteUserArea2');
        }
        var roomBody = document.getElementById('roomBody');
        var roomFooter = document.getElementById('roomFooter');
        if(Object.keys(pc).length > 4){
            roomBody.classList.add('roomBodyLong');
            roomFooter.classList.add('roomFooterLong');
        } else {
            roomBody.classList.remove('roomBodyLong');
            roomFooter.classList.remove('roomFooterLong');
        }
    }
}


////////////////////////////////////////////////////////////////////////////////
// DATA CHANNEL:
// Also look pc[user].ondatachannel

// VARIABLES:
var dataChannels = {};

// EXECUTION:
// Creates a data channel for an specific user
function createDataChannel(user) {
    try {
        dataChannels[user] = pc[user].createDataChannel('dataChannelFor' + user, DATACHANNEL_CONFIG);
        setDataChannelEvents(user);
        dataChannels[user].isRemoteUserRequestingSubtitles = false;
        dataChannels[user].remoteLanguage = '';
        dataChannels[user].isLocalUserRequestingSubtitles = false;
        dataChannels[user].isLocalUserRequestingTranslatedSubtitles = false;
    } catch (e) {
        alert('Failed to create data channel');
        window.location = '/error.html';
    }
}

// Sets the data channel events
function setDataChannelEvents(user) {
    dataChannels[user].onopen = function() {
        console.log('>> BaBL: Data channel established with user', user);
    };
    dataChannels[user].onclose = function() {
        console.log('>> BaBL: Data channel with user', user, 'closed');
    };
    dataChannels[user].onerror = function(error) {
        console.error('>> BaBL:', user, 'data channel error:', error);
    };

    // Only subtitles are being sent through the data channel
    dataChannels[user].onmessage = function(event) {
        var subtitle = JSON.parse(event.data);
        var remoteUserSubtitles = document.getElementById('remoteUserSubtitlesFor' + user);
        remoteUserSubtitles.innerText = subtitle.text;
        // Save the transcription if needed
        if (subtitle.isFinal && isTranscriptionStorageEnabled) {
            saveTranscription(subtitle.text, user);
        }
    };
}


////////////////////////////////////////////////////////////////////////////////
// SUBTITLES:
// Received subtitles are handled in the dataChannels[user].onmessage event

// FUNCTIONS:
// Function for sending subtitles to the users that are requesting them
function sendSubtitle(subtitle) {
    for (var user in dataChannels) {
        if (dataChannels[user].isRemoteUserRequestingSubtitles === true) {
            // If no translation is needed the interim subtitles go through the data channel
            if (dataChannels[user].remoteUserLanguage === '' || dataChannels[user].remoteUserLanguage === recognition.lang) {
                // Sends the subtitle along with its isFinal property
                dataChannels[user].send(JSON.stringify(subtitle));
                // If translation is needed the final subtitles go through the server
            } else if (subtitle.isFinal || ENABLE_DRAFT_TRANSLATION) {
                if (subtitle.text !== ' ') {
                    var fromLanguage = recognition.lang;
                    var toLanguage = dataChannels[user].remoteUserLanguage;
                    // Microsoft and Google have different language code for Chinese
                    if (fromLanguage === 'cmn') {
                        fromLanguage = 'zh-CHS';
                    }
                    if (toLanguage === 'cmn') {
                        toLanguage = 'zh-CHS';
                    }
                    /*ARREGLANDO ESTO*/
                    /*socket.emit('translation request', subtitle.text, fromLanguage, toLanguage, user);*/
                    socket.emit('translation request', subtitle, fromLanguage, toLanguage, user);
                }
            }
        }
    }
}

// Request another user to start broadcasting subtitles
// The signaling goes through the server
function requestSubtitlesToStart(user, language, visibility) {
    if(visibility === 'visible'){
        var remoteUserSubtitles = document.getElementById('remoteUserSubtitlesFor' + user);
        remoteUserSubtitles.style.visibility = visibility;
        dataChannels[user].isLocalUserRequestingSubtitles = true;
    }
    socket.emit('subtitles request', 'start', user, language);
    if (language === '') {
        console.log('>> BaBL: Requesting subtitles from user', user);
    } else {
        console.log('>> BaBL: Requesting translated subtitles from user', user);
        dataChannels[user].isLocalUserRequestingTranslatedSubtitles = true;
    }
}

// Request another user to stop broadcasting subtitles
// The signaling goes through the server
function requestSubtitlesToStop(user) {
    var remoteUserSubtitles = document.getElementById('remoteUserSubtitlesFor' + user);
    remoteUserSubtitles.style.visibility = 'hidden';
    dataChannels[user].isLocalUserRequestingSubtitles = false;
    dataChannels[user].isLocalUserRequestingTranslatedSubtitles = false;
    if (!isTranscriptionStorageEnabled) {
        socket.emit('subtitles request', 'stop', user);
        console.log('>> BaBL: Stopping subtitles from user', user);
    }
}


////////////////////////////////////////////////////////////////////////////////
// CALL:

// VARIABLES:
// Set up audio and video regardless of what devices are present.
var sdpConstraints = {'mandatory': {
        'OfferToReceiveAudio': true,
        'OfferToReceiveVideo': true}};

// EXECUTION:
// Call function: Executed one per each member already in the room
function call(user) {
    var constraints = {'optional': [], 'mandatory': {'MozDontOfferDataChannel': true}};

    // Temporary measure to remove Moz* constraints in Chrome
    if (webrtcDetectedBrowser === 'chrome') {
        for (var prop in constraints.mandatory) {
            if (prop.indexOf('Moz') !== -1) {
                delete constraints.mandatory[prop];
            }
        }
    }

    constraints = mergeConstraints(constraints, sdpConstraints);
    console.log('>> BaBL: Sending offer to user', user, 'with constraints:\n  ', JSON.stringify(constraints));
    pc[user].createOffer(createOfferSuccessCallback, null, constraints);

    function createOfferSuccessCallback(sessionDescription) {
        // Set Opus as the preferred codec in SDP if Opus is present.
        sessionDescription.sdp = preferOpus(sessionDescription.sdp);
        pc[user].setLocalDescription(sessionDescription);
        sendMessageToUser(sessionDescription, user);
    }
}

// Answer function
function answerCall(user) {
    console.log('>> BaBL: Sending answer to user', user, 'with constraints:\n  ',
            JSON.stringify(sdpConstraints));
    pc[user].createAnswer(createAnswerSuccessCallback, null, sdpConstraints);
    function createAnswerSuccessCallback(sessionDescription) {
        // Set Opus as the preferred codec in SDP if Opus is present.
        sessionDescription.sdp = preferOpus(sessionDescription.sdp);
        pc[user].setLocalDescription(sessionDescription);
        sendMessageToUser(sessionDescription, user);
    }
}

// FUNCTIONS:
// Function for merging constraints
function mergeConstraints(cons1, cons2) {
    var merged = cons1;
    for (var name in cons2.mandatory) {
        merged.mandatory[name] = cons2.mandatory[name];
    }
    merged.optional.concat(cons2.optional);
    return merged;
}

// SDP FUNCTIONS:
// Set Opus as the default audio codec if it's present
function preferOpus(sdp) {
    var sdpLines = sdp.split('\r\n');
    var mLineIndex;
    // Search for m line
    for (var i = 0; i < sdpLines.length; i++) {
        if (sdpLines[i].search('m=audio') !== -1) {
            mLineIndex = i;
            break;
        }
    }
    if (mLineIndex === null) {
        return sdp;
    }
    // If Opus is available, set it as the default in m line
    for (i = 0; i < sdpLines.length; i++) {
        if (sdpLines[i].search('opus/48000') !== -1) {
            var opusPayload = extractSdp(sdpLines[i], /:(\d+) opus\/48000/i);
            if (opusPayload) {
                sdpLines[mLineIndex] = setDefaultCodec(sdpLines[mLineIndex], opusPayload);
            }
            break;
        }
    }
    // Remove CN in m line and sdp
    sdpLines = removeCN(sdpLines, mLineIndex);
    sdp = sdpLines.join('\r\n');
    return sdp;
}

// Extract sdp
function extractSdp(sdpLine, pattern) {
    var result = sdpLine.match(pattern);
    return result && result.length === 2 ? result[1] : null;
}

// Set the selected codec to the first in m line.
function setDefaultCodec(mLine, payload) {
    var elements = mLine.split(' ');
    var newLine = [];
    var index = 0;
    for (var i = 0; i < elements.length; i++) {
        if (index === 3) { // Format of media starts from the fourth.
            newLine[index++] = payload; // Put target payload to the first.
        }
        if (elements[i] !== payload) {
            newLine[index++] = elements[i];
        }
    }
    return newLine.join(' ');
}

// Strip CN from sdp before CN constraints is ready
function removeCN(sdpLines, mLineIndex) {
    var mLineElements = sdpLines[mLineIndex].split(' ');
    // Scan from end for the convenience of removing an item
    for (var i = sdpLines.length - 1; i >= 0; i--) {
        var payload = extractSdp(sdpLines[i], /a=rtpmap:(\d+) CN\/\d+/i);
        if (payload) {
            var cnPos = mLineElements.indexOf(payload);
            if (cnPos !== -1) {
                // Remove CN payload from m line
                mLineElements.splice(cnPos, 1);
            }
            // Remove CN line in sdp
            sdpLines.splice(i, 1);
        }
    }
    sdpLines[mLineIndex] = mLineElements.join(' ');
    return sdpLines;
}


////////////////////////////////////////////////////////////////////////////////
// SPEECH RECOGNITION:

// VARIABLES:
var isSpeechRecognitionEnabled = false;
var isSpeechRecognitionInitiated = false;
var isSpeechRecognitionCrashed = false;
var speechRecognitionIndicator = document.getElementById('speechRecognitionIndicator');
var languageSelector = document.getElementById('languageSelector');
var languagesIndex = {
    'de': 0, 'de-DE': 0,
    'en': 1, 'en-AU': 1, 'en-CA': 1, 'en-IN': 1, 'en-NZ': 1, 'en-ZA': 1, 'en-GB': 1, 'en-US': 1,
    'es': 2, 'es-AR': 2, 'es-BO': 2, 'es-CL': 2, 'es-CO': 2, 'es-CR': 2, 'es-EC': 2, 'es-SV': 2, 'es-ES': 2, 'es-US': 2,
    'es-GT': 2, 'es-HN': 2, 'es-MX': 2, 'es-NI': 2, 'es-PA': 2, 'es-PY': 2, 'es-PE': 2, 'es-PR': 2, 'es-DO': 2, 'es-UY': 2,
    'es-VE': 2,
    'fr': 3, 'fr-FR': 3,
    'it': 4, 'it-IT': 4, 'it-CH': 4,
    'pt': 5, 'pt-BR': 5, 'pt-PT': 5,
    'ru': 6, 'ru-RU': 6,
    'ko': 7, 'ko-KR': 7,
    'cmn': 8,
    'cmn-Hans': 8, 'cmn-Hans-CN': 8, 'cmn-Hans-HK': 8,
    'cmn-Hant': 8, 'cmn-Hant-TW': 8,
    'yue': 8, 'yue-Hant': 8, 'yue-Hant-HK': 8,
    'ja': 9, 'ja-JP': 9,
    'ar': 10
};

// EXECUTION:
// Language initialization
// Tests if the user's browser language is supported by BaBL.
console.log('>> BaBL: User\'s browser language is', navigator.language);
if (languagesIndex[navigator.language] === undefined) {
    languageSelector.options.selectedIndex = 1;
    console.log('>> BaBL: User\'s browser language is not supported. Setting local language to English');
} else {
    languageSelector.options.selectedIndex = languagesIndex[navigator.language];
    console.log('>> BaBL: Setting local language to', languageSelector.selectedOptions[0].text);
}

// Speech recognition initialization
if (('webkitSpeechRecognition' in window)) {
    var recognition = new webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true; // Draft transcription enabled
    recognition.lang = languageSelector.selectedOptions[0].value;

    // EVENTS:
    recognition.onstart = function() {
        speechRecognitionIndicator.classList.remove('speechRecognitionIndicatorOff');
        speechRecognitionIndicator.classList.add('speechRecognitionIndicatorOn');
        isSpeechRecognitionEnabled = true;
        sendSubtitle({text: ' ', isFinal: false}); // For clearing the previous subtitles
        // Speech recognition initiation so no later permissions are required
        if (isSpeechRecognitionInitiated === false) {
            recognition.stop();
            isSpeechRecognitionInitiated = true;
        }
    };

    recognition.onresult = function(event) {
        var transcription = '';
        for (var i = event.resultIndex; i < event.results.length; ++i) {
            transcription += event.results[i][0].transcript;
        }
        sendSubtitle({text: transcription, isFinal: event.results[event.results.length - 1].isFinal});
        if (isTranscriptionStorageEnabled === true && event.results[event.results.length - 1].isFinal) {
            saveTranscription(transcription, username);
        }
    };

    recognition.onerror = function(error) {
        console.error('>> BaBL: Speech recognition error:', error);
        if (error.error === 'aborted') {
            isSpeechRecognitionCrashed = true;
            alert('Speech recognition aborted. Only one instance per client is supported.');
            window.location = '/error.html';
        }
    };

    recognition.onend = function() {
        speechRecognitionIndicator.classList.add('speechRecognitionIndicatorOff');
        speechRecognitionIndicator.classList.remove('speechRecognitionIndicatorOn');
        isSpeechRecognitionEnabled = false;
        keepSpeechRecognitionAliveIfNeeded();
    };
}

// FUNCTIONS:
// Keeps the speech recognition alive while the subtitles are required
function keepSpeechRecognitionAliveIfNeeded() {
    if (!isSpeechRecognitionCrashed) {
        if (isSpeechRecognitionEnabled === false && isTranscriptionStorageEnabled === true) {
            recognition.start();
            console.log('>> BaBL: Keeping speech recognition alive');
        } else if (isSpeechRecognitionEnabled === false) {
            for (var user in dataChannels) {
                if (dataChannels[user].isRemoteUserRequestingSubtitles) {
                    recognition.start();
                    console.log('>> BaBL: Keeping speech recognition alive');
                }
            }
        }
    }
}

// Updates the local user's language
function updateLanguage() {
    recognition.lang = languageSelector.selectedOptions[0].value;
    recognition.stop();
    console.log('>> BaBL: Language changed to', languageSelector.selectedOptions[0].text);
    for (var user in dataChannels) {
        if (dataChannels[user].isLocalUserRequestingTranslatedSubtitles) {
            socket.emit('subtitles request', 'start', user, languageSelector.selectedOptions[0].value);
        }
    }
}


////////////////////////////////////////////////////////////////////////////////
// TRANSCRIPTION STORAGE:

// VARIABLES:
var isTranscriptionStorageEnabled = false;

// EXECUTION:
// Initialization
var transcriptionStorageInitRequest = window.indexedDB.open("BaBL-Transcriptions", 3);

// On error
transcriptionStorageInitRequest.onerror = function(err) {
    console.log('>>BaBL: IndexedDB error:', err);
};

// On update / initialization
transcriptionStorageInitRequest.onupgradeneeded = function(event) {
    var db = event.target.result;

    // Clear database
    if (db.objectStoreNames.contains("transcriptions")) {
        db.deleteObjectStore("transcriptions");
    }

    // Create database
    var objectStore = db.createObjectStore("transcriptions", {keyPath: "id"});

    // Create indexes
    objectStore.createIndex("date", "date", {unique: false});
    objectStore.createIndex("room", "room", {unique: false});
    objectStore.createIndex("user", "user", {unique: false});
    objectStore.createIndex("text", "text", {unique: false});
};

// FUNTIONS:
// 'onclick' functions
var transcriptionButtonOff = document.getElementById('transcriptionButtonOff');
transcriptionButtonOff.onclick = function() {
    if (transcriptionButtonOff.classList.item(2) !== 'uk-active') {
        requestTranscriptionStorageToStop();
    }
};

var transcriptionButtonOn = document.getElementById('transcriptionButtonOn');
transcriptionButtonOn.onclick = function() {
    if (transcriptionButtonOn.classList.item(2) !== 'uk-active') {
        requestTranscriptionStorageToStart();
    }
};

function requestTranscriptionStorageToStart() {
    isTranscriptionStorageEnabled = true;
    for (var user in dataChannels) {
        if (dataChannels[user].isLocalUserRequestingTranslatedSubtitles) {
            //requestSubtitlesToStart(user, recognition.lang, 'hidden'); /*REVISAR ESTO*/
        } else {
            requestSubtitlesToStart(user, '', 'hidden');
        }
        if (isSpeechRecognitionEnabled === false) {
            recognition.start();
        }
    }
}

function requestTranscriptionStorageToStop() {
    isTranscriptionStorageEnabled = false;
    for (var user in dataChannels) {
        if (!dataChannels[user].isLocalUserRequestingSubtitles) {
            requestSubtitlesToStop(user, '');
        }
    }

    // Counts how many users are requesting subtitles
    var speechRecognitionRequests = 0;
    for (var user in dataChannels) {
        if (dataChannels[user].isRemoteUserRequestingSubtitles) {
            speechRecognitionRequests += 1;
        }
    }
    // And stops the speech recogniton if nobody is requesting subtitles
    if (speechRecognitionRequests === 0) {
        recognition.stop();
    }
}

// Function for saving transcriptions in the database
function saveTranscription(text, user) {
    var db;

    // Open database
    window.indexedDB.open("BaBL-Transcriptions", 3).onsuccess = function(event) {
        db = event.target.result;

        // Get the last transcription id
        db.transaction("transcriptions").objectStore("transcriptions").count().onsuccess = function(event) {
            var nextItem = event.target.result;

            // Create the new transcription object
            var newTranscription = {
                id: nextItem + 1,
                date: (new Date()).toLocaleString(),
                room: room,
                user: user,
                text: text
            };

            // Add the transcription to the database
            db.transaction(['transcriptions'], 'readwrite').objectStore('transcriptions').add(newTranscription);
        };
    };
}


////////////////////////////////////////////////////////////////////////////////
// SPEECH SYNTHESIS:

var isSpeechSynthesisEnabled = false;
var speechSyntesisIndex = {
    'en': 0,
    'es': 3,
    'fr': 4,
    'it': 5,
    'de': 6,
    'ja': 7,
    'ko': 8,
    'cmn': 9
};

// Speaks the text in the local user language if it is supported
function speak(text) {
    if (speechSyntesisIndex[languageSelector.selectedOptions[0].value] !== undefined) {
        var msg = new SpeechSynthesisUtterance();
        var voices = window.speechSynthesis.getVoices();
        msg.voice = voices[speechSyntesisIndex[languageSelector.selectedOptions[0].value]];
        msg.text = text;

        speechSynthesis.speak(msg);
    }
};