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

var wait = [20,60];  // min, max millisecond between tumblr API calls
var total_likes = "unknown";
var downloaded = 0;
var remaining = true;
var likes = [];
var chunksize = 3;
var opts = {"limit": chunksize};
// var offset = 0;

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
    console.log(chalk.blue("downloading & sorting likes data via api in increments of " + chunksize + "\nsorted liked_post timestamps:"));
    promiseWhile(function(){

      // console.log("(" + chalk.gray(downloaded + "/" + total_likes) + ") ~" + moment.duration((wait[1]-wait[0])/2 * (total_likes - downloaded), "seconds").humanize() + " left");
      return remaining;
    }, function() {
      return new Promise(function(resolve, reject) {
        var logline = "";
        var prev_likes = likes.length;
        // console.log("prev_likes: " + prev_likes);
        // console.dir(opts);
        client.likes(opts, function (err, data) {
          if(err !== null) console.log(chalk.red(err));

          if((data.liked_posts.length > 0) && (downloaded < 100)){

            for (var i = 0; i < data.liked_posts.length; i++) {
              likes.push(data.liked_posts[i]);
              downloaded++;

              // wait a random while before next request
              var zzz = Math.floor(Math.random()*(wait[1]-wait[0])*1000) + wait[0]*1000;
              // logline = likes.length-1 + ":" + likes[likes.length-1].liked_timestamp;
              // console.log( '(' + i + ")\t".concat(logline + "\t\tzzz " + zzz/1000 + "ms"));
              sleep.usleep(zzz);
            }

            likes.sort(function(a,b){
              return b.liked_timestamp - a.liked_timestamp;  // more recent timestamps go to beginning of array
              // console.log("-- a: " + a.liked_timestamp);
            });
            likes = likes.filter(function(element, index, array){  // dedupe
              if(index === 0) {
                return true;
              }else{
                return !(element.liked_timestamp === array[index-1].liked_timestamp);
              }
            });
            // console.dir(likes);
            opts.before = parseInt(likes[likes.length-1].liked_timestamp);
            // console.log("--- opts.before: " + opts.before);
            // console.log("--- likes.length: " + likes.length);
            // console.log("  --offset: " + (prev_likes));

            logObjArray(likes.slice(prev_likes), "liked_timestamp", prev_likes);

          }else{
            remaining = false;
          }
          resolve();
        });
      })
    }).then(function() {
    // this will run after completion of the promiseWhile Promise
      // logObjArray(likes, "liked_timestamp");
      console.log(chalk.green("  finished downloading metadata..."));
    });
  }
};



  //   }).then(function() {
  //     // this will run after completion of the promiseWhile Promise
  //     likes.sort(function(a,b){
  //       a.liked_timestamp - b.liked_timestamp;
  //     });
  //   });
  // },
  // downLikes: function(){
  //   promiseWhile(function(){
  //     console.log(chalk.blue("downloading and saving the photos..."));
  //     // console.log("(" + chalk.gray(downloaded + "/" + total_likes) + ") ~" + moment.duration((wait[1]-wait[0])/2 * (total_likes - downloaded), "seconds").humanize() + " left");
  //     return downloaded <= likes.length; // finished when false
  //   }, function() {
  //     return new Promise(function(resolve, reject) {
  //       var logline = "";
  //
  //       for (var i = 0; i < likes.length; i++) {
  //         var element = likes[i];
  //
  //         if(element.photos !== undefined && element.photos.length !== 0) {
  //           var photos = element.photos;
  //           var response, file;
  //           for (var j = 0; j < photos.length; j++) {
  //             var photo = photos[j];
  //             file = "media/" + path.basename(url.parse(photo.original_size.url).pathname);
  //             response = request('GET', photo.original_size.url);
  //             fs.writeFileSync(file, response.body);
  //             if(j=0) logline = "  " + file;
  //           }
  //         }
  //
  //         else if(element.video_url !== undefined) {
  //           file = "media/" + path.basename(url.parse(element.video_url).pathname);
  //           logline = "  " + file;
  //           response = request('GET', element.video_url);
  //           fs.writeFileSync(file, response.body);
  //         }
  //
  //         else {
  //           logline = "  can't process this type: " + element.type;
  //           continue;
  //         }
  //
  //         if(state.config.unlike_favorites) {
  //           client.unlike(element.id, element.reblog_key, function (err, _data) {
  //            if(err !== null) console.log(chalk.red(err));
  //            console.log(chalk.red("  " + element.id + " unliked."));
  //           });
  //         }
  //
  //         downloaded++;
  //
  //         var zzz = Math.floor(Math.random()*(wait[1]-wait[0])*1000) + wait[0]*1000;
  //         console.log(logline.concat('  (' + data.liked_posts.length + ")\t\tzzz " + zzz/1000 + "ms"));
  //         sleep.usleep(zzz);
  //       };
  //       resolve();
  //     });
  //   }).then(function() {
  //     console.log("all done.")
  //   });
  // }
// };



var writeState = function(){
  try {
    fs.writeFileSync('./state.json', JSON.stringify(state));
    console.log(chalk.green('state saved.'));
  }
  catch (err) {
    console.log(chalk.bgRed('There was an error saving state.json.'));
    console.log(chalk.red(err));
  }
};

var logObjArray = function(arr, key, offset, cols){
  var line = "";
  var cols = typeof cols !== 'undefined' ? cols : 3;
  var offset = typeof offset !== 'undefined' ? offset : 0;
  arr.forEach(function(element, index, array){
    var offset_index = index + offset;

    if(index > 0){
      var delta = (element[key] - array[index-1][key]);
      if(delta > 0){
        line = line.concat(offset_index + ": " + chalk.bgRed(element[key]) + "\t ");
      }else{
        line = line.concat(offset_index + ": " + chalk.gray(element[key]) + "\t ");
      }
    }else{
      line = line.concat(offset_index + ": " + chalk.gray(element[key]) + "\t ");
    }

    if( ((index+1) % cols === 0) || (index === arr.length-1)){
      console.log("\t " + line);
      line = "";
    }
  });
};



// for (var i = 0; i < data.liked_posts.length; i++) {
//   var element = data.liked_posts[i];
//
//   if(element.photos !== undefined && element.photos.length !== 0) {
//     var photos = element.photos;
//     var response, file;
//     downloaded++;
//     for (var j = 0; j < photos.length; j++) {
//       var photo = photos[j];
//       file = "media/" + path.basename(url.parse(photo.original_size.url).pathname);
//       response = request('GET', photo.original_size.url);
//       fs.writeFileSync(file, response.body);
//       if(j=0) logline = "  " + file;
//     }
//   }
//   else if(element.video_url !== undefined) {
//     file = "media/" + path.basename(url.parse(element.video_url).pathname);
//     logline = "  " + file;
//     response = request('GET', element.video_url);
//     fs.writeFileSync(file, response.body);
//     downloaded++;
//   }
//   else {
//     logline = "  can't process this type: " + element.type;
//     continue;
//   }
//
//   if(state.config.unlike_favorites) {
//     client.unlike(element.id, element.reblog_key, function (err, _data) {
//      if(err !== null) console.log(chalk.red(err));
//      console.log(chalk.red("  " + element.id + " unliked."));
//     });
//   }
//   // wait a random while before next request
//   var zzz = Math.floor(Math.random()*(wait[1]-wait[0])) + wait[0];
//   console.log(logline.concat('  (' + data.liked_posts.length + ")\t\tzzz " + zzz + "s"));
//   sleep.sleep(zzz);
// }
// writeState();
