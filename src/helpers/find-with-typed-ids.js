const fp = require('mostly-func');

const findEntriesByType = require('./find-entries-by-type');

// find with typed ids = require(various descriminated services
module.exports = function findWithTypedIds (app, list, params, options) {
  if (!fp.isValid(list)) return Promise.resolve(list);

  const typeAndIds = fp.map(typed => {
    const field = fp.split(':', typed);
    return { type: fp.head(field), id: fp.last(field) };
  }, list);
  const entriesByType = fp.groupBy(fp.prop('type'), typeAndIds);

  // find the grouped entries by descriminated service
  return findEntriesByType(app, entriesByType, params, options);
};