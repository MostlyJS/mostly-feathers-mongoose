const fp = require('mostly-func');

module.exports = function prefixSelect (select, prefix) {
  const fields = fp.splitOrArray(select);
  return fp.map(fp.concat(prefix + '.'), fields);
};