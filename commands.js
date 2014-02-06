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
    "reloadcmds": {
      fn: function(data, nick) {
        if(nick !== "DoubleAW" && nick !== "AWAW") {
          this.client.say(chanName, "You can't do that.");
          return;
        }
        this.reloadCmds();
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
        console.log('Read standings to ' + nick);
        this.client.say(chanName, message.join("\n"));
      }
    },
    "stats": {
      fn: function(data, nick) {
        if(!this.teamData || !this.statIds) {
          return;
        }
        var team = getTeam(data);
        if(!team) {
          this.client.say(chanName, nick + ": Sorry, no team or owner with that name exists.");
        } else {
          var key = team[0];
          get('team/' + key + '/stats', function(data, cmdData, nick) {
            var tstats = data.team[1].team_stats;
            var stats = tstats.stats.map(function(s) {
              return this.statIds[s.stat.stat_id].display_name + " " + s.stat.value;
            });
            stats.unshift("PTS " + data.team[1].team_points.total);
            stats.unshift(team[1].name);
            console.log("Told " + nick + " the stats for " + team[1].name);
            this.client.say(chanName, stats.join(" | "));
          }, data, nick);
        }
      }
    },
    "starters": {
      fn: function(data, nick) {
        if(!this.teamData || !this.statIds) {
          return;
        }
        var team = getTeam(data);
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
          this.client.say(chanName, nick + ": " + "The following commands are available: " + Object.keys(help).join(", "));
        } else {
          if(help[data[0]]) {
            this.client.say(chanName, help[data[0]]);
          } else {
            this.client.say(chanName, nick + ": " + "There is no help available for '" + data[0] + "'.");
          }
        }
      }
    },
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
          } else {
            name2 = bold(name2);
            pts2 = bold(pts2);
          }
          results.push(name1 + " " + pts1 + " - " + pts2 + " " + name2);
        }
        this.client.say(chanName, results.join("\n"));
      }
    },
    "murt": {
      fn: function(data, nick) {
        console.log(nick + " told murt to fuck off");
        this.client.say(chanName, "FUCK OFF MURT");
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
    "uck": {
      fn: function(data, nick) {
        this.client.say(chanName, "Woah, watch your language, asshole.");
      }
    }
  };
};