var gulp = require('gulp');
var likes = require('./likes');

gulp.task('default', ['likes'], function() {
  //
});

gulp.task('likes', function() {
  likes.getLikes();
})