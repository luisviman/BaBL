/* For security reasons the SSL certificate, its private key and the Microsoft Translator key are not included.*/


// Start signal
console.log('>> BaBL:', new Date(), '- Server started');


/////////////////////////////////////////////
//WEB SERVER:

// DEPENDENCIES:
var http = require('http');
var https = require('https');
var fs = require('fs');
var static = require('node-static');
var file = new static.Server();

//SSL CERTIFICATE:
var httpsoptions = {
    key: fs.readFileSync('PRIVATE KEY HERE'), 
    cert: fs.readFileSync('SSL CERTIFICATE HERE')
};

//HTTPS WEB SERVER:
var HTTPSWebServer = https.createServer(httpsoptions, function(req, res) {
    //Serve room requests
    if (req.url.substring(1, 6) === 'room=' && req.url.indexOf('&username=') !== 6) {
        file.serveFile('/room.html', 200, {}, req, res);
        //Serve error404.html for hidden files
    } else if (req.url === 'PRIVATE KEY HERE' || req.url === 'SSL CERTIFICATE HERE') {
        file.serveFile('/error404.html', 404, {}, req, res);
        //Serve the rest of the files and handles 404 errors
    } else {
        file.serve(req, res, function(error, errorRes) {
            if (error && (error.status === 404)) {
                file.serveFile('/error404.html', 404, {}, req, res);
            }
        });
    }
}).listen(443);

//HTTP WEB SERVER: Redirects all traffic to HTTPS server
var HTTPWebServer = http.createServer(function(req, res) {
    res.writeHead(301, {'Location': 'https://dixie11.rice.iit.edu' + req.url});
    res.end();
}).listen(80);


/////////////////////////////////////////////
//WEBRTC SIGNALING SERVER:

// VARIABLES:
var rooms = {};

// SOCKET.IO SET-UP:
var io = require('socket.io').listen(HTTPSWebServer);
io.set('log level', 2);

// CONNECTION HANDLING:
io.sockets.on('connection', function(socket) {

    var clientAddress = socket.handshake.address;
    console.log('>> BaBL:', new Date(), '- Client connected: {', socket.id, '} @', clientAddress);

    // Handles join requests
    socket.on('request to join', function(username, room) {
        // Checks the params are valid
        if (!username || !room) {
            console.log('>> BaBL:', new Date(), '- BAD PARAMS FROM SOCKET ID', socket.id);
            socket.disconnect();
        } else {
            console.log('>> BaBL:', new Date(), '- User', username, 'requests to join room', room);
            //Creates the room if it is not defined
            if (rooms[room] === undefined) {
                rooms[room] = {};
                socket.join(room);
                socket.set('socketID', username + '@' + room);
                socket.emit('room created', room);
                rooms[room][username] = socket;
                console.log('>> BaBL:', new Date(), '- Room', room, 'created by user', username);
                //Test if the username is already in use in the room
            } else if (Object.keys(rooms[room]).indexOf(username) !== -1) {
                console.log('>> BaBL:', new Date(), '- Username', username, 'already in use in room', room);
                log('Username', username, 'already in use in room', room);
                socket.emit('username in use', username, room);
                socket.disconnect();
                //Connect to the room
            } else {
                // Let the other users know that this user has joined
                io.sockets.in(room).emit('new user joined', username, room);
                socket.join(room);
                socket.set('socketID', username + '@' + room);
                // Previous userlist is attached for peer connection creation
                socket.emit('room joined', room, Object.keys(rooms[room]));
                rooms[room][username] = socket;
                console.log('>> BaBL:', new Date(), '- Username', username, 'joined room', room);
            }
        }
    });

    // Disconnection handling
    socket.on('disconnect', function() {
        var username;
        var room;
        socket.get('socketID', function(err, socketID) {
            if (socketID !== null) {
                username = socketID.split('@')[0];
                room = socketID.split('@')[1];
                delete rooms[room][username];
                if (Object.keys(rooms[room]).length === 0) {
                    delete rooms[room];
                }
                socket.leave(room);
                console.log('>> BaBL:', new Date(), '- User', username, 'left room', room);
                socket.broadcast.to(room).emit('user disconnected', username);
            }
            var clientAddress = socket.handshake.address;
            console.log('>> BaBL:', new Date(), '- Client disconnected: {', socket.id, '} @', clientAddress);
        });
    });

    // SUBTITLES:
    // Redirects subtitles requests
    socket.on('subtitles request', function(message, toUser, language) {
        var fromUser;
        var room;
        socket.get('socketID', function(err, socketID) {
            fromUser = socketID.split('@')[0];
            room = socketID.split('@')[1];
        });
        // Avoids server crashes
        if (typeof (rooms[room][toUser]) !== 'undefined') {
            rooms[room][toUser].emit('subtitles request', message, fromUser, language);
        } else {
            console.log('>> BaBL:', new Date(), '- BAD PARAMS FROM SOCKET ID', socket.id);
            socket.disconnect();
        }
    });

    // TRANSLATION:
    // Process translation requests
    socket.on('translation request', function(subtitleToTranslate, fromLanguage, toLanguage, toUser) {
        if (!subtitleToTranslate.text) {
            console.log('>> BaBL:', new Date(), '- BAD PARAMS FROM SOCKET ID', socket.id);
            socket.disconnect();
        } else {
            var translationRequest = {
                text: subtitleToTranslate.text,
                from: fromLanguage,
                to: toLanguage
            };
            var fromUser;
            var room;
            socket.get('socketID', function(err, socketID) {
                fromUser = socketID.split('@')[0];
                room = socketID.split('@')[1];
            });
            charactersTranslated += subtitleToTranslate.text.length;
            console.log('>> BaBL:', new Date(), '-', charactersTranslated,
                    'characters translated since last server start');
            client.translate(translationRequest, function(err, data) {
                // Avoids server crashes
                if (typeof (rooms[room][toUser]) !== 'undefined') {
                    rooms[room][toUser].emit('translation', data, fromUser, subtitleToTranslate.isFinal);
                } else {
                    console.log('>> BaBL:', new Date(), '- BAD PARAMS FROM SOCKET ID', socket.id);
                    socket.disconnect();
                }
            });
        }
    });

    // FUNCTIONS:
    // Redirects a user's message to the rest of users in one room
    socket.on('message to room', function(message) {
        var fromUser;
        var toRoom;
        socket.get('socketID', function(err, socketID) {
            fromUser = socketID.split('@')[0];
            toRoom = socketID.split('@')[1];
        });
        socket.broadcast.to(toRoom).emit('message', message, fromUser);
    });

    // Redirects a user's message to other user in one room
    socket.on('message to user', function(message, toUser) {
        var fromUser;
        var room;
        socket.get('socketID', function(err, socketID) {
            fromUser = socketID.split('@')[0];
            room = socketID.split('@')[1];
        });
        // Avoids server crashes
        if (typeof (rooms[room][toUser]) !== 'undefined') {
            rooms[room][toUser].emit('message', message, fromUser);
        }
    });

    // Function for sending messages to the client's console
    function log() {
        var array = ['>> BaBL server message:'];
        for (var i = 0; i < arguments.length; i++) {
            array.push(arguments[i]);
        }
        socket.emit('log', array);
    }
});


/////////////////////////////////////////////
//TRANSLATION SERVICE:

// VARIABLES:
var MsTranslator = require('mstranslator');
var client = new MsTranslator({client_id: 'BaBL', client_secret: 'MICROSOFT TRANSLATOR KEY HERE'});
var charactersTranslated = 0;

// EXECUTION:
// Translation initialization
client.initialize_token();
console.log('>> BaBL:', new Date(), '- Translation service initialized');

