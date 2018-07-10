const fp = require('mostly-func');
const normalizeSelect = require('./normalize-select');

module.exports = function isSelected (target, params) {
  let select = (params.query || {}).$select;
  if (select) {
    // normalize the $select
    select = normalizeSelect(select);
    // check whether target is in the $select
    return fp.any(fp.startsWith(target), select);
  }
  return false;
};