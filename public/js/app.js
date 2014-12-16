/** @jsx React.DOM */

function getQueryVariable(variable) {
    var query = window.location.search.substring(1);
    var vars = query.split('&');
    for (var i = 0; i < vars.length; i++) {
        var pair = vars[i].split('=');
        if (decodeURIComponent(pair[0]) == variable) {
            return decodeURIComponent(pair[1]);
        }
    }
}

function setup() {
  var handle = document.getElementById("handle")
  var handleVal= getQueryVariable('handle');
  handle.textContent = handleVal;
  React.render(
    <MentionsApp handle={handleVal}/>, 
    document.getElementById('obligations')
  );
}

setup();
