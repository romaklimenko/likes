var http = require('http');
var fs = require('fs');
var url = require("url");
var path = require("path");
var sleep = require('sleep');
var moment = require('moment');
var chalk = require('chalk');
var Promise = require('bluebird');
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

var state;
try {
  state = JSON.parse(fs.readFileSync('./state.json'));
  console.dir(state);
}
catch (err) {
  console.log(chalk.bgRed('There has been an error parsing your state.json.'));
  console.log(chalk.red(err));
}

var wait = [1,4]  // min, max seconds between tumblr API calls TODO move to json
var current_timestamp = state.last_timestamp + 1; // hack
var total_likes = "unknown";
var downloaded = 0;

process.on('SIGINT', function() {
  console.log('Got SIGINT.  Saving state. Press Control-D to exit.');
  writeState();
  process.exit(2);
});

// promise time... http://blog.victorquinn.com/javascript-promise-while-loop
var promiseWhile = function(condition, action) {
    var resolver = Promise.defer();

    var loop = function() {
        if (!condition()) return resolver.resolve();
        return Promise.cast(action())
            .then(loop)
            .catch(resolver.reject);
    };

    process.nextTick(loop);

    return resolver.promise;
};

module.exports = {
  getLikes: function(){
    promiseWhile(function(){
      console.log("(" + chalk.gray(downloaded + "/" + total_likes) + ") ~" + moment.duration((wait[1]-wait[0])/2 * (total_likes - downloaded), "seconds").humanize() + " left");
      return current_timestamp > state.last_timestamp;  // promiseWhile exits "loop" when false
    }, function() {
      //////////////////////////////////////////////////////////////////////////
      return new Promise(function(resolve, reject) {
        opts = {"before": current_timestamp, "limit": 10};
        // first loop gets most-recent likes, then we go in reverse-
        // chronological order using current_timestamp
        if(total_likes === 'unknown') opts = {"limit": 10};

        client.likes(opts, function (err, data) {
          if(err !== null) console.log(chalk.red(err));

          console.log("  getting " + data.liked_posts.length + " likes before " + current_timestamp);
          var logline = "";

          if(total_likes === 'unknown') total_likes = data.liked_count;

          if(data.liked_posts.length > 0){ // check if we got them all or invalid query

            for (var i = 0; i < data.liked_posts.length; i++) {
              var element = data.liked_posts[i];
              current_timestamp = element.liked_timestamp;

              // save where we are starting from, should only run once
              if(current_timestamp > state.top_timestamp){
                state.top_timestamp = current_timestamp;
              }

              // need to fetch more?
              if(current_timestamp > state.last_timestamp){

                if(element.photos !== undefined && element.photos.length !== 0) {
                  var photos = element.photos;
                  var response, file;
                  downloaded++;

                  for (var j = 0; j < photos.length; j++) {
                    var photo = photos[j];
                    file = "media/" + path.basename(url.parse(photo.original_size.url).pathname);
                    logline = "  " + file;
                    response = request('GET', photo.original_size.url);
                    fs.writeFileSync(file, response.body);
                  }
                  if (photos.length > 1) logline.concat("\t(" + photos.length + ')');
                }
                else if(element.video_url !== undefined) {
                  file = "media/" + path.basename(url.parse(element.video_url).pathname);
                  logline = "  " + file;
                  response = request('GET', element.video_url);
                  fs.writeFileSync(file, response.body);
                  downloaded++;
                }
                else {
                  logline = "  can't process this type: " + element.type;
                  continue;
                }

                if(state.config.unlike_favorites) {
                  client.unlike(element.id, element.reblog_key, function (err, _data) {
                   if(err !== null) console.log(chalk.red(err));
                   console.log(chalk.red("  " + element.id + " unliked."));
                  });
                }

                // wait a random while before next request
                var zzz = Math.floor(Math.random()*(wait[1]-wait[0])) + wait[0];
                console.log(logline.concat("\t\tzzz " + zzz + "s"));
                sleep.sleep(zzz);
              }
            }
          }
          resolve();
        });
        //////////////////////////////////////////////////////////////////////////
      });
    }).then(function() {
      // this will run after completion of the promiseWhile Promise!
      // note space between before () - self invoking function expression!
      // more info https://javascriptweblog.wordpress.com/2010/07/06/function-declarations-vs-function-expressions/
      writeState();
    });
  }
};



var writeState = function(){
  // helps us out in case program exits prematurely
  state.last_timestamp = state.top_timestamp;
  try {
    fs.writeFileSync('./state.json', JSON.stringify(state));
    console.log(chalk.green('Configuration saved successfully.'));
  }
  catch (err) {
    console.log(chalk.bgRed('There was an error saving state.json.'));
    console.log(chalk.red(err));
  }
};
