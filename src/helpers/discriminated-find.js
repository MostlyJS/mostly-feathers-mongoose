const fp = require('mostly-func');

const findEntriesByType = require('./find-entries-by-type');

// find and merge the results = require(various descriminated services
module.exports = function discriminatedFind (app, keyType, result, params, options) {
  if (!result || !fp.isValid(fp.propOf('data', result))) {
    return Promise.resolve(result);
  }

  const entriesByType = fp.groupBy(fp.prop('type'), fp.propOf('data', result));

  // find the grouped entries by descriminated service
  return findEntriesByType(app, entriesByType, params, options).then(data => {
    if (fp.hasProp('data', result)) {
      result.data = data;
    } else {
      result = data;
    }
    return result;
  });
};