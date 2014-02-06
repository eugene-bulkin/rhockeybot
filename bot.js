var qs = require('querystring');
var prompt = require('prompt');
var request = require('request');
var irc = require("irc");
var util = require("util");
var fs = require("fs");

var OAUTH = require('./oauth.json');

var Bot = {};

var chanName = "#doubleaw";

var config = {
  channels: [chanName],
  server: "irc.freenode.net",
  botName: "MCDangerbutter"
};

var teamData, statIds;

var nick_hash = {
  '321.l.99282.t.1': ['dan408', 'dan'],
  '321.l.99282.t.2': ['doubleaw', 'awaw'],
  '321.l.99282.t.3': ['leafer91'],
  '321.l.99282.t.4': ['thero'],
  '321.l.99282.t.5': ['amaninacan'],
  '321.l.99282.t.6': ['thatoneroadie']
};

function get(url, cb, cmdData, nickname) {
  request.get({ url: url + '?format=json', oauth: OAUTH, json: true }, function(e, r, body) {
    if(body.error) {
      console.log("Token expired. Reauthenticating...");
      request.post({url: 'https://api.login.yahoo.com/oauth/v2/get_token', oauth: OAUTH}, function (e, r, body) {
        var perm_token = qs.parse(body);
        OAUTH = {
          consumer_key: 'dj0yJmk9b0M2S3Y5N2dNOEp0JmQ9WVdrOWFtWklSVTkyTm0wbWNHbzlNQS0tJnM9Y29uc3VtZXJzZWNyZXQmeD1jNQ--',
          consumer_secret: 'ad4d6689ccb3b85ef6365fb14e1e615b7b833009',
          token: perm_token.oauth_token,
          token_secret: perm_token.oauth_token_secret,
          session_handle: perm_token.oauth_session_handle
        };
        console.log("Authenticated.");
        fs.writeFileSync('./oauth.json', JSON.stringify(OAUTH));
        get(url, cb, cmdData, nickname);
      });
    } else {
      cb(body.fantasy_content, cmdData, nickname || "?");
    }
  });
}

console.log('Connecting to IRC...');
var bot = new irc.Client(config.server, config.botName, {
  channels: config.channels
});

function getOAuth() {
  var oauth = {
    callback: 'oob',
    consumer_key: 'dj0yJmk9b0M2S3Y5N2dNOEp0JmQ9WVdrOWFtWklSVTkyTm0wbWNHbzlNQS0tJnM9Y29uc3VtZXJzZWNyZXQmeD1jNQ--',
    consumer_secret: 'ad4d6689ccb3b85ef6365fb14e1e615b7b833009'
  };
  var url = 'https://api.login.yahoo.com/oauth/v2/get_request_token';
  request.post({url:url, oauth:oauth}, function (e, r, body) {
    // Ideally, you would take the body in the response
    // and construct a URL that a user clicks on (like a sign in button).
    // The verifier is only available in the response after a user has
    // verified with twitter that they are authorizing your app.
    var access_token = qs.parse(body);
    var oauth = {
      consumer_key: 'dj0yJmk9b0M2S3Y5N2dNOEp0JmQ9WVdrOWFtWklSVTkyTm0wbWNHbzlNQS0tJnM9Y29uc3VtZXJzZWNyZXQmeD1jNQ--',
      consumer_secret: 'ad4d6689ccb3b85ef6365fb14e1e615b7b833009',
      token: access_token.oauth_token,
      token_secret: access_token.oauth_token_secret
    };
    console.log("Visit " + access_token.xoauth_request_auth_url);
    prompt.start();
    prompt.get(['verifier'], function(err, res) {
      oauth.verifier = res.verifier;
      request.post({url: 'https://api.login.yahoo.com/oauth/v2/get_token', oauth:oauth}, function (e, r, body) {
        var perm_token = qs.parse(body);
        console.log(perm_token);
        OAUTH = {
          consumer_key: 'dj0yJmk9b0M2S3Y5N2dNOEp0JmQ9WVdrOWFtWklSVTkyTm0wbWNHbzlNQS0tJnM9Y29uc3VtZXJzZWNyZXQmeD1jNQ--',
          consumer_secret: 'ad4d6689ccb3b85ef6365fb14e1e615b7b833009',
          token: perm_token.oauth_token,
          token_secret: perm_token.oauth_token_secret,
          session_handle: perm_token.oauth_session_handle
        };
        console.log("Authenticated.");
        fs.writeFileSync('./oauth.json', JSON.stringify(OAUTH));
      });
    });
  });
}

bot.addListener('registered', function(message) {
  console.log('Bot connected.');
  console.log('Getting team data...');
  get('http://fantasysports.yahooapis.com/fantasy/v2/league/nhl.l.99282/teams', function(data) {
    var team;
    teamData = {};
    for(var i = 0; i < data.league[1].teams.count; i++) {
      team = data.league[1].teams[i].team[0];
      teamData[team[0].team_key] = {
        name: team[2].name,
        owner: nick_hash[team[0].team_key]
      };
    }
  });
  console.log("Loading league settings...");
  get('http://fantasysports.yahooapis.com/fantasy/v2/league/nhl.l.99282/settings', function(data) {
    var settings = data.league[1].settings[0];
    statIds = {};
    settings.stat_categories.stats.forEach(function(data) {
      var stat = data.stat;
      statIds[stat.stat_id] = stat;
    });
  });
});

bot.addListener('names', function(channel, names) {
  console.log("Joined " + channel);
});

function strpad(str, len) {
  str = String(str);
  if(str.length >= len) {
    return str;
  }
  return str + Array(len + 1 - str.length).join(" ");
}

function getTeam(data) {
  return Object.keys(teamData).map(function(k){
    return [k, teamData[k]]
  }).filter(function(i){
    return i[1].name === data.join(" ") || i[1].owner.indexOf(specNick) > -1
  })[0];
}

var commands = {
  "standings": {
    url: 'http://fantasysports.yahooapis.com/fantasy/v2/league/nhl.l.99282/standings',
    fn: function(data, cmdData, nick) {
      var teams = data.league[1].standings[0].teams,
          team, info, stats, standings;
      var message = [], s;
      message.push([
          strpad("#", 2),
          strpad("Name", 20),
          strpad("W", 3),
          strpad("L", 3),
          strpad("T", 3),
          strpad("%", 4),
          "Waiver",
          "Moves"
        ].join(" "));
      for(var i = 0; i < teams.count; i++) {
        team = teams[i].team;
        info = team[0];
        stats = team[1];
        standings = team[2].team_standings;
        s = [
              "\x02" + (i + 1) + ".\x02",
              strpad(info[2].name, 20),
              strpad(standings.outcome_totals.wins, 3),
              strpad(standings.outcome_totals.losses, 3),
              strpad(standings.outcome_totals.ties, 3),
              strpad(standings.outcome_totals.percentage, 4),
              strpad(info[7].waiver_priority, 6),
              strpad(info[9].number_of_moves, 5),
            ].join(" ");
        message.push(s);
      }
      console.log('Read standings to ' + nick);
      bot.say(chanName, message.join("\n"));
    }
  },
  "standingsn": {
    url: 'http://fantasysports.yahooapis.com/fantasy/v2/league/nhl.l.99282/standings',
    fn: function(data, cmdData, nick) {
      var teams = data.league[1].standings[0].teams,
          team, info, stats, standings;
      var message = [], s;
      message.push([
          strpad("#", 2),
          strpad("Name", 20),
          strpad("W", 3),
          strpad("L", 3),
          strpad("T", 3),
          strpad("%", 4),
          "Waiver",
          "Moves"
        ].join(" "));
      for(var i = 0; i < teams.count; i++) {
        team = teams[i].team;
        info = team[0];
        stats = team[1];
        standings = team[2].team_standings;
        s = [
              "\x02" + (i + 1) + ".\x02",
              strpad(teamData[info[0].team_key].owner[0], 20),
              strpad(standings.outcome_totals.wins, 3),
              strpad(standings.outcome_totals.losses, 3),
              strpad(standings.outcome_totals.ties, 3),
              strpad(standings.outcome_totals.percentage, 4),
              strpad(info[7].waiver_priority, 6),
              strpad(info[9].number_of_moves, 5),
            ].join(" ");
        message.push(s);
      }
      console.log('Read standings to ' + nick);
      bot.say(chanName, message.join("\n"));
    }
  },
  "stats": {
    fn: function(data, nick) {
      if(!teamData || !statIds) {
        return;
      }
      var specNick = (data.length === 0) ? '' : data[0].toLowerCase();
      var team = getTeam(data);
      if(!team) {
        bot.say(chanName, nick + ": Sorry, no team or owner with that name exists.");
      } else {
        var key = team[0];
        get('http://fantasysports.yahooapis.com/fantasy/v2/team/' + key + '/stats', function(data, cmdData, nick) {
          var tstats = data.team[1].team_stats;
          var stats = tstats.stats.map(function(s) {
            return statIds[s.stat.stat_id].display_name + " " + s.stat.value;
          });
          stats.unshift("PTS " + data.team[1].team_points.total);
          stats.unshift(team[1].name);
          console.log("Told " + nick + " the stats for " + team[1].name);
          bot.say(chanName, stats.join(" | "));
        }, data, nick);
      }
    }
  }
  "murt": {
    fn: function(data, nick) {
      console.log(nick + " told murt to fuck off");
      bot.say(chanName, "FUCK OFF MURT");
    }
  },
  "doubleaw": {
    fn: function(data, nick) {
      bot.say(chanName, "That's the guy that made me. He must be way better than amaninacan.");
    }
  },
  "ruhan": {
    fn: function(data, nick) {
      bot.say(chanName, "No, you can't have the Blackhawks' fourth line.");
    }
  },
  "thero": {
    fn: function(data, nick) {
      bot.say(chanName, "Go fuck yourself dan.");
    }
  }
};

bot.addListener('message' + chanName, function(nick, text, message) {
  if(!OAUTH) {
    return;
  }
  var msg = message.args[1].split(" ");
  if(!msg[0].match(/^\!f/)) {
    return;
  }
  var cmd = msg[0].replace(/^\!f/,'').toLowerCase();
  if(commands.hasOwnProperty(cmd)) {
    if(commands[cmd].url) {
      get(commands[cmd].url, commands[cmd].fn, msg.slice(1), message.nick);
    } else {
      commands[cmd].fn(msg.slice(1), message.nick);
    }
  }
});