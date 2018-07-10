const fp = require('mostly-func');

const repeatDoubleStar = fp.map(fp.replace(/(\w*).\*\*/, '$1.$1.**'));

module.exports = function normalizeSelect (select) {
  if (select) {
    // convert string $select to array
    if (fp.is(String, select)) {
      select = fp.map(fp.trim, fp.split(',', select));
    }
    // repeat ** as recursive fields
    select = repeatDoubleStar(select);
  }
  return select;
};