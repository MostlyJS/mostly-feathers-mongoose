const fp = require('mostly-func');
const getHookData = require('./get-hook-data');

module.exports = function getHookDataAsArray (context) {
  const items = getHookData(context);
  return items? fp.asArray(items) : [];
};