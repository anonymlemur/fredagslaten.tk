// import {JsonDB, Config} from 'node-json-db';
var JsonDB = require('node-json-db').JsonDB;
var Config = require('node-json-db/dist/lib/JsonDBConfig').Config;
var express = require("express");
var request = require("request");
var cors = require("cors");
var querystring = require("querystring");
var cookieParser = require("cookie-parser");
var nodemailer = require("nodemailer");
var HTMLParser = require('node-html-parser');

let appData = require("./appData.json");
let spotifyApiDetails = require("./spotifyApiDetails.json");
let emailDetails = require("./emailDetails.json");

const transporter = nodemailer.createTransport({
    host: emailDetails.host,
    port: emailDetails.port,
    secure: emailDetails.secure,
    auth: {
        user: emailDetails.user,
        pass: emailDetails.pass
    }
});
const MINUTE = 60000
const DAY = 86400000
const WEEK = 604800000 // = 7 * 24 * 60 * 60 * 1000 = 7 days in ms

/**
 * Get the difference in milliseconds between the timezone offsets of 2 dates
 */
const tzDiff = (first, second) => (first.getTimezoneOffset() - second.getTimezoneOffset()) * MINUTE




const { readFile, writeFile } = require("fs");

var redirect_uri = "https://fredagslaten.tk/callback";

var port = process.env.PORT || 8888;

if (port != 8888) {
    redirect_uri = spotifyApiDetails.callback_url;
}

var generateRandomString = function (length) {
    var text = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    for (var i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }

    return text;
};

var stateKey = "spotify_auth_state";

var app = express();


app.use(express.static(__dirname + "/public"))
    .use(cors())
    .use(cookieParser())
    .use(express.json());

app.get("/login", function (req, res) {
    var state = generateRandomString(16);
    res.cookie(stateKey, state);

    var scope = "user-read-private playlist-read-private playlist-modify-public playlist-read-collaborative playlist-modify-private";
    res.redirect("https://accounts.spotify.com/authorize?" +
        querystring.stringify({
            response_type: "code",
            client_id: spotifyApiDetails.client_id,
            scope: scope,
            redirect_uri: redirect_uri,
            state: state
        }));
});
app.post("/email", function (req, res) {
    transporter.sendMail({
        from: "Fredagslåten <noreply@fredagslaten.tk>",
        to: req.body.email,
        subject: req.body.subject,
        //text: req.body.message,
        html: req.body.message
    }, function (error, info) {
        if (error) {
            console.log(error);
        } else {
            console.log("Email sent: " + info.response);
        }

        res.send("Email sent");
    });

});

app.get("/callback", function (req, res) {
    var code = req.query.code || null;
    var state = req.query.state || null;
    var storedState = req.cookies ? req.cookies[stateKey] : null;

    if (state === null || state !== storedState) {
        res.redirect("/#" +
            querystring.stringify({
                error: "state_mismatch"
            }));
    } else {
        res.clearCookie(stateKey);
        var authOptions = {
            url: "https://accounts.spotify.com/api/token",
            form: {
                code: code,
                redirect_uri: redirect_uri,
                grant_type: "authorization_code"
            },
            headers: {
                "Authorization": "Basic " + (Buffer.from(spotifyApiDetails.client_id + ":" + spotifyApiDetails.client_secret).toString("base64"))
            },
            json: true
        };

        request.post(authOptions, function (error, response, body) {
            if (!error && response.statusCode === 200) {
                var access_token = body.access_token;
                var refresh_token = body.refresh_token;
                res.redirect("/#" +
                    querystring.stringify({
                        access_token: access_token,
                        refresh_token: refresh_token
                    }));
            } else {
                res.redirect("/#" +
                    querystring.stringify({
                        error: "invalid_token"
                    }));
            }
        });
    }
});

app.get("/refresh_token", function (req, res) {
    var refresh_token = req.query.refresh_token;
    var authOptions = {
        url: "https://accounts.spotify.com/api/token",
        headers: { "Authorization": "Basic " + (Buffer.from(spotifyApiDetails.client_id + ":" + spotifyApiDetails.client_secret).toString("base64")) },
        form: {
            grant_type: "refresh_token",
            refresh_token: refresh_token
        },
        json: true
    };

    request.post(authOptions, function (error, response, body) {
        if (!error && response.statusCode === 200) {
            var access_token = body.access_token;
            res.send({
                "access_token": access_token
            });
        }
    });
});


app.post("/vote", function (req, res) {
    if (req.body.userId == null || req.body.userId == "" || req.body.userId == req.body.who) {
        res.send("Du kan inte rösta på din egen låt!");
        return;
    }
    let documentId = req.body.userId;
    let data = {
        "trackId": req.body.trackId,
        "userId": req.body.userId,
        "like": req.body.like,
        "who": req.body.who,
        "displayName": req.body.displayName,
        "imageURI": req.body.imageURI,
        "timestamp": new Date().getTime()
    }


    let db = new JsonDB(new Config("appData", true, true, '/'));

    db.getData("/votes/" + documentId).then((v) => {
        if (v.trackId == req.body.trackId) {
            db.delete("/votes/" + documentId);
            res.send("Röst borttagen");
            return;
        }
        else {
            db.push("/votes/" + documentId + "/", data).then((v) => {

                res.send("ok");
                return;

            }).catch(error => {
                res.send("error");
            });
        }
    }).catch((err) => {
        db.push("/votes/" + documentId + "/", data).then((v) => {

            res.send("ok");
            return;

        }).catch(error => {
            res.send("error");
        });

    });



});

app.post("/get_tracks", async function (req, res) {
    function weekNumber(date = new Date()) {
        const day = (date.getDay() + 6) % 7
        const thursday = new Date(date)
        thursday.setDate(date.getDate() - day + 3)
        const firstThursday = new Date(thursday.getFullYear(), 0, 1)
        if (firstThursday.getDay() !== 4) {
            firstThursday.setMonth(0, 1 + (11 /* 4 + 7 */ - firstThursday.getDay()) % 7)
        }
        const weekNumber = 1 + Math.floor((thursday - firstThursday + tzDiff(firstThursday, thursday)) / WEEK)
        return weekNumber
    }
    let songsSubmitted = 0;
    let canVote = false;
    let canView = false;
    let db = new JsonDB(new Config("appData", true, true, '/'));

    let snapshot = await db.getData("/submitted-songs").then();
    let snapshotLikes = await db.getData("/votes").then();
    let week = await db.getData("/date/week").then();
    let allLikes = [];
    for (let obj in snapshotLikes) {
        allLikes.push(snapshotLikes[obj]);
    };
    let allTracks = [];
    let exportTracks = [];
    for (let obj in snapshot) {
        allTracks.push(snapshot[obj]);
    };
    let text = "Lägg till låt"
    allTracks.forEach(function (track) {
        let totalLikes = 0;
        let users = [];
        let display_name = track.display_name;
        track.canView = false;
        if (snapshotLikes[track.userId]) {
            let display_name = snapshotLikes[track.userId].displayName;
        }
        text = "Lägg till låt"

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

        if (track.trackId && (track.trackId != "" || track.trackId != null)) {

            songsSubmitted++;
            text = "Ändra låt"
        }

        track.text = text;
        // if (((new Date().getDay() == 4 || new Date().getDay() == 5) && (track.trackId == null || track.trackId == "")) || (new Date().getDay() != 4 && new Date().getDay() != 5)) {
        //     track.canSubmit = true;
        // }
        if (weekNumber() == week) {
            track.canSubmit = true;
        }
        // if (new Date().getDay() == 5 && weekNumber() == week) {
        //     track.canView = true;

        // }
        exportTracks.push(track);

    });
    // if (songsSubmitted == 7 || ((new Date().getDay() == 5 || new Date().getDay() == 4) && weekNumber() == week)) {
    //     if (songsSubmitted == 7 || new Date().getDay() == 5) {
    //         canVote = true;
    //     }
    //     canView = true;
    // }

    allTracks.forEach(function (track) {
        songsSubmitted == 7 || (new Date().getDay() == 5 && weekNumber() == week) ? track.canVote = true : false;
        songsSubmitted == 7 || ((new Date().getDay() == 5 || new Date().getDay() == 4) && weekNumber() == week) ? track.canView = true : false;
    });


    return res.send({ items: exportTracks });

});

app.post("/add_song", function (req, res) {
    let db = new JsonDB(new Config("appData", true, true, '/'));
    let documentId = req.body.userId;
    let trackIdIn = req.body.trackId;
    let options;
    if (trackIdIn == "delete") {
        db.push("/submitted-songs/" + documentId + "/trackId", "");
        db.getData("/votes").then((v) => {
            for (let obj in v) {
                if (v[obj].who == documentId) {
                    db.delete("/votes/" + obj);
                }
            }
        });
        return res.send("Låt borttagen");

    }
    if (trackIdIn.startsWith("https://open.spotify.com/track/")) {
        trackIdIn = trackIdIn.substring(31);
    }
    if (trackIdIn.indexOf("?") > -1) {
        trackIdIn = trackIdIn.substring(0, trackIdIn.indexOf("?"));
    }
    if (trackIdIn.startsWith("spotify:track:")) {
        trackIdIn = trackIdIn.substring(14);
    }
    if (trackIdIn.startsWith("https://spotify.link/")) {
        //trackIdIn = trackIdIn.substring(21);

        async function getapi(url) {
            const response = await fetch(url);
            var data = await response.text();
            return parseHtml(data);
        }
        function parseHtml(data) {
            const root = HTMLParser.parse(data);
            let link = root.querySelector('.action').attributes.href.substring(6, root.querySelector('.action').attributes.href.indexOf('?'));
            return link;
        }
        getapi(trackIdIn).then(function (data) {
            options = {
                method: "GET", url: "https://api.spotify.com/v1/tracks/" + data, headers: {
                    Authorization: "Bearer " + req.body.accessToken
                }
            };
            console.log(options);
            request(options, function (error, response, body) {
                if (error) throw new Error(error);
                if (response.statusCode != 200) {
                    return res.send("Låten är inte giltig");

                }
                else {
                    db.push("/submitted-songs/" + documentId + "/trackId", trackIdIn).catch(err => {
                        stringReturn = "User not authorized";
                        console.log("User " + documentId + " not found",);

                    });
                    return res.send("Sång tillagd");
                }
            });
        })
    }
    else {
        options = {
            method: "GET", url: "https://api.spotify.com/v1/tracks/" + trackIdIn, headers: {
                Authorization: "Bearer " + req.body.accessToken
            }
        };
        request(options, function (error, response, body) {
            if (error) throw new Error(error);
            if (response.statusCode != 200) {
                return res.send("Låten är inte giltig");

            }
            else {
                db.push("/submitted-songs/" + documentId + "/trackId", trackIdIn).catch(err => {
                    stringReturn = "User not authorized";
                    console.log("User " + documentId + " not found",);

                });
                return res.send("Sång tillagd");
            }
        });
    }

});

app.post("/update_playlist", function (req, res) {
    function weekNumber(date = new Date()) {
        const day = (date.getDay() + 6) % 7
        const thursday = new Date(date)
        thursday.setDate(date.getDate() - day + 3)
        const firstThursday = new Date(thursday.getFullYear(), 0, 1)
        if (firstThursday.getDay() !== 4) {
            firstThursday.setMonth(0, 1 + (11 /* 4 + 7 */ - firstThursday.getDay()) % 7)
        }
        const weekNumber = 1 + Math.floor((thursday - firstThursday + tzDiff(firstThursday, thursday)) / WEEK)
        return weekNumber
    }
    readFile('appData.json', 'utf8', function (err, data) {
        if (err) {
            return console.log(err);
        }
        writeFile("backup/appDataWeek" + weekNumber() + ".json", data, function (err) {
            if (err) {
                return console.log(err);
            }
            console.log("The file was saved!");
        });
    });


    let playlistId = "6CiGXt6v60opLz0v45JI5i";
    let loserPlaylistId = "4wBuklcIoGf4ZVXRPNzQ2r";
    let client_id = spotifyApiDetails.client_id;
    let client_secret = spotifyApiDetails.client_secret;
    let access_token = req.headers.authorization;
    let mostLikedSongs = [];
    let allSongs = [];
    let mostLikedSong = [];
    let mostLikedSongId = [];
    let winners = [];
    var errorCode = "";
    request.post({ url: "https://fredagslaten.tk/get_likes", contentType: "application/json" }, async function (error, response, body) {
        if (!error && response.statusCode === 200) {

            mostLikedSongs = (JSON.parse(body)).items;
            mostLikedSongs.sort(function (a, b) {
                return b.likes - a.likes;
            }
            );
            mostLikedSongs.filter(function (song) {
                if (song.likes == mostLikedSongs[0].likes) {
                    mostLikedSong.push("spotify:track:" + song.trackId);
                    mostLikedSongId.push(song.trackId);
                    let person = { id: song.trackId, likes: song.likes, display_name: song.display_name };
                    winners.push(person);
                }
                if (song.trackId != null && song.trackId != "") {
                    allSongs.push("spotify:track:" + song.trackId);
                }
            }

            );
            console.log("allSongs: \n" + allSongs);
            console.log(winners);
            let loserOptions = {
                url: 'https://api.spotify.com/v1/playlists/' + loserPlaylistId + '/tracks',
                headers: { 'Authorization': access_token },
                json: true,
                body: {
                    "uris": allSongs
                }
            };
            request.post(loserOptions, function (error, response, body) {
                if (!error && response.statusCode === 201) {
                    console.log("Loser playlist updated");
                }
                else {
                    errorCode = error + "" + response.statusCode;
                }
            });
            console.log("mostLikedSong: \n" + mostLikedSong);
            let options = {
                url: 'https://api.spotify.com/v1/playlists/' + playlistId + '/tracks',
                headers: { 'Authorization': access_token },
                json: true,
                body: {
                    "uris": mostLikedSong
                }

            };
            let db = new JsonDB(new Config("appData", true, true, '/'));

            db.push("/date/week/", weekNumber() + 1);
            let snapshot = await db.getData("/submitted-songs");
            let snapshotLikes = await db.getData("/votes");

            request.post(options, function (error, response, body) {
                if (!error && response.statusCode === 201) {
                    for (let obj in snapshot) {
                        console.log(obj + '/trackId');

                        db.push("/submitted-songs/" + obj + '/trackId', "");

                    }

                    return res.send("Playlist updated");

                }
            }

            );
            for (let obj in snapshotLikes) {
                db.delete("/votes/" + obj);
            }
            let songOptions = {
                url: 'https://api.spotify.com/v1/tracks?ids=' + mostLikedSongId.join(","),
                headers: { 'Authorization': access_token, 'Content-Type': 'application/json', 'Accept': 'application/json' },
            };
            request.get(songOptions, function (error, response, body) {
                if (!error && response.statusCode === 200) {
                    body = JSON.parse(body);
                    body.tracks.forEach(function (song) {
                        winners.filter(function (person) {
                            if (person.id == song.id) {
                                person.songName = song.name;
                                person.artist = song.artists.map((artist) => artist.name).join(', ').replace(/,/, ' feat.');
                            }
                        });
                    });
                    let vote = winners[0].likes == "1" ? "</b> röst är:" : "</b> röster är:";
                    mailMessage = "<br>Vinnare vecka " + weekNumber() + ", med <b>" + winners[0].likes + vote

                    winners.forEach(function (winner) {
                        mailMessage += "<br><b>" + winner.display_name + `</b> med låt: <a href="https://open.spotify.com/track/${winner.id}">"` + winner.songName + '"</a> av ' + winner.artist;
                    }
                    );
                    mailMessage += '<br><br>Lyssna på alla fredagslåtar här:   <a href="https://open.spotify.com/playlist/6CiGXt6v60opLz0v45JI5i">Fredagslåten 2 Electric boogaloo</a> <br><br>Glöm inte att lägga till och rösta på nästa veckas låtar!';
                    let emailOptions = {
                        url: 'https://fredagslaten.tk/email',
                        headers: { 'Content-Type': 'application/json' },
                        json: true,
                        body: {
                            email: "Edmolander97@gmail.com, Jcarlsson1996@gmail.com, aronsson.o@gmail.com, adrianknuutinen@gmail.com, linusri@kth.se, Lukas.elfving@gmail.com, frej.back@gmail.com, j.jagestedt@gmail.com",
                            //email: "j.jagestedt@gmail.com",
                            subject: "Fredagslåten vecka " + weekNumber(),
                            message: mailMessage

                        }

                    };
                    request.post(emailOptions, function (error, response, body) {
                        if (!error && response.statusCode === 200) {
                            console.log("Email sent");


                        }
                    }
                    );
                }
            });


        }
    });


});



app.post("/get_likes", async function (req, res) {
    let db = new JsonDB(new Config("appData", true, true, '/'));


    let snapshot = await db.getData("/submitted-songs");
    let snapshotLikes = await db.getData("/votes");
    let allLikes = [];
    for (let obj in snapshotLikes) {
        allLikes.push(snapshotLikes[obj]);
    };
    let allTracks = [];
    let exportTracks = [];
    for (let obj in snapshot) {
        allTracks.push(snapshot[obj]);
    };

    allTracks.forEach(function (track) {
        let totalLikes = 0;
        let users = [];
        let displayNames = [];

        allLikes.forEach(function (like) {
            if (like.trackId == track.trackId) {
                totalLikes++;
                displayNames.push(like.displayName);
                users.push(like.userId);
            }
        });
        track.likes = totalLikes;
        track.users = users;
        track.displayNames = displayNames;
        track.addedBy = track.userId;
        exportTracks.push(track);

    });


    return res.send({ items: exportTracks });
});



console.log("Listening on " + port);
app.listen(port);
