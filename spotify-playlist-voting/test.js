var JsonDB = require('node-json-db').JsonDB;
var Config = require('node-json-db/dist/lib/JsonDBConfig').Config;

var db = new JsonDB(new Config("appData", true, true, '/'));
var req = {};
req.body = {};
req.body.trackId = "3T4DdPVqWeaC4U7vrIxlKz";
req.body.userId = "jagestedt";
req.body.like = true;
req.body.who = "1157601814";
req.body.displayName = "jagestedt";

async function Vote(req, res) {
    var songsSubmitted = 0;
    var canVote = false;
    var canSubmit = false;

    var snapshot = await db.getData("/submitted-songs");
    var snapshotLikes = await db.getData("/votes");
    var allLikes = [];
    for (var obj in snapshotLikes) {
        allLikes.push(snapshotLikes[obj]);
    };
    var allTracks = [];
    var exportTracks = [];
    for (var obj in snapshot) {
        allTracks.push(snapshot[obj]);
    };
    allTracks.forEach(function (track) {
        var totalLikes = 0;
        var users = [];
        var display_name = track.display_name;
        if (snapshotLikes[track.userId]) {
            var display_name = snapshotLikes[track.userId].displayName;
        }
        var text = "Lägg till låt"

        //var who= "";
        allLikes.forEach(function (like) {
            if (like.trackId == track.trackId) {
                totalLikes++;

                //who = like.who;
                users.push(like.userId);
                //addedBy = like.userId;
            }
        });
        track.colorValue = Math.floor(Math.random() * 360);
        track.oppositeColorValue = (track.colorValue + 180) % 360
        track.likes = totalLikes;
        track.users = users;
        track.addedBy = track.userId;
        track.display_name = display_name;

        if (track.trackId != null && track.trackId != "") {
            songsSubmitted++;
            text = "Ändra låt"
        }
        track.text = text;
        if (((new Date().getDay() == 4 || new Date().getDay() == 5) && (track.trackId == null || track.trackId == "")) || (new Date().getDay() != 4 && new Date().getDay() == 5)) {
            track.canSubmit = true;
        }

        exportTracks.push(track);
    });
    if (songsSubmitted == 4 || (new Date().getDay() == 4 || new Date().getDay() == 5)) {
        canVote = true;
    }

    allTracks.forEach(function (track) {
        track.canVote = canVote;
    });


    return res.send({ items: exportTracks });
    //return { items: allTracks };
};


Vote(req);

//     else {
//         db.collection("submitted-songs")
//             .doc(documentId)
//             .update({
//                 trackId: trackIdIn,
//             }).catch(err => {
//                 stringReturn = "User not authorized";
//                 console.log("User " + documentId + " not found",);

//             }).then(ref => {
//                 if (!ref) {
//                     return res.send("Inte medlem i SlurpGang");
//                 }
//                 return res.send("Sång tillagd");
//             });
//     }
// }
// var documentId = req.body.userId;
// var trackIdIn = req.body.trackId;
// if (trackIdIn.startsWith("https://open.spotify.com/track/")) {
//     trackIdIn = trackIdIn.substring(31);
// }
// if (trackIdIn.indexOf("?") > -1) {
//     trackIdIn = trackIdIn.substring(0, trackIdIn.indexOf("?"));
// }
// if (trackIdIn.startsWith("spotify:track:")) {
//     trackIdIn = trackIdIn.substring(14);
// }
// var options = { method: "GET", url: "https://api.spotify.com/v1/tracks/" + trackIdIn, headers: { Authorization: "Bearer " + req.body.accessToken } };
// request(options, function (error, response, body) {
//     if (error) throw new Error(error);
//     if (response.statusCode != 200) {
//         return res.send("Låten är inte giltig");

//     }

