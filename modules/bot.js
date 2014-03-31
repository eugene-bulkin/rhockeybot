var fs = require('fs');

module.exports = function(get) {
  return {
    "reload": {
      fn: function(data, nick) {
        if(nick !== "DoubleAW" && nick !== "AWAW") {
          this.log(nick + " tried to reload commands.");
          this.talk("You can't do that.");
          return;
        }
        this.reload();
        this.talk("Done.");
      }
    },
    "log": {
      fn: function(data, nick) {
        if(nick !== "DoubleAW" && nick !== "AWAW") {
          this.log(nick + " tried to read the log");
          this.talk("You can't do that.");
          return;
        }
        fs.readFile('./bot.log', function(err, data) {
          if(err) {
            this.log('Error reading out log.');
          } else {
            var log = data.toString().split("\n").reverse().slice(0, 11).reverse().join("\n");
            this.client.say(nick, log);
            this.log("Log sent to " + nick);
          }
        }.bind(this));
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
          this.talk(nick + ": " + "The following commands are available: " + cmds.join(", "));
        } else {
          if(this.help[data[0]]) {
            this.log("Read help to " + nick + " for !" + data[0]);
            this.talk(this.help[data[0]]);
          } else if(this.help["~" + data[0]]) {
            this.log("Read help to " + nick + " for !" + data[0]);
            this.talk(this.help["~" + data[0]]);
          } else {
            this.log("Told " + nick + " the '" + data[0] + "' command does not exist");
            this.talk(nick + ": " + "There is no help available for '" + data[0] + "'.");
          }
        }
      }
    }
  };
};