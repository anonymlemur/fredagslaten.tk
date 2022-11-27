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
    //get_likes();
    // var userPlaylistsSource = document.getElementById("user-playlists-template").innerHTML,
    //     userPlaylistsTemplate = Handlebars.compile(userPlaylistsSource),
    //     userPlaylistsPlaceholder = document.getElementById("user-playlists");

    var selectedPlaylistTracksSource = document.getElementById("selected-playlist-tracks-template").innerHTML,
        selectedPlaylistTracksTemplate = Handlebars.compile(selectedPlaylistTracksSource),
        selectedPlaylistTracksPlaceholder = document.getElementById("selected-playlist-tracks");

    var params = getHashParams();

    var access_token = params.access_token,
        error = params.error;

    var userId = "";
    var playlistId = "";
    var playlistName = "";
    var spotifyApiRoot = "https://api.spotify.com/v1";

    if (error) {
        alert("There was an error during the authentication");
    } else {
        $("#add-to-playlist").hide();
        if (access_token) {
            //getPlaylistsFromSpotify();
            getFredagsFromSpotify();
            //get_likes();

        } else {
            $("#login").show();
            $("#loggedin").hide();
        }
    }
    async function get_likes() {

        $.ajax({
            type: "POST",
            url: "/get_likes",
            contentType: "application/json"
        }).done(function (data) {
            for (let item of data.items) {
                let users = "";
                if (item.users.length != 0) {
                    users += `(${item.users})`;
                }
                else {
                    users += "inga röster";
                }
                $("#likes-" + item.trackId + "-" + item.addedBy).html(item.likes + "<br>" + users);
            }
        });
    }
    async function getFredagsFromSpotify() {
        //$("#user-playlists").hide();
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
                console.log(response);
                $("#login").hide();
                $("#loggedin").show();
            },
            error: function (response) {
                $("#login").show();
                $("#loggedin").hide();
                window.location.href = "http://fredagslaten.tk";
                alert("Du får inte tillgång till denna sida");

                console.log(response);
            }
        });
        $.ajax({
            type: "POST",
            url: "/get_tracks",
            contentType: "application/json"
        }).done(function (data) {
            selectedPlaylistTracksPlaceholder.innerHTML = selectedPlaylistTracksTemplate(data);
        });
        setTimeout(() => { get_likes(); }, 50);
    }


    $(document).on("click", ".btn-like", function (e) {
        e.preventDefault();
        vote(e.target.id, e.target.parentNode.parentNode.id + e.target.parentNode.parentNode.parentNode.id, true);
        get_likes();
    });
    async function vote(id, who, like) {
        let trackId = id;
        let data = {
            "trackId": trackId,
            "userId": userId,
            "playlistId": playlistId,
            "like": like,
            "who": who
        }

        $.ajax({
            type: "POST",
            url: "/vote",
            data: JSON.stringify(data),
            contentType: "application/json"
        }).done(function (data) {
            if(data == "ok"){
                console.log("ok");
            }
            else if(data == "Du kan inte rösta på din egen låt!")
            {
                alert(data);
            }
            else{
                alert("Något gick fel");
            };

        });
    }
    $(document).on("click", ".add-to-playlist", function (e) {
        e.preventDefault();
        add_song(document.getElementById('track').value);
        //getFredagsFromSpotify();

    });
    function add_song(id) {
        var trackId = id;
        var data = {
            "trackId": trackId,
            "userId": userId
        }

        $.ajax({
            type: "POST",
            url: "/add_song",
            data: JSON.stringify(data),
            contentType: "application/json"

        }).done(function (response) {
            console.log(response);
            alert(response.toString());
            //document.getElementById('add-song-status').textContent = response.toString();
            getFredagsFromSpotify();
        });

    }
})();