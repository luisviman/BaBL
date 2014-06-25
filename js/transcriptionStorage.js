
////////////////////////////////////////////////////////////////////////////////
//TRANSCRIPTION STORAGE: Shows the stored transcriptions

// EXECUTION:
// Try to open the DB
console.log('>>BaBL: Processing request');
var request = window.indexedDB.open('BaBL-Transcriptions', 3);

// On error
request.onerror = function(err) {
    console.log('>>BaBL: indexedDB error:', err);
};

// On success
request.onsuccess = function(event) {
    var db = this.result;

    // Table headers
    $('#attachPoint').append('\
    <table id="table" class="uk-table uk-table-hover uk-table-striped uk-table-condensed">\n\
        <caption>Stored transcriptions</caption>\n\
        <tr><th>Date</th><th>Room</th><th>User</th><th>Transcription</th></tr>\n\
    </table>');

    // Get cursor
    db.transaction('transcriptions').objectStore('transcriptions').openCursor().onsuccess = function(event) {
        var cursor = event.target.result;
        // Go over the database and attach the data to the page
        if (cursor) {
            $('#table').append('<tr><td>' + cursor.value.date + '</td><td>'
                    + cursor.value.room + '</td><td>' + cursor.value.user
                    + '</td><td>' + cursor.value.text + '</td></tr>');
            cursor.continue();
        }
    };
    console.log('>>BaBL: Stored transcriptions successfully recovered');
};

