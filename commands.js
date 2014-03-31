var modules = [
  "silly",
  "fantasy",
  "bot"
];

module.exports = function(get) {
  var result = {};
  modules.forEach(function(moduleName) {
    delete require.cache[Object.keys(require.cache).filter(function(m) {
      return m.match(new RegExp(moduleName + '\\.js'));
    })[0]];
    var m = require('./modules/' + moduleName + '.js')(get);
    Object.keys(m).forEach(function(k) {
      result[k] = m[k];
    }, this);
  }, this);
  return result;
};
