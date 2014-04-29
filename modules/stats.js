var FS = require('q-io/fs');
var HTTP = require('q-io/http');
var Q = require('q');
var cheerio = require('cheerio');
var tb = require('thenby');
var request = require('request');
var qs = require('querystring');
var humanize = require('humanize');

var API = require('../api.json');
var OAUTH = require('../oauth.json');

try {
  var NAME_DB = require('../stats/names.json');
} catch(e) {
  var NAME_DB = {};
}
var NAMES_CHANGED = false;

var KEYS = {
  yahoo: ["gp", "g", "a", "p", "pm", "pim", "hit", "blk", "fw", "fl", null, "ppg", "ppa", "shg", "sha", "gwg", "sog", null],
  yahooG: ["gp", "gs", "min", "w", "l", "otl", "ega", "ga", "gaa", "sa", "sv", null, "so"],
  es: ["gp", "toi", null, null, "gfp", "gfp_rel", null, null, "cfp", "cfp_rel", null, null, "ffp", "ffp_rel", null, null, "sfp", "sfp_rel", "shp", "svp", "pdo"],
  esSummary: ["toi", "gf", "ga", "cf", "ca", null, "ff", "fa", null, "sf", "sa", null, null, null]
};

var getQ = function(url, nickname) {
  var deferred = Q.defer();
  request.get({ url: 'http://fantasysports.yahooapis.com/fantasy/v2/' + url + '?format=json', oauth: OAUTH, json: true }, function(e, r, body) {
    if(e) {
      deferred.reject(e);
      return;
    }
    if(body.error) {
      if(body.error.description.indexOf('token_expired') > -1) {
        request.post({url: 'https://api.login.yahoo.com/oauth/v2/get_token', oauth: OAUTH}, function (e, r, body) {
          var perm_token = qs.parse(body);
          OAUTH = {
            consumer_key: API.key,
            consumer_secret: API.secret,
            token: perm_token.oauth_token,
            token_secret: perm_token.oauth_token_secret,
            session_handle: perm_token.oauth_session_handle
          };
          deferred.resolve(FS.write('../oauth.json', JSON.stringify(OAUTH)).then(function() {
            return getQ(url, nickname);
          }));
        });
      } else {
        deferred.reject(body.error);
      }
    } else {
      deferred.resolve([body.fantasy_content, nickname || "?"]);
    }
  });
  return deferred.promise;
};

/*
 * Used to get a player id, which we use to catalog the stats per user.
 */
var getPlayerName = function(data) {
  if (NAME_DB[data.join(' ')]) {
    console.log("Name for request '" + data.join(' ') + "' was cached");
    return Q.fcall(function() {
      return NAME_DB[data.join(' ')].name;
    });
  }
  var oneName = data.length === 1 && data[0].toLowerCase();
  return HTTP.read('http://www.hockey-reference.com/player_search.cgi?search=' + data.join('+')).then(function(b) {
    var $ = cheerio.load(b.toString());
    var results = [];
    $('#page_content table tr').map(function() {
      // convert everything to text since we don't care about the links
      var result = $(this).children('td').map(function() {
        return $(this).text();
      });
      // tack on the url so we have access to it later
      result[4] = "http://www.hockey-reference.com" + $(this).html().match(/href=\"(.+?)\"/)[1];
      return result;
    }).each(function() {
      var years = this[2].split('-').map(function(y){ return parseInt(y, 10); });
      if(years.length < 2) {
        return;
      }
      // pushes an array to results of the following:
      // [name, last active year, total years in league, url]
      results.push([this[0], years[1], years[1] - years[0], this[4]]);
    });
    // we sort in three stages:
    // first, if only one word was provided as data, we assume we're looking for
    // a last name, so results where the last name is the same have priority.
    // then we rank by most recent active year, then by years in the league.
    results = results.sort(firstBy(function(a, b) {
      var lln = a[0].split(' ')[1].toLowerCase() === oneName;
      var rln = b[0].split(' ')[1].toLowerCase() === oneName;
      if(oneName) {
        if(lln && !rln) {
          return -1;
        } else if(rln && !lln) {
          return 1;
        } else {
          return 0;
        }
      }
      return 0;
    }).thenBy(function(a, b){
      return b[1] - a[1];
    }).thenBy(function(a, b){
      return b[2] - a[2];
    }));
    // take the first result, return its url
    return results[0][3];
  }, function(e) {
    if(e.response.status === 302) {
      // if we got a failure with a 302, that means the data we sent redirected,
      // so we know the url we want. send that through.
      return e.response.headers.location;
    } else {
      // if it was some other error, throw an error to be dealt with down the line.
      throw e;
    }
  }).then(function(url) {
    // parse the ID out
    var id = url.match(/\/[a-z]\/(.+?)\.html$/)[1];
    return HTTP.read("http://www.hockey-reference.com/players/" + id[0] + "/" + id + ".html");
  }).then(function(b) {
    var $ = cheerio.load(b.toString());
    NAME_DB[data.join(' ')] = {
      name: $('span[itemprop=name]').text(),
      updated: new Date()
    };
    NAMES_CHANGED = true;
    return $('span[itemprop=name]').text();
  });
};

var statsPathExists = function(id) {
  // Note that we do the same thing even if the promise is rejected. This is
  // because a successful promise means the directory wasn't there and was
  // successfully created, but a rejected promise means the directory was already
  // there and so is already present, so we still continue.
  //
  // Essentially this ensures that the path TO the stats exists.
  return FS.makeDirectory('./stats/').then(function() {
    return FS.makeDirectory('./stats/' + id + '/');
  }, function() {
    return FS.makeDirectory('./stats/' + id + '/');
  });
};

var getPlayerIds = function(name) {
  var id = name.toLowerCase().replace(' ', '_');
  return statsPathExists(id).then(function() {
    return FS.exists('./stats/' + id + '/ids.json');
  }, function() {
    return FS.exists('./stats/' + id + '/ids.json');
  }).then(function(exists) {
    if(exists) {
      throw new Error('./stats/' + id + '/ids.json');
    }
    return name;
  }).then(function(name) {
    var id = name.toLowerCase().replace(' ', '_');
    var yahoo = getQ('league/nhl.l.99282/players;search=' + name.replace(' ', '+')).spread(function(body, nickname) {
      return body.league[1].players[0].player[0][1].player_id;
    });
    var extraSkater = HTTP.read('http://www.extraskater.com/search?type=player&query=' + name.replace(' ', '+')).then(function(b) {
      // didn't redirect, so... not sure what to do
      throw new Error(b);
    }, function(e) {
      if(e.response.status === 302) {
        return e.response.headers.location.replace('http://www.extraskater.com/player/', '');
      } else {
      // if it was some other error, throw an error to be dealt with down the line.
      throw e;
    }
    });
    var capGeek = HTTP.read('http://capgeek.com/search/?search_criteria=' + name.replace(' ', '+')).then(function(b) {
      // didn't redirect, so... not sure what to do
      throw new Error(b);
    }, function(e) {
      if(e.response.status === 302) {
        return e.response.headers.location.replace('/player/', '');
      } else {
      // if it was some other error, throw an error to be dealt with down the line.
      throw e;
    }
    });
    return Q.all([yahoo, extraSkater, capGeek]).spread(function(y, es, cg) {
      var json = {
        yahoo: y,
        extraSkater: es,
        capGeek: cg,
        updated: new Date()
      };
      return FS.write('./stats/' + id + '/ids.json', JSON.stringify(json)).then(function () {
        return json;
      });
    });
  }, function(e) {
    return FS.read(e.message).then(function(data) {
      console.log('IDs were cached');
      return JSON.parse(data);
    });
  });
};

var getCapInfo = function(name) {
  var id = name.toLowerCase().replace(' ', '_');
  return statsPathExists(id).then(function() {
    return FS.exists('./stats/' + id + '/cap.json');
  }, function() {
    return FS.exists('./stats/' + id + '/cap.json');
  }).then(function(exists) {
    if(exists) {
      throw new Error('./stats/' + id + '/cap.json');
    }
    return name;
  }).then(function(name) {
    return getPlayerIds(name).then(function(ids) {
      return HTTP.read('http://capgeek.com/player/' + ids.capGeek);
    }).then(function(b) {
      var $ = cheerio.load(b.toString());
      var result = {};
      return result;
      return FS.write('./stats/' + id + '/cap.json', JSON.stringify(result)).then(function () {
        return result;
      });
    });
  }, function(e) {
    return FS.read(e.message).then(function(data) {
      console.log('ES Stats were cached');
      return JSON.parse(data);
    });
  });
};

var getExtraSkaterStats = function(name) {
  var id = name.toLowerCase().replace(' ', '_');
  return statsPathExists(id).then(function() {
    return FS.exists('./stats/' + id + '/extra.json');
  }, function() {
    return FS.exists('./stats/' + id + '/extra.json');
  }).then(function(exists) {
    if(exists) {
      throw new Error('./stats/' + id + '/extra.json');
    }
    return name;
  }).then(function(name) {
    return getPlayerIds(name).then(function(ids) {
      return HTTP.read('http://www.extraskater.com/player/' + ids.extraSkater);
    }).then(function(b) {
      var $ = cheerio.load(b.toString());
      var result = {};
      var rows = $('tr.player-stats-on-ice-5v5close').filter(function() { return $(this).text().indexOf('Playoffs') == -1 });
      rows.each(function() {
        var season = $($(this).children('td')[0]).text().replace('-20','-');
        var json = {};
        $(this).children('td.number-right').each(function(i) {
          if(KEYS.es[i]) {
            json[KEYS.es[i]] = $(this).text();
          }
        });
        result[season] = json;
      });
      return FS.write('./stats/' + id + '/extra.json', JSON.stringify(result)).then(function () {
        return result;
      });
    });
  }, function(e) {
    return FS.read(e.message).then(function(data) {
      console.log('ES Stats were cached');
      return JSON.parse(data);
    });
  });
};

var getYahooRegularStats = function(name) {
  var id = name.toLowerCase().replace(' ', '_');
  return statsPathExists(id).then(function() {
    return FS.exists('./stats/' + id + '/yahoo.json');
  }, function() {
    return FS.exists('./stats/' + id + '/yahoo.json');
  }).then(function(exists) {
    if(exists) {
      throw new Error('./stats/' + id + '/yahoo.json');
    }
    return name;
  }).then(function(name) {
    return getPlayerIds(name).then(function(ids) {
      return HTTP.read('http://sports.yahoo.com/nhl/players/' + ids.yahoo + '/');
    }).then(function(b) {
      var $ = cheerio.load(b.toString());
      var result = {
        profile: {},
        seasons: {}
      };
      // load team info
      var playerInfo = $('div.player-info');
      result.profile.name = playerInfo.children('h1').text();
      var teamInfo = playerInfo.children('.team-info').text().replace(';','').split(',').map(function(t) { return t.replace(/^\s+|\s+$/g, '');});
      result.profile.number = teamInfo[0];
      result.profile.position = teamInfo[1];
      result.profile.team = teamInfo[2];

      var isGoalie = result.profile.position === 'G';
      var chosenKeys = (isGoalie) ? KEYS.yahooG : KEYS.yahoo;
      var chosenHeaders = (isGoalie) ? yahooRegularHeadersG : yahooRegularHeaders;

      // load profile
      Array.prototype.forEach.call($('div.bio dl'), function(el, i) {
        result.profile[chosenHeaders[i]] = $($(el).children('dd')[0]).text();
      });
      var preg = result.profile.draft.match(/^(\d{4})[^\d]+(\d+)[^\d]+round \((\d+)[^\d]+pick\) by the (.+?)$/);
      if(!preg) {
        // undrafted!
        result.profile.draft = null;
      } else {
        result.profile.draft = {
          year: preg[1],
          round: preg[2],
          overall: preg[3],
          team: preg[4]
        };
      }
      // load stats
      Array.prototype.forEach.call($('#mediasportsplayercareerstats tbody tr'), function(el) {
        // don't care about totals
        if(!$(el).children('th').hasClass('season')) {
          return;
        }
        var season = $(el).children('th').text();
        var json = {
          team: $(el).children('td.team').text()
        };
        Array.prototype.forEach.call($(el).children('td:not(.team)'), function(el, i) {
          if(chosenKeys[i]) {
            json[chosenKeys[i]] = $(el).text();
          }
        });
        result.seasons[season] = json;
      });
      return FS.write('./stats/' + id + '/yahoo.json', JSON.stringify(result)).then(function () {
        return result;
      });
    });
  }, function(e) {
    return FS.read(e.message).then(function(data) {
      console.log('Yahoo Stats were cached');
      return JSON.parse(data);
    });
  });
};

var toPercent = function(number) {
  number *= 1000;
  number |= 0;
  return (number === 1000) ? '1.000' : '0.' + number;
};

var formatDraft = function(draft) {
  if(!draft) {
    return 'Undrafted';
  }
  return 'Drafted ' + draft.year + ' by the ' + draft.team + ', ' + humanize.ordinal(draft.round) + ' round (' + humanize.ordinal(draft.overall) + ' pick)';
};

var yahooRegularHeaders = ["height", "weight", "shoots", "birthday", "birthplace", "draft"];
var yahooRegularHeadersG = ["height", "weight", "catches", "birthday", "birthplace", "draft"];

var updateNames = function(bot) {
  if(!NAMES_CHANGED) {
    return;
  }
  FS.write('./stats/names.json', JSON.stringify(NAME_DB)).then(function() {
    bot.log('Updated name database.');
    NAMES_CHANGED = false;
  });
};

var abbrHash = {
  "ANA":"Ducks",
  "SJS":"Sharks",
  "LAK":"Kings",
  "PHX":"Coyotes",
  "VAN":"Canucks",
  "CGY":"Flames",
  "EDM":"Oilers",
  "COL":"Avalanche",
  "STL":"Blues",
  "CHI":"Blackhawks",
  "MIN":"Wild",
  "DAL":"Stars",
  "NSH":"Predators",
  "WPG":"Jets",
  "BOS":"Bruins",
  "TBL":"Lightning",
  "MTL":"Canadiens",
  "DET":"Red Wings",
  "OTT":"Senators",
  "TOR":"Maple Leafs",
  "FLA":"Panthers",
  "BUF":"Sabres",
  "PIT":"Penguins",
  "NYR":"Rangers",
  "PHI":"Flyers",
  "CBJ":"Blue Jackets",
  "WSH":"Capitals",
  "NJD":"Devils",
  "CAR":"Hurricanes",
  "NYI":"Islanders"
};

var reverseAbbr = function(teamName) {
  return Object.keys(abbrHash).filter(function(key) {
    return abbrHash[key] == teamName;
  })[0];
};

var int = function(num) { return parseInt(num, 10); };

module.exports = function(get) {
  return {
    "stats": {
      fn: function(data, nick) {
        return getPlayerName(data).then(getYahooRegularStats).then(function(json) {
          var curSeason = Object.keys(json.seasons).pop();
          var profile = json.profile;
          var stats = json.seasons[curSeason];

          var profileLine = [
            profile.name,
            profile.team + " " + profile.position + " " + profile.number,
            profile.height.replace('-', "'") + '" ' + profile.weight + 'lbs',
            formatDraft(profile.draft),
            'Born on ' + profile.birthday + ' in ' + profile.birthplace
          ];
          var statsLine;
          if(profile.position !== 'G') {
            var faceoffs = (parseInt(stats.fw, 10) / (parseInt(stats.fw, 10) + parseInt(stats.fl, 10))) * 1000;
            faceoffs |= 0;
            statsLine = [
              curSeason,
              stats.team.toUpperCase(),
              'GP ' + stats.gp,
              'G ' + stats.g,
              'A ' + stats.a,
              'P ' + stats.p,
              '+/- ' + stats.pm,
              'PIM ' + stats.pim,
              'HITS ' + stats.hit,
              'BLKS ' + stats.blk,
              'FW ' + stats.fw,
              'FL ' + stats.fl,
              'FO% ' + toPercent(parseInt(stats.fw, 10) / (parseInt(stats.fw, 10) + parseInt(stats.fl, 10))),
              'PPG ' + stats.ppg,
              'PPA ' + stats.ppa,
              'SHG ' + stats.shg,
              'SHA ' + stats.sha,
              'GWG ' + stats.gwg,
              'SOG ' + stats.sog,
              'PCT ' + toPercent(parseInt(stats.g, 10) / (parseInt(stats.sog, 10)))
            ];
          } else {
            statsLine = [
              curSeason,
              stats.team.toUpperCase(),
              'GP ' + stats.gp,
              'GS ' + stats.gs,
              'MIN ' + stats.min,
              'W ' + stats.w,
              'L ' + stats.l,
              'OTL ' + stats.otl,
              'GA ' + stats.ga,
              'GAA ' + stats.gaa,
              'SA ' + stats.sa,
              'SV ' + stats.sv,
              'SV% ' + toPercent(parseInt(stats.sv, 10) / (parseInt(stats.sa, 10))),
              'SO ' + stats.so
            ];
          }

          this.log(nick + ' asked for the regular season stats for ' + profile.name);
          this.talk(profileLine.join(' | ') + "\n" + statsLine.join(' | '));
          updateNames(this);
        }.bind(this), function(e) {
          console.log(e);
        });
      }
    },
    "astats": "statsfancy",
    "fancystats": "statsfancy",
    "statsfancy": {
      fn: function(data, nick) {
        return getPlayerName(data).then(function(name) {
          return Q.all([getYahooRegularStats(name), getExtraSkaterStats(name)]);
        }).spread(function(yahoo, es) {
          var curSeason = Object.keys(yahoo.seasons).pop();
          var profile = yahoo.profile;
          var stats = es[curSeason];

          var profileLine = [
            profile.name,
            profile.team + " " + profile.position + " " + profile.number,
            profile.height.replace('-', "'") + '" ' + profile.weight + 'lbs',
            formatDraft(profile.draft),
            'Born on ' + profile.birthday + ' in ' + profile.birthplace
          ];

          var statsLine = [
            'GP ' + stats.gp,
            'TOI ' + stats.toi,
            'GF% ' + stats.gfp,
            'GF% rel ' + stats.gfp_rel,
            'CF% ' + stats.cfp,
            'CF% rel ' + stats.cfp_rel,
            'FF% ' + stats.ffp,
            'FF% rel ' + stats.ffp_rel,
            'SF% ' + stats.sfp,
            'SF% rel ' + stats.sfp_rel,
            'Sh% ' + stats.shp,
            'Sv% ' + stats.svp,
            'PDO ' + stats.pdo
          ];

          this.log(nick + ' asked for the regular season fancy stats for ' + profile.name);
          this.talk(profileLine.join(' | ') + "\n" + statsLine.join(' | '));
          updateNames(this);
        }.bind(this)).fail(function(e) {
          console.log(e);
        });
      }
    },
    "asummary": "summaryfancy",
    "fancysummary": "summaryfancy",
    "summaryfancy": {
      fn: function(data, nick) {
        if(abbrHash[data.join(' ').toUpperCase()]) {
          chosenTeam = abbrHash[data.join(' ').toUpperCase()].toLowerCase();
        } else {
          chosenTeam = data.join(' ').toLowerCase();
        }
        return HTTP.read('http://www.extraskater.com/').then(function(b) {
          var $ = cheerio.load(b.toString());
          var gamesToday = $('h3').filter(function() { return $(this).text().indexOf('Games for') > -1; }).next('div.row');
          var chosen = Array.prototype.filter.call(gamesToday.find('table'), function(table) {
            var teams = $(table).find('td:not(.game-status):not(.number-right)');
            teams = Array.prototype.map.call(teams, function(td) { return $(td).text().toLowerCase(); });
            return teams.indexOf(chosenTeam) > -1;
          })[0];
          if(chosen) {
            var uri = 'http://www.extraskater.com' + $(chosen).attr('onclick').replace("location.href='",'').replace("'",'');
            return HTTP.read(uri);
          } else {
            throw new Error();
          }
        }).then(function(b) {
          var $ = cheerio.load(b.toString());
          
          var titleParse = $('h2').text().match(/^(\d{4}-\d{2}-\d{2}): (.+) (\d+) at (.+) (\d+) - (\d+:\d+) (\d\w+)/);
          var gameInfo = reverseAbbr(titleParse[2]) + " " + titleParse[3] + " " + reverseAbbr(titleParse[4]) + " " + titleParse[5] + " (" + titleParse[6] + " " + titleParse[7] + ")";
          
          var stats = {};
          var idx = Array.prototype.map.call($('tr.team-game-stats-all').find('td a'), function(el, i){ return [$(el).text(), i] }).filter(function(pair) { return pair[0].indexOf(titleParse[2]) > -1; })[0][1];
          Array.prototype.forEach.call($($('tr.team-game-stats-all')[idx]).children('td.number-right'), function(td, i) {
            if(KEYS.esSummary[i]) {
              stats[KEYS.esSummary[i]] = $(td).text();
            }
          });
          
          var pdoA = humanize.numberFormat(100 * (int(stats.gf) / int(stats.sf) + 1 - int(stats.ga) / int(stats.sa)), 1);
          var pdoH = humanize.numberFormat(100 * (int(stats.ga) / int(stats.sa) + 1 - int(stats.gf) / int(stats.sf)), 1);
          var shA = humanize.numberFormat(100 * int(stats.gf) / int(stats.sf), 1);
          var shH = humanize.numberFormat(100 * int(stats.ga) / int(stats.sa), 1);
          var svA = humanize.numberFormat(100 * (1 - int(stats.ga) / int(stats.sa)), 1);
          var svH = humanize.numberFormat(100 * (1 - int(stats.gf) / int(stats.sf)), 1);

          var summary = [
            gameInfo,
            "SOG " + [stats.sf, stats.sa].join('-'),
            "Corsi " + [stats.cf, stats.ca].join('-'),
            "Fenwick " + [stats.ff, stats.fa].join('-'),
            "Sh% " + [shA, shH].join('-'),
            "Sv% " + [svA, svH].join('-'),
            "PDO " + [pdoA, pdoH].join('-')
          ];
          this.log(nick + " asked for the fancy game summary for '" + data.join(' ') + "'.");
          this.talk(summary.join(" | "));
        }.bind(this), function() {
          this.log(nick + " asked for the fancy game summary for '" + data.join(' ') + "', but that was not found.");
          this.talk("No game found.");
        }.bind(this));
      }
    },
    "cap": {
      fn: function(data, nick) {
        return getPlayerName(data).then(function(name) {
          return Q.all([getYahooRegularStats(name), getCapInfo(name)]);
        }).spread(function(yahoo, cg) {
          console.log(yahoo.profile, cg);
          return;
          var curSeason = Object.keys(yahoo.seasons).pop();
          var profile = yahoo.profile;
          var stats = es[curSeason];

          var profileLine = [
            profile.name,
            profile.team + " " + profile.position + " " + profile.number,
            profile.height.replace('-', "'") + '" ' + profile.weight + 'lbs',
            formatDraft(profile.draft),
            'Born on ' + profile.birthday + ' in ' + profile.birthplace
          ];

          var statsLine = [
            'GP ' + stats.gp,
            'TOI ' + stats.toi,
            'GF% ' + stats.gfp,
            'GF% rel ' + stats.gfp_rel,
            'CF% ' + stats.cfp,
            'CF% rel ' + stats.cfp_rel,
            'FF% ' + stats.ffp,
            'FF% rel ' + stats.ffp_rel,
            'SF% ' + stats.sfp,
            'SF% rel ' + stats.sfp_rel,
            'Sh% ' + stats.shp,
            'Sv% ' + stats.svp,
            'PDO ' + stats.pdo
          ];

          this.log(nick + ' asked for the regular season fancy stats for ' + profile.name);
          this.talk(profileLine.join(' | ') + "\n" + statsLine.join(' | '));
          updateNames(this);
        }.bind(this)).fail(function(e) {
          console.log(e);
        });
      }
    }
  };
};
