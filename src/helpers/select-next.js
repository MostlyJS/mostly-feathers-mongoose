const fp = require('mostly-func');
const normalizeSelect = require('./normalize-select');

module.exports = function selectNext (target, select) {
  if (select) {
    // normalize the $select
    select = normalizeSelect(select);
    // filter and replace current target = require(the $select
    return fp.pipe(
      fp.filter(fp.startsWith(target)),
      fp.map(fp.replace(new RegExp('^' + target + '\.?'), '')),
      fp.reject(fp.isEmpty),
      fp.unless(fp.isEmpty, fp.append('*')) // add * for non-empty
    )(select);
  }
  return select;
};