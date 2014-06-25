
////////////////////////////////////////////////////////////////////////////////
//INITIAL: Manages index.html web page

// Listener for submitting the form with the enter key
document.getElementById('access-form').onkeypress = function() {
    if (window.event.keyCode === 13) {
        goToRoom(room.value, username.value);
    }
};

// Function that validates room and username, and redirect to the room
// @param room
// @param username
function goToRoom(room, username)
{
    if (room === '' || username === '') {
        //Display error messages
        document.getElementById('messages').innerHTML = '';
        if (username === '') {
            document.getElementById('messages').innerHTML += '<p id="error">Invalid username</p>';
            document.getElementById('username').classList.add('uk-form-danger');
        } else {
            document.getElementById('username').classList.remove('uk-form-danger');
        }
        if (room === '') {
            document.getElementById('messages').innerHTML += '<p id="error">Invalid room</p>';
            document.getElementById('room').classList.add('uk-form-danger');
        } else {
            document.getElementById('room').classList.remove('uk-form-danger');
        }
    } else {
        var roomURL = '/room=' + room + '&username=' + username;
        window.location = roomURL;
    }
}
