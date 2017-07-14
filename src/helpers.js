import { cloneDeep, find, flatten, get, set, isArray, map, toString } from 'lodash';

// get field by path, supporting `array.field`
export function getField(item, field) {
  let parts = field.split('.');
  let value = item, part;
  while (parts.length) {
    part = parts.shift();
    if (isArray(value)) {
      value = map(value, part);
    } else {
      value = value? value[part] : null;
    }
  }

  return Array.isArray(value) ? flatten(value) : value;
}

export function setFieldByKey(item, field, data) {
  let parts = field.split('.');
  let key = parts.pop();
  let value = item, part;
  while (parts.length) {
    part = parts.shift();
    value = value[part];
  }
  if (!value) return; // nothing to setField

  if (isArray(value) && !value[key]) {
    value.forEach(function(v) {
      let id = v[key];
      if (isArray(id)) {
        set(v, key, map(id, it => data[it] || it));
      } else {
        set(v, key, data[id] || id);
      }
    });
  } else {
    if (value && value[key]) {
      let id = value[key];
      if (isArray(id)) {
        set(item, field, map(id, it => data[it] || it));
      } else {
        set(item, field, data[id] || id);
      }
    }
  }

  return cloneDeep(item);
}

// get field by path
export function setField(item, target, data, field, options) {
  //debug('setField ==== %s, \n  >>>> %s / %s, \n  >>>> %s ',
  //  util.inspect(item), target, field, util.inspect(data));
  options = options || {};

  field = field || target;
  let parts = field.split('.');
  let key = parts.pop();
  let value = item, part;
  while (parts.length) {
    part = parts.shift();
    value = value[part];
  }
  if (!value) return; // nothing to setField

  function warn(which, id) {
    console.warn(' >>> WARN %d: setField %s/%s(id=%j) not found with item %s',
      which, target, field, id, item[options.idField]);
  }

  // avoid duplicate setField
  function cloneById(v, k) {
    if (isArray(v)) {
      let match = find(v, it => toString(it[options.idField]) === toString(k));
      return match ? cloneDeep(match) : (options.preserveValue ? k : null);
    } else {
      return toString(v[options.idField]) === toString(k)? cloneDeep(v) : (options.preserveValue ? k : null);
    }
  }

  if (isArray(value) && !value[key]) {
    value.forEach(function(v) {
      let entry = v[key];
      if(Array.isArray(entry)) {
        set(v, key, entry.map(it => {
          let id = options.serviceBy? it[options.idField] : it;
          return cloneById(data, id);
        }));
        if (!get(v, key)) warn(1, entry);
      } else {
        let id = options.serviceBy? entry[options.idField] : entry;
        set(v, key, cloneById(data, id));
        if (!get(v, key)) warn(2, entry);
      }
    });
  } else {
    if (value && value[key]) {
      let entry = value[key];
      if (isArray(entry)) {
        set(item, target, entry.map(it => {
          let id = options.serviceBy? it[options.idField] : it;
          return cloneById(data, id);
        }));
        if (!get(item, target)) warn(3, entry);
      } else {
        let id = options.serviceBy? entry[options.idField] : entry;
        set(item, target, cloneById(data, id));
        if (!get(item, target)) warn(4, entry);
      }
    } else {
      warn(4, '<no-such-field>');
    }
  }
}
