const fp = require('mostly-func');
const normalizeSelect = require('./normalize-select');

module.exports = function addToSelect (select, ...args) {
  select = select? normalizeSelect(select) : [];
  return fp.uniq(select.concat(args));
};