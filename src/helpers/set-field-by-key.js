const { cloneDeep, set, map } = require('lodash');

module.exports = function setFieldByKey (item, field, data) {
  let parts = field.split('.');
  let key = parts.pop();
  let value = item, part;
  while (parts.length) {
    part = parts.shift();
    value = value[part];
  }
  if (!value) return; // nothing to setField

  if (Array.isArray(value) && !value[key]) {
    value.forEach(function (v) {
      let id = v[key];
      if (Array.isArray(id)) {
        set(v, key, map(id, it => data[it] || it));
      } else {
        set(v, key, data[id] || id);
      }
    });
  } else {
    if (value && value[key]) {
      let id = value[key];
      if (Array.isArray(id)) {
        set(item, field, map(id, it => data[it] || it));
      } else {
        set(item, field, data[id] || id);
      }
    }
  }

  return cloneDeep(item);
};