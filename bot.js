var qs = require('querystring');
var prompt = require('prompt');
var request = require('request');
var irc = require("irc");
var util = require("util");
var fs = require("fs");
var moment = require('moment-timezone');

var API = require('./api.json');
var OAUTH = require('./oauth.json');

// enable this to keep it out of the main channel
var TESTING = process.argv.slice(2).indexOf('t') > -1;

var channel = (TESTING) ? "#doubleaw" : "#reddit-hockey";

var config = {
  channels: [channel],
  server: "irc.freenode.net",
  botName: (TESTING) ? "rfstats2" : "rfstats"
};

var initOAuth = function() {
  var oauth = {
    callback: 'oob',
    consumer_key: API.key,
    consumer_secret: API.secret
  };
  var url = 'https://api.login.yahoo.com/oauth/v2/get_request_token';
  request.post({url:url, oauth:oauth}, function (e, r, body) {
    // Ideally, you would take the body in the response
    // and construct a URL that a user clicks on (like a sign in button).
    // The verifier is only available in the response after a user has
    // verified with twitter that they are authorizing your app.
    var access_token = qs.parse(body);
    var oauth = {
      consumer_key: API.key,
      consumer_secret: API.secret,
      token: access_token.oauth_token,
      token_secret: access_token.oauth_token_secret
    };
    this.log("Visit " + access_token.xoauth_request_auth_url);
    prompt.start();
    prompt.get(['verifier'], function(err, res) {
      oauth.verifier = res.verifier;
      request.post({url: 'https://api.login.yahoo.com/oauth/v2/get_token', oauth:oauth}, function (e, r, body) {
        var perm_token = qs.parse(body);
        this.log(perm_token);
        OAUTH = {
          consumer_key: API.key,
          consumer_secret: API.secret,
          token: perm_token.oauth_token,
          token_secret: perm_token.oauth_token_secret,
          session_handle: perm_token.oauth_session_handle
        };
        this.log("Authenticated.");
        fs.writeFileSync('./oauth.json', JSON.stringify(OAUTH));
      });
    });
  });
};

function Bot() {
  this.nickHash = {
    '321.l.99282.t.1': ['dan408', 'dan', 'dan408_', 'dan408__'],
    '321.l.99282.t.2': ['doubleaw', 'awaw'],
    '321.l.99282.t.3': ['leafer91'],
    '321.l.99282.t.4': ['thero'],
    '321.l.99282.t.5': ['amaninacan'],
    '321.l.99282.t.6': ['thatoneroadie']
  };
  this.help = require('./help.json');

  this.teamData = null;
  this.statIds = null;
  this.commands = require('./commands').bind(this)(this.get.bind(this), channel);
  this.log(Object.keys(this.commands).length + " commands loaded.");
}

Bot.prototype.log = function() {
  var args = Array.prototype.slice.call(arguments);
  console.log.apply(null, args);
  var now = moment().tz('America/Chicago'),
      timestamp = now.format("MM/DD/YYYY HH:mm:ss z");
  args = args.map(function(a){
    return "[" + timestamp + "] " + a;
  });
  fs.appendFile('./bot.log', Array.prototype.join.call(args, "\n") + "\n");
};

Bot.prototype.get = function(url, cb, cmdData, nickname) {
  cb = cb.bind(this);
  request.get({ url: 'http://fantasysports.yahooapis.com/fantasy/v2/' + url + '?format=json', oauth: OAUTH, json: true }, function(e, r, body) {
    if(body.error) {
      this.log(body.error);
      this.log("Token expired. Reauthenticating...");
      request.post({url: 'https://api.login.yahoo.com/oauth/v2/get_token', oauth: OAUTH}, function (e, r, body) {
        var perm_token = qs.parse(body);
        OAUTH = {
          consumer_key: API.key,
          consumer_secret: API.secret,
          token: perm_token.oauth_token,
          token_secret: perm_token.oauth_token_secret,
          session_handle: perm_token.oauth_session_handle
        };
        fs.writeFileSync('./oauth.json', JSON.stringify(OAUTH));
        this.get(url, cb, cmdData, nickname);
      }.bind(this));
    } else {
      cb.bind(this)(body.fantasy_content, cmdData, nickname || "?");
    }
  }.bind(this));
};

Bot.prototype.init = function() {
  this.log('Connecting to IRC...');
  this.client = new irc.Client(config.server, config.botName, {
    channels: config.channels
  });
  this.client.addListener('registered', this.onConnect.bind(this));
  this.client.addListener('names', this.onJoin.bind(this));
  this.client.addListener('message' + channel, this.onMessage.bind(this));
  this.client.addListener('error', function(message) {
    this.log("IRC Error: " + message);
  }.bind(this));
};

Bot.prototype.getTeam = function(data) {
  var specNick = (data.length === 0) ? '' : data[0].toLowerCase();
  return Object.keys(this.teamData).map(function(k){
    // unzip into [key, value] pairs
    return [k, this.teamData[k]];
  }, this).filter(function(i){
    // filter to find the one that either matches the full team name
    // or matches the nickname
    return i[1].name === data.join(" ") || i[1].owner.indexOf(specNick) > -1
  })[0];
};

Bot.prototype.onConnect = function(message) {
  this.log('Bot connected.');
  this.log('Getting team data...');
  this.get('league/nhl.l.99282/teams', function(data) {
    var team;
    this.teamData = {};
    for(var i = 0; i < data.league[1].teams.count; i++) {
      team = data.league[1].teams[i].team[0];
      this.teamData[team[0].team_key] = {
        name: team[2].name,
        owner: this.nickHash[team[0].team_key]
      };
    }
    this.log("Team data loaded.");
  });
  this.log("Loading league settings...");
  this.get('league/nhl.l.99282/settings', function(data) {
    var settings = data.league[1].settings[0];
    this.statIds = {};
    settings.stat_categories.stats.forEach(function(data) {
      var stat = data.stat;
      this.statIds[stat.stat_id] = stat;
    }, this);
    this.log("League settings loaded.");
  });
};

Bot.prototype.onJoin = function(channel, names) {
  this.log("Joined " + channel);
};

Bot.prototype.onMessage = function(nick, text, message) {
  if(!OAUTH) {
    return;
  }
  var msg = message.args[1].split(" ");
  if(!msg[0].match(/^\!f/)) {
    return;
  }
  var cmd = msg[0].replace(/^\!f/,'').toLowerCase();
  if(this.commands.hasOwnProperty(cmd)) {
    var c = this.commands[cmd];
    // check if alias
    if(typeof c === typeof "") {
      c = this.commands[c];
    }
    try {
      if(c.url) {
        this.get(c.url, c.fn.bind(this), msg.slice(1), message.nick);
      } else {
        c.fn.bind(this)(msg.slice(1), message.nick);
      }
    } catch(e) {
      this.log("Calling command '" + cmd + "' resulted in the following error: " + e.message);
    }
    if(message.nick === "ruhan" && Math.random() < 0.3) {
      this.client.say(channel, "And no, you can't have the Blackhawks' fourth line.");
    }
  } else {
    this.log(message.nick + " tried to use unrecognized command '" + cmd + "'.");
  }
};

Bot.prototype.reload = function() {
  delete require.cache[Object.keys(require.cache).filter(function(m){return m.match(/commands\.js/)})[0]];
  this.commands = require('./commands.js').bind(this)(this.get.bind(this), channel);
  this.log(Object.keys(this.commands).length + " commands loaded.");
  fs.readFile('./help.json', function(err, data) {
    if(err) {
      console.log('Error reading help data.');
    } else {
      this.help = JSON.parse(data);
      this.log("Help loaded.");
    }
  }.bind(this));
};

var b = new Bot();
b.init();
