(function () {
    function getHashParams() {
        var hashParams = {};
        var e, r = /([^&;=]+)=?([^&;]*)/g,
            q = window.location.hash.substring(1);
        while (e = r.exec(q)) {
            hashParams[e[1]] = decodeURIComponent(e[2]);
        }
        return hashParams;
    }
    var selectedPlaylistTracksSource = document.getElementById("selected-playlist-tracks-template").innerHTML,
        selectedPlaylistTracksTemplate = Handlebars.compile(selectedPlaylistTracksSource),
        selectedPlaylistTracksPlaceholder = document.getElementById("selected-playlist-tracks");




    var params = getHashParams();

    var access_token = params.access_token,
        error = params.error;

    var userId = "";
    var displayName = "";
    var imageURI = "";
    var playlistId = "";
    var playlistName = "";
    var spotifyApiRoot = "https://api.spotify.com/v1";


    if (error) {
        alert("There was an error during the authentication");
    } else {
        $("#add-to-playlist").hide();
        if (access_token) {
            getFredagsFromSpotify();

        } else {
            $("#loading").show();
            $("#loading").hide();
            $("#login").show();
            $("#loggedin").hide();
        }
    }
    function refresh() {
        get_tracks();
        get_likes();
        setTimeout(refresh, 15000);

    }

    async function get_likes() {

        $.ajax({
            type: "POST",
            url: "/get_likes",
            contentType: "application/json"
        }).done(function (data) {
            for (let item of data.items) {
                if (item.trackId) {
                    let users = "";
                    if (item.users.length != 0) {
                        users += `(${item.displayNames})`;
                    }
                    else {
                        users += "inga röster";
                    }
                    $("#likes-" + item.trackId + "-" + item.addedBy).html(item.likes + "<br>" + users);

                    if (item.users.includes(userId)) {
                        $("#" + item.trackId).css({ "background": "none", "color": "rgb(201, 249, 197)" });
                    }
                    else {
                        $("#" + item.trackId).css({ "background": "none", "color": "rgba(249, 197, 209, 1)" });

                    }

                }
            }
        });


    }
    async function getFredagsFromSpotify() {
        $("#login").hide();
        $("#loading").show();
        $("#selected-playlist-container").show();
        $("#add-to-playlist").show();
        playlistId = "6CiGXt6v60opLz0v45JI5i";
        $.ajax({
            url: spotifyApiRoot + "/me",
            headers: {
                "Authorization": "Bearer " + access_token
            },
            success: function (response) {
                userId = response.id;
                displayName = response.display_name;
                try{
                    imageURI = response.images[0].url;}
                catch{
                    imageURI = "";
                }
                $("#loading").hide();
                $("#loggedin").show();
            },
            error: function (response) {
                $("#login").show();
                $("#loggedin").hide();
                window.location.href = "http://fredagslaten.tk";
                alert("Du får inte tillgång till denna sida");

            }
        });
        $("#loading").hide();
        get_tracks(true);
        refresh();
    }
    function get_tracks(first) {
        $("#loading").hide();
        $.ajax({
            type: "POST",
            url: "/get_tracks",
            contentType: "application/json"
        }).done(function (data) {
            var i = 0;
            var updateData = false;
            var wrapper = '';
            data.items.forEach(function (item) {
                i++;
                item.index = i;
                if (((item.trackId == null || item.trackId == "") && document.getElementsByClassName('box boxTom ' + item.addedBy).length == 0) || (item.trackId != "" && (!document.getElementById('song-' + item.trackId + "-" + item.addedBy)))) {
                    updateData = true;
                }
                if (item.canSubmit && item.userId == userId) {
                    wrapper = '<div class="webflow-style-input"><input id="track" type="text" name="track" value="" placeholder="' + item.text + '"/></input><button class="add-to-playlist" type="submit"><i class="fa fa-arrow-right"></i></button></div>'
                }
                // else {
                //     wrapper = '<div class="webflow-style-input"><input id="track" type="text" name="track" value="" style="text-align: center; font-weight: bold;" placeholder="Försent för att byta låt" disabled/></input></div>'
                // }
            });
            if (updateData || first) {
                selectedPlaylistTracksPlaceholder.innerHTML = selectedPlaylistTracksTemplate(data);
                $('.wrapper').append(wrapper);
                get_likes();
            }
        });


    }

    $(document).on("click", ".btn-like", function (e) {
        e.preventDefault();
        vote(e.target.id, e.target.parentNode.parentNode.id + e.target.parentNode.parentNode.parentNode.id, true);
    });
    function vote(id, who, like) {
        let trackId = id;
        let data = {
            "trackId": trackId,
            "userId": userId,
            "playlistId": playlistId,
            "like": like,
            "who": who,
            "displayName": displayName,
            "imageURI": imageURI
        }

        $.ajax({
            type: "POST",
            url: "/vote",
            data: JSON.stringify(data),
            contentType: "application/json"
        }).done(function (data) {
            get_likes();
            if (data == "ok") {
            }
            else if (data == "Du kan inte rösta på din egen låt!") {
                alert(data);
            }
            else if (data == "Röst borttagen") {
            }
            else {
                alert("Något gick fel");
            };

        });
    }
    $(document).on("click", ".add-to-playlist", function (e) {
        e.preventDefault();
        add_song(document.getElementById('track').value);

    });
    function add_song(id) {
        var trackId = id;
        var data = {
            "trackId": trackId,
            "userId": userId,
            "accessToken": access_token
        }

        $.ajax({
            type: "POST",
            url: "/add_song",
            data: JSON.stringify(data),
            contentType: "application/json"

        }).done(function (response) {
            get_tracks();
            alert(response.toString());

        });

    }
})();
