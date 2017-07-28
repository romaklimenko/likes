var http = require('http');
var fs = require('fs');
var url = require("url");
var path = require("path");

var request = require('sync-request');

var secret = require('./secret');

// Authenticate via OAuth
var tumblr = require('tumblr.js');
var client = tumblr.createClient({
  consumer_key: secret.consumer_key,
  consumer_secret: secret.consumer_secret,
  token: secret.token,
  token_secret: secret.token_secret
});

module.exports = {
  getLikes: function() {
    client.userLikes({ }, function (err, data) {
      console.log(" likes: " + data.liked_posts.length);
      for (var i = 0; i < data.liked_posts.length; i++) {
        var element = data.liked_posts[i];
        if(element.photos !== undefined && element.photos.length !== 0) {
          var photos = element.photos;

          var response, file;

          for (var j = 0; j < photos.length; j++) {
            var photo = photos[j];
            file = secret.output_dir + path.basename(url.parse(photo.original_size.url).pathname);
            console.log("  " + file);
            response = request('GET', photo.original_size.url);
            fs.writeFileSync(file, response.body);
          }
        }
        else if(element.video_url !== undefined) {
          file = secret.output_dir + path.basename(url.parse(element.video_url).pathname);
          console.log("  " + file);
          response = request('GET', element.video_url);
          fs.writeFileSync(file, response.body);
        }
        else {
          console.log("  can't process this type: " + element.type);
          continue;
        }

        client.unlikePost(element.id, element.reblog_key,function (err, _data) {
          if (err !== null) console.log(err);
        });
      }
    });
  }
};
