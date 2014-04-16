var qs = require('querystring');
var prompt = require('prompt');
var request = require('request');
var irc = require("irc");
var util = require("util");
var fs = require("fs");
var moment = require('moment-timezone');

var argv = require('optimist').default('testing', false).alias('testing', 't').argv;

var API = require('./api.json');
var OAUTH = require('./oauth.json');

// enable this to keep it out of the main channel
var TESTING = argv.testing;

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
    console.log("Visit " + access_token.xoauth_request_auth_url + " and click agree, then enter the code you see below.");
    prompt.message = prompt.delimiter = "";
    prompt.start();
    prompt.get({
      properties: {
        verifier: {
          description: "Please enter the verifier code:"
        }
      }
    }, function(err, res) {
      oauth.verifier = res.verifier;
      request.post({url: 'https://api.login.yahoo.com/oauth/v2/get_token', oauth:oauth}, function (e, r, body) {
        var perm_token = qs.parse(body);
        OAUTH = {
          consumer_key: API.key,
          consumer_secret: API.secret,
          token: perm_token.oauth_token,
          token_secret: perm_token.oauth_token_secret,
          session_handle: perm_token.oauth_session_handle
        };
        console.log("Authenticated. Please restart the bot without the auth command.");
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
  request.get({ url: 'http://fantasysports.yahooapis.com/fantasy/v2/' + url + '?format=json', oauth: OAUTH, json: true, timeout: 2000 }, function(e, r, body) {
    if(e) {
      if(e.code === "ETIMEDOUT") {
        this.talk("Looks like Yahoo is being terribly slow. Try again later?");
      } else {
        this.log(e);
      }
      return;
    }
    if(body.error) {
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

Bot.prototype.onIRCError = function(message) {
  if(message.command === 'err_nosuchnick') {
    // tried to message a user that doesn't exist, which is ignored
    // because this is not really a bad thing (usually happens on error logging)
    return;
  }
  this.log("Unhandled IRC Error: [" + message.command + "] " + message.args.join(":"));
};

Bot.prototype.init = function() {
  this.log('Connecting to IRC...');
  this.client = new irc.Client(config.server, config.botName, {
    channels: config.channels
  });
  this.client.addListener('registered', this.onConnect.bind(this));
  this.client.addListener('names', this.onJoin.bind(this));
  this.client.addListener('message' + channel, this.onMessage.bind(this));
  this.client.addListener('error', this.onIRCError.bind(this));
};

Bot.prototype.getTeam = function(data) {
  var specNick = (data.length === 0) ? '' : data[0].toLowerCase();
  return Object.keys(this.teamData).map(function(k){
    // unzip into [key, value] pairs
    return [k, this.teamData[k]];
  }, this).filter(function(i){
    // filter to find the one that either matches the full team name
    // or matches the nickname
    return i[1].name === data.join(" ") || i[1].owner.indexOf(specNick) > -1;
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
  this.channel = channel;
};

Bot.prototype.talk = function(msg) {
  this.client.say(this.channel, msg);
};

Bot.prototype.onMessage = function(nick, text, message) {
  if(!OAUTH) {
    return;
  }
  var msg = message.args[1].split(" ");
  if(!msg[0].match(/^\!/)) {
    return;
  }
  var cmd = msg[0].replace(/^\!/,'').toLowerCase();
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
      throw e; // so uncaught exception handler sees this and displays the relevant messages
    }
    if(message.nick === "ruhan" && Math.random() < 0.3) {
      this.talk("And no, you can't have the Blackhawks' fourth line.");
    }
  } else {
    this.log(message.nick + " tried to use unrecognized command '" + cmd + "'.");
  }
};

Bot.prototype.reload = function() {
  delete require.cache[Object.keys(require.cache).filter(function(m) {
    return m.match(/commands\.js/);
  })[0]];
  this.commands = require('./commands.js').bind(this)(this.get.bind(this));
  this.log(Object.keys(this.commands).length + " commands loaded.");
  fs.readFile('./help.json', function(err, data) {
    if(err) {
      this.log('Error reading help data.');
      throw err;
    } else {
      this.help = JSON.parse(data);
      this.log("Help loaded.");
    }
  }.bind(this));
};

if(argv._.indexOf('auth') > -1) {
  initOAuth();
} else {
  var b = new Bot();
  b.init();

  // Process handlers
  process.on('exit', function(code) {
    this.log("Exiting with code: " + code);
  }.bind(b));

  process.on('SIGINT', function(code) {
    this.log("Bot manually killed with SIGINT");
    this.client.disconnect("Adios");
    process.exit(1);
  }.bind(b));

  process.on('SIGTERM', function(code) {
    this.log("Bot manually killed with SIGTERM");
    this.client.disconnect("Adios");
    process.exit(1);
  }.bind(b));

  process.on('uncaughtException', function(e) {
    this.log('Caught exception: ' + e);
    this.talk("Sorry, an error occurred while trying to execute that command. It won't work again with those arguments until fixed, so please wait for my owner to fix it and reload my commands.");
    this.client.say("DoubleAW", "An error occurred, see my logs.");
    this.client.say("AWAW", "An error occurred, see my logs.");
  }.bind(b));
}