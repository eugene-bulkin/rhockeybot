var util = require('util');
var fs = require('fs');
var figlet = require('figlet');

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

module.exports = function(get, chanName) {
  return {
    "reload": {
      fn: function(data, nick) {
        if(nick !== "DoubleAW" && nick !== "AWAW") {
          this.client.say(chanName, "You can't do that.");
          return;
        }
        this.reload();
      }
    },
    "iglet": {
      fn: function(data, nick) {
        if(nick !== "DoubleAW" && nick !== "AWAW") {
          this.client.say(chanName, "You can't do that.");
          return;
        }
        figlet('fuck off murt', function(err, data) {
          this.log(data);
        }.bind(this));
      }
    },
    "standings": {
      url: 'league/nhl.l.99282/standings',
      fn: function(data, cmdData, nick) {
        var teams = data.league[1].standings[0].teams,
            team, info, stats, standings, name;
        var message = [], s;
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
        for(var i = 0; i < teams.count; i++) {
          team = teams[i].team;
          info = team[0];
          stats = team[1];
          standings = team[2].team_standings;
          name = (nicks) ? this.teamData[info[0].team_key].owner[0] : this.teamData[info[0].team_key].name;
          s = [
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
        }
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
          this.client.say(chanName, nick + ": Sorry, no team or owner with that name exists.");
        } else {
          var key = team[0];
          get('team/' + key + '/roster', function(data, cmdData, nick) {
            var players = data.team[1].roster[0].players,
                info, position;
            var positions = {};
            for(var i = 0; i < players.count; i++) {
              info = players[i].player[0];
              position = players[i].player[1].selected_position[1].position;
              if(!positions[position]) {
                positions[position] = [];
              }
              positions[position].push(info[2].name.first[0] + ". " + info[2].name.last);
            }
            var spots = Object.keys(positions).filter(function(pos){
              return ['BN','IR','IR+'].indexOf(pos) < 0;
            }).map(function(pos){
              return pos + ": " + positions[pos].join(", ");
            });
            spots.unshift(team[1].name);
            this.client.say(chanName, spots.join(" | "));
          }, data, nick);
        }
      }
    },
    "help": {
      fn: function(data, nick) {
        if(data.length === 0) {
          this.client.say(chanName, nick + ": " + "The following commands are available: " + Object.keys(this.help).join(", "));
        } else {
          if(this.help[data[0]]) {
            this.client.say(chanName, this.help[data[0]]);
          } else {
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
            matchup, team1, team2, pts1, pts2, name1, name2,
            results = [];
        var nicks = (cmdData[0] === "n");
        for(var i = 0; i < scoreboard.count; i++) {
          matchup = scoreboard[i].matchup[0];
          team1 = matchup.teams[0].team;
          team2 = matchup.teams[1].team;
          pts1 = team1[1].team_points.total;
          pts2 = team2[1].team_points.total;
          name1 = (nicks) ? this.teamData[team1[0][0].team_key].owner[0] : this.teamData[team1[0][0].team_key].name;
          name2 = (nicks) ? this.teamData[team2[0][0].team_key].owner[0] : this.teamData[team2[0][0].team_key].name;
          if(pts1 > pts2) {
            name1 = bold(name1);
            pts1 = bold(pts1);
          } else if(pts2 > pts1) {
            name2 = bold(name2);
            pts2 = bold(pts2);
          }
          results.push(name1 + " " + pts1 + " - " + pts2 + " " + name2);
        }
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
          this.client.say(chanName, nick + ": Sorry, no team or owner with that name exists.");
        } else {
          var scoreboard = data.league[1].scoreboard[0].matchups,
              matchup, team1, team2, stats1, stats2,
              wins1 = [], wins2 = [], ties = [], results;
          for(var i = 0; i < scoreboard.count; i++) {
            matchup = scoreboard[i].matchup[0];
            team1 = matchup.teams[0].team;
            team2 = matchup.teams[1].team;
            if(team1[0][0].team_key === team[0] || team2[0][0].team_key === team[0]) {
              stats1 = team1[1].team_stats.stats;
              stats2 = team2[1].team_stats.stats;
              stats1.forEach(function(stat1, i){
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
              }, this);
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
          this.client.say(chanName, results.join(" | "));
        }
      }
    },
    "murt": {
      fn: function(data, nick) {
        this.log(nick + " told murt to fuck off");
        var msgs = [
          "FUCK OFF MURT",
          "http://i.imgur.com/d9pZQS0.jpg",
          "http://i.imgur.com/nXqgx5X.jpg",
          "http://i.imgur.com/0rT7INi.jpg",
          "http://i.imgur.com/eeBDs9L.jpg",
          "http://i.imgur.com/wWoifA8.jpg",
          "http://i.imgur.com/DZtTLqf.jpg",
          "http://i.imgur.com/3UsTnbP.jpg",
          "http://i.imgur.com/6d6jNGU.jpg"
        ];
        this.client.say(chanName, msgs[(Math.random() * msgs.length) | 0]);
      }
    },
    "doubleaw": {
      fn: function(data, nick) {
        this.client.say(chanName, "That's the guy that made me. He must be way better than amaninacan.");
      }
    },
    "ruhan": {
      fn: function(data, nick) {
        this.client.say(chanName, "No, you can't have the Chicago fourth line.");
      }
    },
    "thero": {
      fn: function(data, nick) {
        this.client.say(chanName, "Go fuck yourself dan.");
      }
    },
    "dan": {
      fn: function(data, nick) {
        this.client.say(chanName, "Hey " + nick + " wanna suck me off?");
      }
    },
    "signal": {
      fn: function(data, nick) {
        var msgs = ["do you have a sister", "what color are your pubes"];
        this.client.say(chanName, "Hey " + nick + " " + msgs[(Math.random() * msgs.length) | 0] + "?");
      }
    },
    "uck": {
      fn: function(data, nick) {
        this.client.say(chanName, "Woah, watch your language, asshole.");
      }
    },
    "thirty": {
      fn: function(data, nick) {
        this.client.say(chanName, "The fix will be posted at noon tomorrow on macrumors.com");
      }
    },
    "snackle": {
      fn: function(data, nick) {
        this.client.say(chanName, "#JasminesNips2014");
      }
    }
  };
};
