const fp = require('mostly-func');

module.exports = function sortWith (sort, data) {
  const descSorts = ['desc', 'descending', '-1', -1];
  var propSort = fp.mapObjIndexed((dir, field) => {
    if (descSorts.indexOf(dir) === -1) {
      return fp.ascend(fp.prop(field));
    } else {
      return fp.descend(fp.prop(field));
    }
  }, sort);
  return fp.sortWith(fp.values(propSort), data);
};