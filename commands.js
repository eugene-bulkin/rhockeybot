var util = require('util');
var fs = require('fs');
var figlet = require('figlet');
var moment = require('moment-timezone');

moment.lang('en', {
  calendar : {
    lastDay : '[Yesterday at] LT z',
    sameDay : '[Today at] LT z',
    nextDay : '[Tomorrow at] LT z',
    lastWeek : '[Last] dddd [at] LT z',
    nextWeek : 'dddd [at] LT z',
    sameElse : 'L [at] LT z'
  }
});

var strpad = function(str, len) {
  str = String(str);
  if(str.length >= len) {
    return str;
  }
  return str + Array(len + 1 - str.length).join(" ");
};

var bold = function(str) {
  return "\x02" + str + "\x02";
};

var yforEach = function(obj, callback, thisArg) {
  obj.length = obj.count;
  Array.prototype.forEach.call(obj, callback, thisArg);
};

var formatTransaction = function(info, players) {
  players = players.players;
  var add = [], drop = [], trade = { team1: [], team2: [] };
  var teamKey = null, t1key = null, t2key = null;
  if(info.type === 'trade') {
    t1key = info.trader_team_key;
    t2key = info.tradee_team_key;
  }
  yforEach(players, function(p) {
    p = p.player;
    var info = p[0], data = p[1].transaction_data[0];
    var name = info[2].name.first[0] + ". " + info[2].name.last;
    var position = info[4].display_position.replace(',', '/');
    var playerName = name + " (" + position + ")";
    if(data.type === 'add') {
      teamKey = data.destination_team_key;
      add.push(playerName);
    } else if(data.type === 'drop') {
      teamKey = data.source_team_key;
      drop.push(playerName);
    } else if(data.type === 'trade') {
      if(data.destination_team_key === t1key) {
        trade.team1.push(playerName);
      } else {
        trade.team2.push(playerName);
      }
    }
  }, this);
  var str = [];
  if(['add/drop', 'add', 'drop'].indexOf(info.type) > -1) {
    str.push(bold("ADD/DROP"));
    str.push(this.teamData[teamKey].name);
    if(add.length > 0) {
      str.push("Added: " + add.join(", "));
    }
    if(drop.length > 0) {
      str.push("Dropped: " + drop.join(", "));
    }
  } else if(info.type === 'trade') {
    str.push(bold("TRADE"));
    str.push(this.teamData[t1key].name + " received: " + trade.team1.join(", "));
    str.push(this.teamData[t2key].name + " received: " + trade.team2.join(", "));
  }
  str.splice(1, 0, moment(info.timestamp * 1000).tz('America/Chicago').calendar());
  return str.join(" | ");
};

module.exports = function(get, chanName) {
  return {
    "reload": {
      fn: function(data, nick) {
        if(nick !== "DoubleAW" && nick !== "AWAW") {
          this.log(nick + " tried to reload commands.");
          this.client.say(chanName, "You can't do that.");
          return;
        }
        this.reload();
        this.client.say(chanName, "Done.");
      }
    },
    "iglet": {
      fn: function(data, nick) {
        if(nick !== "DoubleAW" && nick !== "AWAW") {
          this.log(nick + " tried to use figlet.");
          this.client.say(chanName, "You can't do that.");
          return;
        }
        figlet(data.join(" "), {
          font: 'Small',
          horizontalLayout: 'fitted'
        }, function(err, str) {
          this.log("Displayed a figlet image for the phrase '" + data.join(" ") + "'");
          this.client.say(chanName, str);
        }.bind(this));
      }
    },
    "standings": {
      url: 'league/nhl.l.99282/standings',
      fn: function(data, cmdData, nick) {
        var teams = data.league[1].standings[0].teams;
        var message = [], i = 0;
        var nicks = (cmdData[0] === "n");
        message.push([
            strpad("\x1f#\x1f", 2 + 2),
            strpad("\x1fName\x1f", 20 + 2),
            strpad("\x1fW\x1f", 3 + 2),
            strpad("\x1fL\x1f", 3 + 2),
            strpad("\x1fT\x1f", 3 + 2),
            strpad("\x1f%\x1f", 4 + 2),
            "\x1fWaiver\x1f",
            "\x1fMoves\x1f"
          ].join(" "));
        yforEach(teams, function(t) {
          var team = t.team;
          var info = team[0];
          var stats = team[1];
          var standings = team[2].team_standings;
          var name = (nicks) ? this.teamData[info[0].team_key].owner[0] : this.teamData[info[0].team_key].name;
          var s = [
                bold((i + 1) + "."),
                strpad(name, 20),
                strpad(standings.outcome_totals.wins, 3),
                strpad(standings.outcome_totals.losses, 3),
                strpad(standings.outcome_totals.ties, 3),
                strpad(standings.outcome_totals.percentage, 4),
                strpad(info[7].waiver_priority, 6),
                strpad(info[9].number_of_moves, 5),
              ].join(" ");
          message.push(s);
          i++;
        }, this);
        this.log('Read standings to ' + nick);
        this.client.say(chanName, message.join("\n"));
      }
    },
    "stats": {
      fn: function(data, nick) {
        if(!this.teamData || !this.statIds) {
          return;
        }
        var team = this.getTeam(data);
        if(!team) {
          if(data.length === 0) {
            this.log(nick + " tried to get stats without specifying a team/owner");
          } else {
            this.log(nick + " tried to get stats for nonexistent team/owner(s) '" + data.join(" ") + "'");
          }
          this.client.say(chanName, nick + ": Sorry, no team or owner with that name exists.");
        } else {
          var key = team[0];
          get('team/' + key + '/stats', function(data, cmdData, nick) {
            var tstats = data.team[1].team_stats;
            var stats = tstats.stats.map(function(s) {
              return this.statIds[s.stat.stat_id].display_name + " " + s.stat.value;
            }, this);
            stats.unshift("PTS " + data.team[1].team_points.total);
            stats.unshift(bold(team[1].name));
            this.log("Told " + nick + " the stats for " + team[1].name);
            this.client.say(chanName, stats.join(" | "));
          }.bind(this), data, nick);
        }
      }
    },
    "starters": {
      fn: function(data, nick) {
        if(!this.teamData || !this.statIds) {
          return;
        }
        var team = this.getTeam(data);
        if(!team) {
          if(data.length === 0) {
            this.log(nick + " tried to get starters without specifying a team/owner");
          } else {
            this.log(nick + " tried to get starters for nonexistent team/owner(s) '" + data.join(" ") + "'");
          }
          this.client.say(chanName, nick + ": Sorry, no team or owner with that name exists.");
        } else {
          var key = team[0];
          get('team/' + key + '/roster', function(data, cmdData, nick) {
            var players = data.team[1].roster[0].players,
                info, position;
            var positions = {};
            yforEach(players, function(p) {
              var info = p.player[0];
              var position = p.player[1].selected_position[1].position;
              if(!positions[position]) {
                positions[position] = [];
              }
              positions[position].push(info[2].name.first[0] + ". " + info[2].name.last);
            }, this);
            var spots = Object.keys(positions).filter(function(pos){
              return ['BN','IR','IR+'].indexOf(pos) < 0;
            }).map(function(pos){
              return pos + ": " + positions[pos].join(", ");
            });
            spots.unshift(team[1].name);
            this.log("Read starters for " + team[1].name + " to " + nick);
            this.client.say(chanName, spots.join(" | "));
          }, data, nick);
        }
      }
    },
    "roster": {
      fn: function(data, nick) {
        if(!this.teamData || !this.statIds) {
          return;
        }
        var team = this.getTeam(data);
        if(!team) {
          if(data.length === 0) {
            this.log(nick + " tried to get a roster without specifying a team/owner");
          } else {
            this.log(nick + " tried to get roster for nonexistent team/owner(s) '" + data.join(" ") + "'");
          }
          this.client.say(chanName, nick + ": Sorry, no team or owner with that name exists.");
        } else {
          var key = team[0];
          get('team/' + key + '/roster', function(data, cmdData, nick) {
            var players = data.team[1].roster[0].players;
            var positions = {};
            yforEach(players, function(p) {
              var info = p.player[0];
              var position = p.player[1].selected_position[1].position;
              if(!positions[position]) {
                positions[position] = [];
              }
              positions[position].push(info[2].name.first[0] + ". " + info[2].name.last);
            }, this);
            var spots = Object.keys(positions).map(function(pos){
              return pos + ": " + positions[pos].join(", ");
            });
            spots.unshift(team[1].name);
            this.log("Read roster for " + team[1].name + " to " + nick);
            this.client.say(chanName, spots.join(" | "));
          }, data, nick);
        }
      }
    },
    "help": {
      fn: function(data, nick) {
        var cmds = Object.keys(this.help);
        cmds = cmds.filter(function(cmd) {
          return cmd[0] !== '~';
        });
        if(data.length === 0) {
          this.log("Read help to " + nick);
          this.client.say(chanName, nick + ": " + "The following commands are available: " + cmds.join(", "));
        } else {
          if(this.help[data[0]]) {
            this.log("Read help to " + nick + " for !" + data[0]);
            this.client.say(chanName, this.help[data[0]]);
          } else if(this.help["~" + data[0]]) {
            this.log("Read help to " + nick + " for !" + data[0]);
            this.client.say(chanName, this.help["~" + data[0]]);
          } else {
            this.log("Told " + nick + " the '" + data[0] + "' command does not exist");
            this.client.say(chanName, nick + ": " + "There is no help available for '" + data[0] + "'.");
          }
        }
      }
    },
    "matchups": "scores",
    "scores": {
      url: 'league/nhl.l.99282/scoreboard/matchups',
      fn: function(data, cmdData, nick) {
        var scoreboard = data.league[1].scoreboard[0].matchups,
            results = [];
        var nicks = (cmdData[0] === "n");
        yforEach(scoreboard, function(m) {
          var matchup = m.matchup[0];
          var team1 = matchup.teams[0].team;
          var team2 = matchup.teams[1].team;
          var pts1 = team1[1].team_points.total;
          var pts2 = team2[1].team_points.total;
          var name1 = (nicks) ? this.teamData[team1[0][0].team_key].owner[0] : this.teamData[team1[0][0].team_key].name;
          var name2 = (nicks) ? this.teamData[team2[0][0].team_key].owner[0] : this.teamData[team2[0][0].team_key].name;
          if(pts1 > pts2) {
            name1 = bold(name1);
            pts1 = bold(pts1);
          } else if(pts2 > pts1) {
            name2 = bold(name2);
            pts2 = bold(pts2);
          }
          results.push(name1 + " " + pts1 + " - " + pts2 + " " + name2);
        }, this);
        this.log("Read scores to " + nick);
        this.client.say(chanName, results.join("\n"));
      }
    },
    "matchup": {
      url: 'league/nhl.l.99282/scoreboard/matchups',
      fn: function(data, cmdData, nick) {
        var wmap = function(w){
          var name = w[0], l = w[1], r = w[2];
          return name + " (" + bold(l) + " - " + r + ")";
        }, tmap = function(w){
          var name = w[0], v = w[1];
          return name + " (" + v + ")";
        };
        if(!this.teamData || !this.statIds) {
          return;
        }
        var team = this.getTeam(cmdData);
        if(!team) {
          if(cmdData.length === 0) {
            this.log(nick + " tried to get a matchup for without specifying a team/owner");
          } else {
            this.log(nick + " tried to get a matchup for nonexistent team/owner(s) '" + cmdData.join(" ") + "'");
          }
          this.client.say(chanName, nick + ": Sorry, no team or owner with that name exists.");
        } else {
          var scoreboard = data.league[1].scoreboard[0].matchups,
              matchup, team1, team2, stats1, stats2,
              wins1 = [], wins2 = [], ties = [], results;
          var statDeterminer = function(stat1, i){
            stat1 = stat1.stat;
            var stat2 = stats2[i].stat;
            var val1 = stat1.value, val2 = stat2.value;
            if(this.statIds[stat1.stat_id].display_name === "SA") {
              // why is this here?
              return;
            }
            if(this.statIds[stat1.stat_id].display_name === "GAA") {
              // we want GAA to be lower!
              if(val1 < val2) {
                wins1.push([this.statIds[stat1.stat_id].display_name, val1, val2]);
              } else if(val2 < val1) {
                wins2.push([this.statIds[stat1.stat_id].display_name, val2, val1]);
              } else {
                ties.push([this.statIds[stat1.stat_id].display_name, val1]);
              }
            } else {
              if(val1 > val2) {
                wins1.push([this.statIds[stat1.stat_id].display_name, val1, val2]);
              } else if(val2 > val1) {
                wins2.push([this.statIds[stat1.stat_id].display_name, val2, val1]);
              } else {
                ties.push([this.statIds[stat1.stat_id].display_name, val1]);
              }
            }
          };
          for(var i = 0; i < scoreboard.count; i++) {
            matchup = scoreboard[i].matchup[0];
            team1 = matchup.teams[0].team;
            team2 = matchup.teams[1].team;
            if(team1[0][0].team_key === team[0] || team2[0][0].team_key === team[0]) {
              stats1 = team1[1].team_stats.stats;
              stats2 = team2[1].team_stats.stats;
              stats1.forEach(statDeterminer, this);
              var score = [team1[0][2].name + " " + wins1.length, wins2.length + " " + team2[0][2].name];
              if(wins1.length > wins2.length) {
                score[0] = bold(score[0]);
              } else if(wins1.length < wins2.length) {
                score[1] = bold(score[1]);
              }
              results = [
                wins1.map(wmap).join(", "),
                score.join(" - "),
                wins2.map(wmap).join(", "),
                "Ties",
                ties.map(tmap).join(", ")
              ];
              break;
            } else {
              continue;
            }
          }
          this.log("Read matchup between " + team1[0][2].name + " and " + team2[0][2].name + " to " + nick);
          this.client.say(chanName, results.join(" | "));
        }
      }
    },
    "moves": {
      fn: function(data, nick) {
        // get count
        var isInt = function(s){ return s.match(/^\d+$/); };
        var notInt = function(s){ return !s.match(/^\d+$/); };
        var toInt = function(s){ return parseInt(s, 10); };
        count = data.filter(isInt).map(toInt).pop() || 5;
        // must be between 1 and 5
        count = Math.min(Math.max(1, count), 5);
        var url = 'league/nhl.l.99282/transactions;types=add,drop,trade;count=' + count;
        // get team data if exists
        var team = this.getTeam(data.filter(notInt));
        if(team) {
          url += ';team_key='+team[0];
        }
        get(url, function(data, cmdData) {
          var transactions = data.league[1].transactions;
          var logStr = "Read " + count + " moves";
          if(team) {
            logStr += " by " + team[1].name;
          }
          logStr += " to " + nick;
          this.log(logStr);
          yforEach(transactions, function(t) {
            this.client.say(chanName, formatTransaction.apply(this, t.transaction));
          }, this);
        });
      }
    },
    // silly crap
    "murt": {
      fn: function(data, nick) {
        figlet("FUCK OFF MURT", {
          font: 'Small',
          horizontalLayout: 'fitted'
        }, function(err, data) {
          var msgs = [
            "FUCK OFF MURT",
            "http://i.imgur.com/d9pZQS0.jpg",
            "http://i.imgur.com/nXqgx5X.jpg",
            "http://i.imgur.com/0rT7INi.jpg",
            "http://i.imgur.com/eeBDs9L.jpg",
            "http://i.imgur.com/wWoifA8.jpg",
            "http://i.imgur.com/DZtTLqf.jpg",
            "http://i.imgur.com/3UsTnbP.jpg",
            "http://i.imgur.com/6d6jNGU.jpg",
            "http://i.imgur.com/Ynd0IVC.jpg",
            "http://i.imgur.com/5n0ZAcq.jpg"
          ];
          if(!err) {
            msgs.push(data);
          }
          this.log(nick + " told murt to fuck off");
          this.client.say(chanName, msgs[(Math.random() * msgs.length) | 0]);
        }.bind(this));
      }
    },
    "leafer": {
      fn: function(data, nick) {
        this.log(nick + " quoted Leafer91");
        this.client.say(chanName, "Man, I really could go for some throat lasagnas right now.");
      }
    },
    "doubleaw": {
      fn: function(data, nick) {
        this.log(nick + " asked me to talk about how awesome DoubleAW is");
        this.client.say(chanName, "That's the guy that made me. He must be way better than amaninacan.");
      }
    },
    "ruhan": {
      fn: function(data, nick) {
        this.log(nick + " made fun of ruhan");
        this.client.say(chanName, "No, you can't have the Chicago fourth line.");
      }
    },
    "thero": {
      fn: function(data, nick) {
        if(nick.toLowerCase() === "thero") {
          this.log(nick + " tried to tell dan to fuck himself but failed");
          this.client.say(chanName, "Go fuck yourself " + nick + ".");
        } else {
          this.log(nick + " told dan to fuck himself");
          this.client.say(chanName, "Go fuck yourself dan.");
        }
      }
    },
    "dan": {
      fn: function(data, nick) {
        this.log(nick + " asked for a blowjob");
        this.client.say(chanName, "Hey " + nick + " wanna suck me off?");
      }
    },
    "signal": {
      fn: function(data, nick) {
        var msgs = ["do you have a sister", "what color are your pubes", "would you drink my bathwater", "can you recommend a good porno"];
        this.log(nick + " quoted SiGNAL");
        this.client.say(chanName, "Hey " + nick + " " + msgs[(Math.random() * msgs.length) | 0] + "?");
      }
    },
    "uck": {
      fn: function(data, nick) {
        this.log(nick + " swore at me");
        this.client.say(chanName, "Woah, watch your language, asshole.");
      }
    },
    "thirty": {
      fn: function(data, nick) {
        this.log(nick + " quoted thirty");
        this.client.say(chanName, "The fix will be posted at noon tomorrow on macrumors.com");
      }
    },
    "snackle": {
      fn: function(data, nick) {
        this.log(nick + " said something about Jasmine's nips");
        this.client.say(chanName, "#JasminesNips2014");
      }
    },
    "panthers": {
      fn: function(data, nick) {
        this.log(nick + " blessed the channel with the Panthers logo");
        this.client.say(chanName, "http://i.imgur.com/LXDNmml.jpg");
      }
    },
    "source": {
      fn: function(data, nick) {
        this.log(nick + " asked about my source code");
        this.client.say(chanName, "If you have suggestions/feature requests or just want to see the source, it's at http://github.com/eugene-bulkin/rhockeybot");
      }
    },
    "lahey": {
      fn: function(data, nick) {
        var msgs = [
          "Birds of a shitfeather flock together, $nick.",
          "You just opened Pandora's Shitbox, $nick.",
          "I am the liquor.",
          "The shit pool's gettin full $nick, time to strain the shit before it overflows. I will not have a Pompeiian shit catastrophe on my hands.",
          "Did you see that, $nick? Goddamn shitapple driving the shitmobile. No body else in this park gives a fuck why should I?",
          "The ole shit liner is coming to port, and I'll be there to tie her up.",
          "How dare you involve my daughter in your hemisphere of shit.",
          "Captain Shittacular.",
          "I'm watching you, like a shithawk.",
          "We're sailing into a shit typhoon $nick, we'd better haul in the jib before it gets covered in shit.",
          "How dare you involve my daughter in your hemisphere of shit.",
          "Your shit-goose is cooked, $nick.",
          "Shit-apples never fall far from the shit-tree, $nick.",
          "$nick's about to enter the shit tornado to Oz.",
          "Do you feel that $nick? The way the shit clings to the air? Shit Blizzard.",
          "Never Cry Shitwolf, $nick",
          "Yes I used to drink, $nick, but I got the shitmonkey off my back for good.",
          "You know what you get when two shit-tectonic plates collide? Shitquakes, $nick. Shitquakes.",
          "The ole shit liner is coming to port, and I'll be there to tie her up.",
          "We got the key to shitty city, $nick, and Julian's the muscular mayor.",
          "You boys have loaded up a hair-trigger, double barrelled shitmachinegun, and the barrel's pointing right at your own heads.",
          "Shit moths, $nick.",
          "Do you know what a shit rope is, $nick?",
          "The old shit barometer is rising."
        ];
        this.log(nick + " asked for a Lahey quote");
        this.client.say(chanName, msgs[(Math.random() * msgs.length) | 0].replace("$nick", nick));
      }
    }
  };
};
