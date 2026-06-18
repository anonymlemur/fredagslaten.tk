var client_id=  "4af1fa56c85f494995bfc774b5043bea";
var client_secret = "1f5f5fd76b8c4d4eaa2ad9398afce8e2";
var request = require('request');
var authOptions = {
  url: 'https://accounts.spotify.com/api/token',
  headers: {
    'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
  },
  form: {
    grant_type: 'client_credentials'
  },
  json: true
};

request.post(authOptions, function (error, response, body) {
  if (!error && response.statusCode === 200) {
    var token = body.access_token;
  }
  console.log(token);
});