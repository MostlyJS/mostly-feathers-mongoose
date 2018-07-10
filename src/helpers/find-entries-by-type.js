const fp = require('mostly-func');
const { plural } = require('pluralize');

const sortWith = require('./sort-with');

// find with a groupby entries like { 'type1': [{ id: 1 }, { id: 2 }] }
module.exports = function findEntriesByType (app, entriesByType, params = {}, options = {}) {
  // find by descriminated service
  const findByType = fp.mapObjIndexed((entries, type) => {
    if (options.skipType && type === options.skipType) {
      return Promise.resolve(entries);
    } else {
      let typeParams = fp.assignAll({ query: {} }, params); // copy for change
      typeParams.query.id = {
        $in: fp.map(fp.prop('id'), entries)
      };
      if (!typeParams.query.$sort) {
        typeParams.query.$sort = options.sort; // default sort
      }
      typeParams.paginate = false;
      return app.service(plural(type)).find(typeParams);
    }
  });

  const promises = fp.values(findByType(entriesByType));
  return Promise.all(promises).then(entries => {
    // merge the results
    const data = fp.flatMap(fp.propOf('data'), entries);
    // sort again
    if (entries.length > 1) {
      const sort = fp.dotPath('query.$sort', params) || options.sort;
      return sort? sortWith(sort, data) : data;
    } else {
      return data;
    }
  });
};
