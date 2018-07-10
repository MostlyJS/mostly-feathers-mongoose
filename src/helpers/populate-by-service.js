const fp = require('mostly-func');
const { plural } = require('pluralize');

const populateList = (list, idField, options = {}) => (data) => {
  return fp.map((obj) => {
    let item = data.find((item) => {
      return String(obj[idField]) === String(item.id);
    });
    if (options.merge) {
      // retain _id for original id
      const retained = fp.reduce((acc, field) => {
        acc['_' + field] = obj[field];
        return acc;
      }, {});
      return item && fp.mergeAll([retained(options.retained || []), obj, item]);
    } else {
      obj[idField] = item;
      return obj;
    }
  })(list);
};

module.exports = function populateByService (app, idField, typeField, options = {}) {
  return (list) => {
    let types = fp.groupBy(fp.prop(typeField), list);
    return Promise.all(
      fp.map(type => {
        let entries = types[type];
        return app.service(plural(type)).find(Object.assign({
          query: {
            _id: { $in: fp.uniq(fp.map(fp.prop(idField), entries)) },
          },
          paginate: false
        }, options));
      }, Object.keys(types))
    ).then(results => {
      const data = fp.flatten(results);
      const populated = populateList(list, idField, options)(data);
      return fp.reject(fp.isNil, populated);
    });
  };
};