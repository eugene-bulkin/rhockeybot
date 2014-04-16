rhockeybot
==========

\#reddit-hockey irc bot for the Yahoo! fantasy hockey league.

Does not scale to other leagues at this moment.

### Authentication
To properly authenticate the bot, first create an `api.json` file with two keys, `key` and `secret` corresponding to the consumer key and consumer secret of your Yahoo! API Project. To find these, go to Yahoo! Developer Network / My Projects and click on your project; the keys will be there.

Then run the bot with the command `node bot.js auth` and follow the directions on the terminal. Then you may start the bot normally, running `node bot.js`.