const errors = require('feathers-errors');
const fp = require('mostly-func');
const { getHookData, isSelected, setHookData } = require('../helpers');

const defaultOptions = {
  idField: 'id'
};

const mergeField = function (prop, data, options) {
  let value = fp.prop(prop, data);
  if (fp.isNil(value) || fp.isIdLike(value)) {
    value = { [options.idField]: value };
  }
  // merge left except the idField, and keep populated object
  return fp.mergeWithKey((k, l, r) => {
    if (k === options.idField) return r;
    return fp.isIdLike(r)? l : r;
  }, fp.omit(prop, data), value);
};

const mergeData = function (field, data, options) {
  const path = fp.init(field.split('.'));
  const prop = fp.last(field.split('.'));
  const merge = data => {
    const fieldData = path.length? fp.path(path, data) : data;
    if (fieldData) {
      const result = fp.isArray(fieldData)
        ? fp.map(item => mergeField(prop, item, options), fieldData)
        : mergeField(prop, fieldData, options);
      return path.length? fp.assocPath(path, result, data) : result;
    } else {
      return data;
    }
  };
  if (Array.isArray(data)) {
    let results = fp.map(merge, data);
    if (results && options.sort) {
      results = fp.sortBy(fp.prop(options.sort), results);
    }
    return results;
  } else {
    return merge(data);
  }
};

module.exports = function flatMerge (field, opts) {

  return async context => {
    let options = fp.assignAll(defaultOptions, opts);
    
    if (context.type !== 'after') {
      throw new errors.GeneralError('Can not merge on before hook.');
    }

    const data = getHookData(context);
    if (fp.isNil(data) || fp.isEmpty(data)) return context;

    // field must be specified by $select to flatMerge
    if (!isSelected(field, context.params)) return context;

    const results = mergeData(field, data, options);
    setHookData(context, results);

    return context;
  };
};