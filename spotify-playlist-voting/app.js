var express = require("express");
var request = require("request");
var cors = require("cors");
var querystring = require("querystring");
var cookieParser = require("cookie-parser");
var nodemailer = require("nodemailer");

const admin = require("firebase-admin");
let serviceAccount = require("./firebaseServiceAccountKey.json");
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
let db = admin.firestore();

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





const { readFile } = require("fs");

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

// app.get("/tracks", function (req, res) {
//     var playlistId = req.query.playlistId;
//     var votes = [];

//     db.collection("votes")
//         .get()
//         .then(snapshot => {
//             var options = {
//                 url: "https://api.spotify.com/v1/playlists/" + playlistId + "/tracks",
//                 headers: { "Authorization": "Bearer " + req.query.token },
//                 json: true
//             };

//             if (!snapshot.empty) {
//                 snapshot.forEach(doc => {
//                     votes.push(doc.data());
//                 });

//                 request.get(options, function (error, response, body) {
//                     if (!error && response.statusCode === 200) {
//                         body.items.forEach(function (item) {
//                             var likes = [];
//                             var dislikes = [];

//                             votes.forEach(function (vote) {
//                                 if (vote.trackId == item.track.id) {
//                                     if (vote.like) {
//                                         likes.push(vote);
//                                     }
//                                     else {
//                                         dislikes.push(vote);
//                                     }
//                                 }
//                             })

//                             item.track.likes = getCountAndUserIds(likes);
//                             item.track.dislikes = getCountAndUserIds(dislikes);
//                         });

//                         res.send(body);
//                     } else {
//                         console.log("Error getting playlist tracks from Spotify 1");
//                         console.log(error);
//                         res.send("error");
//                     }
//                 });
//             } else {
//                 request.get(options, function (error, response, body) {
//                     if (!error && response.statusCode === 200) {
//                         body.items.forEach(function (item) {
//                             item.track.likes = 0;
//                             item.track.dislikes = 0;
//                         });
//                         res.send(body);
//                     } else {
//                         console.log("Error getting playlist tracks from Spotify 2");
//                         console.log(error);
//                         res.send("error");
//                     }
//                 })
//             }
//         })
//         .catch(err => {
//             console.log("Error getting documents", err);
//         });
// });
app.get("/tracks", function (req, res) {
    //var playlistId = req.query.playlistId;
    var votes = {};

    db.collection("votes")
        .where("trackId", "==", req.body.trackId).get()
        .then(snapshot => {
            if (!snapshot.empty) {
                var likes = [];
                var dislikes = [];
                snapshot.forEach(doc => {
                    if (doc.data().like) {
                        likes.push(doc.data());
                    } else {
                        dislikes.push(doc.data());
                    }
                });

                votes.likes = getCountAndUserIds(likes);
                votes.dislikes = getCountAndUserIds(dislikes);
                res.send(votes);
            }
        })
        .catch(err => {
            console.log("Error getting documents", err);
            res.send(votes);
        });
});


app.get("/mylikedtracks", function (req, res) {
    //var playlistId = req.query.playlistId;
    var userId = req.query.userId;
    var likedTracks = [];

    db.collection("votes")
        .where("userId", "=", userId)
        .where("like", "=", true)
        .get()
        .then(snapshot => {
            if (!snapshot.empty) {
                snapshot.forEach(doc => {
                    likedTracks.push("spotify:track:" + doc.data().trackId);
                });
            }
            res.send(likedTracks);
        })
        .catch(err => {
            console.log("Error getting liked tracks", err);
            res.send(likedTracks);
        });
});

app.get("/populartracks", function (req, res) {
    getPopularTracks(req.query.playlistId, function (popularTracks) {
        res.send(popularTracks);
    });
});

function getPopularTracks(playlistId, callback) {
    var popularTracks = [];
    var allLikes = [];
    var uniqueLikes = [];

    db.collection("votes")
        .get()
        .then(snapshot => {
            if (!snapshot.empty) {
                var allVotes = [];

                snapshot.forEach(votes => {
                    var vote = votes.data();
                    allVotes.push(vote);

                    if (vote.like) {
                        allLikes.push(vote);

                        if (uniqueLikes == []) {
                            uniqueLikes.push(vote.trackId);
                        } else {
                            var trackIdExists = false;
                            uniqueLikes.forEach(function (trackId) {
                                if (!trackIdExists && vote.trackId == trackId) {
                                    trackIdExists = true;
                                }
                            });

                            if (!trackIdExists) {
                                uniqueLikes.push(vote.trackId);
                            }
                        }
                    }
                });

                uniqueLikes.forEach(function (trackId) {
                    //calculate how many unique voters voted for this track
                    var uniqueVoters = [];
                    allVotes.forEach(function (vote) {
                        if (vote.trackId == trackId) {
                            var voterExists = false;

                            if (uniqueVoters == []) {
                                uniqueVoters.push(vote.userId);
                            } else {
                                uniqueVoters.forEach(function (voter) {
                                    if (!voterExists && voter == vote.userId) {
                                        voterExists = true;
                                    }
                                });

                                if (!voterExists) {
                                    uniqueVoters.push(vote.userId);
                                }
                            }
                        }
                    });

                    //calculate total likes
                    var totalLikes = 0;
                    allLikes.forEach(function (like) {
                        if (like.trackId == trackId) {
                            totalLikes++;
                        }
                    });

                    //if this track has more than 50% of the vote then it"s popular
                    if (totalLikes / uniqueVoters.length > 0.5) {
                        popularTracks.push("spotify:track:" + trackId);
                    }
                });
            }

            callback(popularTracks);
        })
        .catch(err => {
            console.log("Error getting popular tracks", err);
            callback(popularTracks);
        });
}

app.get("/voters", function (req, res) {
    getVoters(function (voters) {
        res.send(voters);
    });
});

function getVoters(callback) {
    var voters = [];

    db.collection("votes")
        .get()
        .then(snapshot => {
            if (!snapshot.empty) {
                snapshot.forEach(votes => {
                    var vote = votes.data();
                    var voterExists = false;

                    if (voters == []) {
                        voters.push(vote.userId);
                    } else {
                        voters.forEach(function (voter) {
                            if (!voterExists && voter == vote.userId) {
                                voterExists = true;
                            }
                        });

                        if (!voterExists) {
                            voters.push(vote.userId);
                        }
                    }
                });
            }

            callback(voters);
        })
        .catch(err => {
            console.log("Error getting voters", err);
            callback(voters);
        });
}

function getCountAndUserIds(votes) {
    if (votes.length == 0) {
        return "0";
    }

    var usernames = "";

    votes.forEach(function (vote) {
        if (usernames == "") {
            usernames = vote.userId;
        }
        else {
            usernames = usernames + "," + vote.userId;
        }
    });

    return votes.length + " (" + usernames + ")";
}


app.post("/vote", function (req, res) {
    if (req.body.userId == null || req.body.userId == "" || req.body.userId == req.body.who) {
        res.send("Du kan inte rösta på din egen låt!");
        return;
    }
    var documentId = req.body.userId;
    var docRef = db.collection("votes").doc(documentId);
    docRef.get().then(doc => {
        if (doc.exists) {
            if (doc.data().trackId == req.body.trackId) {
                db.collection("votes").doc(documentId).delete();
                res.send("Röst borttagen");
                return;
            }
            else {
                db.collection("votes")
                    .doc(documentId)
                    .set({
                        userId: req.body.userId,
                        trackId: req.body.trackId,
                        like: req.body.like,
                        who: req.body.who,
                        displayName: req.body.displayName
                    }).then(ref => {
                        var votes = {};

                        db.collection("votes")
                            .where("trackId", "==", req.body.trackId).get()
                            .then(snapshot => {
                                if (!snapshot.empty) {
                                    res.send("ok");
                                    return;
                                }
                            })
                            .catch(err => {
                                res.send("error");
                            });
                    });
            }
        }
        else {
            db.collection("votes")
                .doc(documentId)
                .set({
                    userId: req.body.userId,
                    trackId: req.body.trackId,
                    like: req.body.like,
                    who: req.body.who,
                    displayName: req.body.displayName
                }).then(ref => {
                    var votes = {};

                    db.collection("votes")
                        .where("trackId", "==", req.body.trackId).get()
                        .then(snapshot => {
                            if (!snapshot.empty) {
                                res.send("ok");
                                return;
                            }
                        })
                        .catch(err => {
                            res.send("error");
                        });
                });
        }
    }).catch((error) => {
        console.log("Error getting document:", error);
    });


})
app.post("/add_song", function (req, res) {
    var documentId = req.body.userId;
    var trackIdIn = req.body.trackId;
    if (trackIdIn.startsWith("https://open.spotify.com/track/")) {
        trackIdIn = trackIdIn.substring(31);
    }
    if (trackIdIn.indexOf("?") > -1) {
        trackIdIn = trackIdIn.substring(0, trackIdIn.indexOf("?"));
    }
    if (trackIdIn.startsWith("spotify:track:")) {
        trackIdIn = trackIdIn.substring(14);
    }
    var options = { method: "GET", url: "https://api.spotify.com/v1/tracks/" + trackIdIn, headers: { Authorization: "Bearer " + req.body.accessToken } };
    request(options, function (error, response, body) {
        if (error) throw new Error(error);
        if (response.statusCode != 200) {
            return res.send("Låten är inte giltig");

        }
        else {
            db.collection("submitted-songs")
                .doc(documentId)
                .update({
                    trackId: trackIdIn,
                }).catch(err => {
                    stringReturn = "User not authorized";
                    console.log("User " + documentId + " not found",);

                }).then(ref => {
                    if (!ref) {
                        return res.send("Inte medlem i SlurpGang");
                    }
                    return res.send("Sång tillagd");
                });
        }
    }
    );







});
app.post("/get_tracks", async function (req, res) {
    //var documentId = req.body.userId;
    const snapshot = await db.collection('submitted-songs').get();
    const snapshotLikes = await db.collection('votes').get();
    var allLikes = [];
    snapshotLikes.forEach(doc => {
        allLikes.push(doc.data());

    });

    var allTracks = [];
    snapshot.forEach(doc => {
        var track = doc.data();
        var totalLikes = 0;
        var users = [];
        var addedBy = doc.id;
        var display_name = doc._fieldsProto.display_name.stringValue;

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
        track.addedBy = doc.id;
        track.display_name = display_name;
        //track.who = who;
        allTracks.push(track);
    });



    // db.collection("submitted-songs")
    // .onSnapshot((snapshot) => {
    //   const data = snapshot.docs.map((doc) => ({
    //     id: doc.id,
    //     ...doc.data(),
    //   }));
    //   console.log(data);
    // });
    //return res.send({ items: snapshot.docs }, { likes: allLikes });
    return res.send({ items: allTracks });

});

app.post("/update_playlist", function (req, res) {
    function weekNumber(date = new Date()) {
        // day 0 is monday
        const day = (date.getDay() + 6) % 7
        // get thursday of present week
        const thursday = new Date(date)
        thursday.setDate(date.getDate() - day + 3)
        // set 1st january first
        const firstThursday = new Date(thursday.getFullYear(), 0, 1)
        // if Jan 1st is not a thursday...
        if (firstThursday.getDay() !== 4) {
            firstThursday.setMonth(0, 1 + (11 /* 4 + 7 */ - firstThursday.getDay()) % 7)
        }
        const weekNumber = 1 + Math.floor((thursday - firstThursday + tzDiff(firstThursday, thursday)) / WEEK)
        return weekNumber
    }
    let playlistId = "6CiGXt6v60opLz0v45JI5i";
    let loserPlaylistId = "4wBuklcIoGf4ZVXRPNzQ2r";
    let client_id = spotifyApiDetails.client_id;
    let client_secret = spotifyApiDetails.client_secret;
    let access_token = req.headers.authorization;
    let mostLikedSongs = [];
    let allSongs = [];
    let mostLikedSong = [];
    let mostLikedSongName = [];
    let mostLikedSongId = [];
    let mostLikedSongArtist = [];
    let mostlikedSongCollection = [];
    var errorCode = "";
    // var authOptions = {
    //   url: 'https://accounts.spotify.com/api/token',
    //   headers: {
    //     'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
    //   },
    //   form: {
    //     grant_type: 'client_credentials'
    //   },
    //   json: true
    // };

    // request.post(authOptions, function(error, response, body) {
    //   if (!error && response.statusCode === 200) {
    //     access_token = body.access_token;
    //   }

    // });
    request.post({ url: "https://fredagslaten.tk/get_likes", contentType: "application/json" }, function (error, response, body) {
        if (!error && response.statusCode === 200) {

            mostLikedSongs = (JSON.parse(body)).items;
            //mostLikedSongs get the most liked songs where likes are max
            mostLikedSongs.sort(function (a, b) {
                return b.likes - a.likes;
            }
            );
            mostLikedSongs.forEach(function (song) {
                if (song.likes == mostLikedSongs[0].likes) {
                    mostLikedSong.push("spotify:track:" + song.trackId);
                    mostLikedSongId.push(song.trackId);
                }
                if (song.trackId != null && song.trackId != "") {
                    allSongs.push("spotify:track:" + song.trackId);
                }
            }

            );
            console.log("allSongs: \n" + allSongs);
            let loserOptions = {
                url: 'https://api.spotify.com/v1/playlists/' + loserPlaylistId + '/tracks',
                headers: { 'Authorization': access_token },
                json: true,
                body: {
                    "uris": allSongs
                }
            };
            request.post(loserOptions, function (error, response, body) {
                if (!error && response.statusCode === 2001) {
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
            request.post(options, function (error, response, body) {
                if (!error && response.statusCode === 201) {
                    //empty trackid from submitted songs collection
                    db.collection("submitted-songs").get().then(function (querySnapshot) {
                        querySnapshot.forEach(function (doc) {
                            db.collection("submitted-songs").doc(doc.id).update({
                                trackId: ""
                            });
                        });
                    });

                    return res.send("Playlist updated");

                }
            }
            );
            let songOptions = {
                url: 'https://api.spotify.com/v1/tracks?ids=' + mostLikedSongId.join(","),
                headers: { 'Authorization': access_token, 'Content-Type': 'application/json', 'Accept': 'application/json' },
            };
            request.get(songOptions, function (error, response, body) {
                if (!error && response.statusCode === 200) {
                    body = JSON.parse(body);
                    body.tracks.forEach(function (song) {
                        mostLikedSongName.push(song.name);
                        mostLikedSongArtist.push(song.artists[0].name);
                        mostlikedSongCollection.push("<br>" + `<a href="https://open.spotify.com/track/${song.id}">` + song.name + " - " + song.artists[0].name + '</a>');

                    });
                    if (mostLikedSongName.length === 1) {
                        mailMessage = "Veckans låt är:" + mostlikedSongCollection.join(" ") + '<br><br>Lyssna på den här:   <a href="https://open.spotify.com/playlist/6CiGXt6v60opLz0v45JI5i">Fredagslåten 2 Electric boogaloo</a> <br><br>Glöm inte att lägga till och rösta på nästa veckas låtar! '
                    }
                    else {
                        mailMessage = "Veckans låtar är:" + mostlikedSongCollection.join(" ") + '<br><br>Lyssna på dem här:   <a href="https://open.spotify.com/playlist/6CiGXt6v60opLz0v45JI5i">Fredagslåten 2 Electric boogaloo</a> <br><br>Glöm inte att lägga till och rösta på nästa veckas låtar!';
                    }
                    let emailOptions = {
                        url: 'https://fredagslaten.tk/email',
                        headers: { 'Content-Type': 'application/json' },
                        json: true,
                        body: {
                            email: "linusri@kth.se, Lukas.elfving@gmail.com, frej.back@gmail.com, j.jagestedt@gmail.com",
                            // email: "j.jagestedt@gmail.com",
                            subject: "Fredagslåten vecka " + weekNumber(),
                            message: mailMessage

                        }

                    };
                    request.post(emailOptions, function (error, response, body) {
                        if (!error && response.statusCode === 200) {
                            //return res.send("Email sent");


                        }
                    }
                    );
                }
            });

            db.collection("votes").listDocuments().then(val => {
                val.map((val) => {
                    val.delete();
                })

            });






        }
    });


});


app.post("/get_likes", async function (req, res) {
    //var documentId = req.body.userId;
    const snapshot = await db.collection('submitted-songs').get();
    const snapshotLikes = await db.collection('votes').get();
    var allLikes = [];
    snapshotLikes.forEach(doc => {
        allLikes.push(doc.data());
    });

    var allTracks = [];
    snapshot.forEach(doc => {
        var track = doc.data();
        var totalLikes = 0;
        var users = [];
        var addedBy = doc.id;
        var displayNames = [];
        //var who= "";

        allLikes.forEach(function (like) {
            if (like.trackId == track.trackId) {
                totalLikes++;
                //who = like.who;
                displayNames.push(like.displayName);
                users.push(like.userId);
                //addedBy = like.userId;
            }
        });
        track.likes = totalLikes;
        track.users = users;
        track.displayNames = displayNames;
        track.addedBy = doc.id;

        //track.who = who;
        allTracks.push(track);
    });



    // db.collection("submitted-songs")
    // .onSnapshot((snapshot) => {
    //   const data = snapshot.docs.map((doc) => ({
    //     id: doc.id,
    //     ...doc.data(),
    //   }));
    //   console.log(data);
    // });
    //return res.send({ items: snapshot.docs }, { likes: allLikes });
    return res.send({ items: allTracks });

});





console.log("Listening on " + port);
app.listen(port);
