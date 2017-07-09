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
      which, target, field, id, item.id || item._id);
  }

  // avoid duplicate setField
  function cloneById(v, k) {
    if (isArray(v)) {
      let match = find(v, it => toString(it.id || it._id) === toString(k));
      return match ? cloneDeep(match) : (options.preserveValue ? k : null);
    } else {
      return toString(v.id || v._id) === toString(k)? cloneDeep(v) : (options.preserveValue ? k : null);
    }
  }

  if (isArray(value) && !value[key]) {
    value.forEach(function(v) {
      let id = v[key];
      if(Array.isArray(id)) {
        let dest = [];
        id.forEach(item => {
          dest.push(cloneById(data, item));
        });
        set(v, key, dest);
      }
      else {
        set(v, key, cloneById(data, id));
        if (!get(v, key)) warn(1, id);
      }
    });
  } else {
    if (value && value[key]) {
      let id = value[key];
      if (isArray(id)) {
        set(item, target, map(id, vk => cloneById(data, vk)));
        if (!get(item, target)) warn(2, id);
      } else {
        set(item, target, cloneById(data, id));
        if (!get(item, target)) warn(3, id);
      }
    } else {
      warn(4, '<no-such-field>');
    }
  }
}
