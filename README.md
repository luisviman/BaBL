## BaBL: Real-time captioning for WebRTC
**Visit BaBL at https://dixie11.rice.iit.edu**

### What's BaBL?
BaBL is a WebRTC multi-user videoconferencing application able to provide real-time captioning, instant translation and transcription storage using HTML5 APIs.

BaBL requires no installation nor plugins. All the required components are built-in in the browser or are accessed through the Internet. You will need the latest Google Chrome browser in order to enjoy all the features included in BaBL because Chrome is the only browser that has implemented the Web Speech API nowadays, used for speech recognition. The rest of the browser vendors are expected to implement this HTML5 API soon.

The application was developed by Luis Villaseñor Muñoz during the Fall 2013 and the Spring 2014 semesters at Illinois Institute of Technology as part of his course work. The application's development was supervised since its beginning by Professor Carol Davids.

The application was presented in public on April 30, 2014, at the Real-Time Communications Roundtable event hosted by the RTC Research Lab.

BaBL has been developed using free resources and technologies that are still under development. However, we think the result is satisfactory. Technology is awesome.

### Multiconference
Using the WebRTC web API, BaBL is able to provide audio and video conferencing. There can be multiple conferences going on at the same time and each of these conferences can have multiple users.

When possible, the call is established using peer-to-peer connections between users, improving performance, security and privacy compared to centralized conference services.

### Real-time captioning
Thanks to the HTML5's Web Speech API we are able to convert the local user's speech into text. Once we have the text, we use the WebRTC datachannel to transmit the speech transcription to the remote users that are requesting real-time captioning.

### Transcription storage
Another feature included in BaBL consists in storing locally the transcribed conversation that is taking place in the room, so the user can read it later. The application will collect the speech transcription of every user present in the room (including ourselves) and will store them using IndexedDB, another HTML5 API.

This feature can be turned on or off by operating the transcription storage switch. All the stored transcriptions can be browsed clicking the "Browse stored transcriptions" link. These transcriptions include the user, the time and the room in which these transcriptions were taken.

Some advantages of storing transcribed conversations instead of the conference's audio or video are that the transcribed conversations are just text, much lighter than audio or video and easier to search and browse.

### Instant translation
If the users speak different languages, BaBL is able to provide translated subtitles. The original transcribed speech will be send to a translation service taking into consideration both the original language and the desired language. The translation service chosen is Microsoft Translator.

### Speech-to-speech translation
Do you imagine having a conversation with someone who speaks in other language and listening to him in your own language? You can do it with BaBL! Now that we have the translated text we can use one of the speech synthesis engines of the Web Speech API to read them aloud.
