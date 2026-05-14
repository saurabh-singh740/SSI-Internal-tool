// Hide the pre-React loading indicator once the DOM is ready.
// Runs as an external script to comply with Content-Security-Policy script-src 'self'.
document.addEventListener('DOMContentLoaded', function () {
  var el = document.getElementById('app-loading');
  if (el) el.style.display = 'none';
});
