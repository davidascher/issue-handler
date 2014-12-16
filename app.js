console.log('starting the app');
var Hapi = require('hapi');
var Firebase = require('firebase');
var ref = new Firebase('https://debt.firebaseIO.com/');
var request = require('request')

console.log('loading an environment');
var habitat = require('habitat');
habitat.load('.env');

var env = new habitat('firebase');
var firebase_secret = env.get('secret');

var github = new habitat('github');
var token = github.get('token');

console.log("about to auth with firebase");
ref.authWithCustomToken(firebase_secret, function(error, authData) {
  if (error) {
    console.log("Login Failed!", error);
  } else {
    console.log("Authenticated successfully with firebase.");
    // console.log("Authenticated successfully with payload:", authData);
  }
});

var issues = ref.child('issues');
var asks = ref.child('asks');
asks.once('value', function(snapshot) {
  if (snapshot.val() == null) {
    asks.set({}); 
  }
});
// Create a server with a host and port
var server = new Hapi.Server();
server.connection({ 
    host: '0.0.0.0', 
    port: process.env.PORT || 8000
});
console.log(process.env.PORT)

// Add the route
server.route({
    method: 'GET',
    path:'/hello', 
    handler: function (request, reply) {
       reply('hello world');
    }
});

var parseComment = function(repository, issue, comment, patchComment) {
  var fromwhom = comment.user.login;
  console.log("Comment on issue: ", repository.name+'/'+String(issue.number) + ' by ' + fromwhom);
  // We'll clear any of the mentions of the author referring to this issue
  var asks_ref = ref.child('asks').child(fromwhom)
  asks_ref.on('value', function(snapshot) {
    var asks_of_author = snapshot.val();
    for (var key in asks_of_author) {
      var ask = asks_of_author[key];
      console.log(ask, ask.issue_id, issue.id)
      if (ask.issue_id == issue.id) {
        // removing an ask
        asks_ref.child(key).remove();
      }
    }
  })
  // For a comment, extract if there are any requests embedded, note who's asking, and add them to a per-askee queue
  var body = comment.body;
  var lines = body.split('\n');
  var newlines = [];
  // console.log(body);

  // We'll add mentions for each of the people mentioned in a comment
  lines.forEach(function (line) {
    // look for things of the syntax <something>? @alias
    // turn " ui-review? @bar;" into [ "", "ui-review", "?", "bar", ";" ]
    re = /\s*([-\w]*)([+-\?])[\s]?=*@(\w*)/i;
    var parts = line.split(re)
    if (parts.length > 1) {
      var question = parts[1];
      var flag = parts[2];
      var towhom = parts[3];
      asks.child(towhom).push({'question':question, 
        'flag': flag, 
        'issue_id': issue.id,
        'issue': repository.name + '/' + String(issue.number),
        'fromwhom':fromwhom, 
        'ref_html_url': comment.html_url, 
        'ref_url': comment.url})
      line = line + " `[this was magically recorded as a request]`:wave:";
      newlines.push(line);
    }
  });
  // just check for mentions, regardless of syntax:
  matches = body.match(/(@(\w+))/gi);

  if (matches) {
    matches.forEach(function (match) {
      towhom = match.slice(1,match.length),  // get rid of @;
      asks.child(towhom).push({
        'question': 'mention',
        'issue_id': issue.id,
        'issue': repository.name + '/' + String(issue.number),
        'fromwhom': fromwhom,
        'ref_html_url': comment.html_url, 
        'ref_url': comment.url
      })
    })
  }
    // if (parts.length > 1) {
    //   console.log(parts);
      // var question = parts[1];
      // var flag = parts[2];
      // var towhom = parts[3];
      // console.log(question, flag, towhom);
      // asks.child(towhom).push({'question':question, 
      //   'flag': flag, 
      //   'issue_id': issue.id,
      //   'issue': repository.name + '/' + String(issue.number),
      //   'fromwhom':fromwhom, 
      //   'ref_html_url': comment.html_url, 
      //   'ref_url': comment.url})
      // line = line + " `[this was magically recorded as a request]`:wave:";
      // newlines.push(line);
  if (patchComment) {
    // update the comment to comment to indicate it's been processed
    var newbody = newlines.join('\n');
    var owner = repository.owner.login;
    var repo = repository.name;
    var url = "https://api.github.com/repos/" + owner + '/' + repo + '/issues/comments/' + comment.id;
    url += "?access_token="+encodeURIComponent(token);
    var options = {
      url: url,
      json: true,
      body: {body: newbody},
      headers: {
          'User-Agent': 'NodeJS HTTP Client'
      }
    };
    request.patch(options, function(err, ret) {
      if (err) {
        console.log(err);
      } else {
        console.log('patched comment!')
      }
    });
  }
}

server.route({
    method: 'POST',
    path:'/postreceive', 
    handler: function (request, reply) {
      var eventType = request.headers['x-github-event'];
      if (eventType == 'issues') {
        var issue = issues.child(request.payload.issue.id)
        issue.set(request.payload.issue);
      } else if (eventType == 'issue_comment') {
        var issue = issues.child(request.payload.issue.id);
        issue.transaction(function(currentIssue) {
          if (currentIssue == null) {
            issue.set(request.payload.issue);
          }
          issue.child('comments').child(request.payload.comment.id).set(request.payload.comment);
          parseComment(request.payload.repository, request.payload.issue, request.payload.comment, true);
        })
      }
      reply('OK');
    }
});

server.route({
    method: 'GET',
    path: '/{param*}',
    handler: {
        directory: {
            path: 'public'
        }
    }
});

server.route({
    method: 'POST',
    path:'/add_repo', 
    handler: function (req, reply) {
      var org = req.payload.org;
      var repo = req.payload.repo;
      // first get repo info
      var url = "https://api.github.com/repos/" + org + '/' + repo;
      url += "?access_token="+encodeURIComponent(token);
      var options = {
        url: url,
        json: true,
        headers: {
            'User-Agent': 'NodeJS HTTP Client'
        }
      };
      request.get(options, function(err, ret) {
        // now, get the issues
        var repository = ret.body;
        url = repository.url + '/issues';
        url += "?access_token="+encodeURIComponent(token);
        var options = {
          url: url,
          json: true,
          headers: {
              'User-Agent': 'NodeJS HTTP Client'
          }
        };
        request.get(options, function(err, ret) {
          if (err) {
            console.log(err);
          } else {
            // we have the issues
            for (var i=0; i<ret.body.length; i++) {
              var issue = ret.body[i];
              parseComment(repository, issue, issue, false);
              // then get the comments
              url = issue.url + "/comments?access_token="+encodeURIComponent(token);
              var options = {
                url: url,
                json: true,
                headers: {
                    'User-Agent': 'NodeJS HTTP Client'
                }
              };
              (function(issue) {
                request.get(options, function(err, ret) {
                  if (err) {
                    console.log(err);
                  } else {
                    // we have the comments
                    for (var i=0; i<ret.body.length; i++) {
                      var comment = ret.body[i];
                      parseComment(repository, issue, comment, false);
                    }
                  }
                });
              })(issue);
            }
          }
        });
      });
      reply('OK');
    }});

server.route({
    method: 'GET',
    path:'/add_repo', 
    handler: function (request, reply) {
      // serve form that suggests we add repos
      reply.file('add_repo.html');
    }
});

// Start the server
server.start();

