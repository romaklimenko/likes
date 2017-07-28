const gulp = require('gulp');
const likes = require('./likes');

gulp.task('default', function(done) {
  likes.getLikes();
  done();
});