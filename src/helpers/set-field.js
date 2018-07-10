const makeDebug = require('debug');
const { cloneDeep, compact, defaults, find, get, set } = require('lodash');
const fp = require('mostly-func');

const debug = makeDebug('mostly:feathers-mongoose:helpers');

// set field by path
module.exports = function setField (item, target, data, field, options) {
  //debug('setField ==== %s, \n  >>>> %s / %s, \n  >>>> %s ',
  //  util.inspect(item), target, field, util.inspect(data));
  options = options || {};

  field = field || target;
  let parts = field.split('.');
  let key = parts.pop();
  let value = item, part;
  while (parts.length) {
    part = parts.shift();
    if (value[part] !== undefined) value = value[part];
    if (fp.isArray(value) && parts.length > 0) {
      let subValue = fp.map(fp.prop(parts[0]), value);
      if (fp.any(fp.isArray, subValue)) {
        value = [].concat.apply([], subValue); // flatten the array of array
        continue;
      } else {
        key = [...parts, key].join('.');
        break;
      }
    }
  }

  if (!value) {
    warn(0, '<nothing-to-setField>');
    return; // nothing to setField
  }

  function warn (which, id) {
    debug(' >>> WARN %d: setField %s/%s(id=%j) not found with item %s',
      which, target, field, id, item[options.idField]);
  }

  // avoid duplicate setField
  function cloneById (v, k) {
    if (Array.isArray(v)) {
      let match = find(v, it => String(it[options.idField]) === String(k));
      return match? cloneDeep(match) : (options.keepOrig? k : null);
    } else {
      return String(v[options.idField]) === String(k)? cloneDeep(v) : (options.keepOrig? k : null);
    }
  }

  if (Array.isArray(value)) {
    value.forEach(function (v) {
      let entry = get(v, key);
      if(Array.isArray(entry)) {
        set(v, key, compact(entry.map(it => {
          let id = options.path? it[options.idField] : it;
          let clone = id? cloneById(data, id) : (options.keepOrig? entry._value : null);
          return options.retained? defaults(it, clone) : clone;
        })));
        if (!get(v, key)) warn(1, entry);
      } else {
        let id = options.path? entry[options.idField] : entry;
        let clone = id? cloneById(data, id) : (options.keepOrig? entry._value : null);
        set(v, key, options.retained? defaults(entry, clone) : clone);
        if (!get(v, key)) warn(2, entry);
      }
    });
  } else {
    if (value && value[key]) {
      let entry = get(value, key);
      if (Array.isArray(entry)) {
        set(item, target, compact(entry.map(it => {
          let id = options.path? it[options.idField] : it;
          let clone = id? cloneById(data, id) : (options.keepOrig? entry._value : null);
          return options.retained? defaults(it, clone) : clone;
        })));
        if (!get(item, target)) warn(3, entry);
      } else {
        let id = options.path? entry[options.idField] : entry;
        let clone = id? cloneById(data, id) : (options.keepOrig? entry._value : null);
        set(item, target, options.retained? defaults(entry, clone) : clone);
        if (!get(item, target)) warn(4, entry);
      }
    } else {
      //warn(4, 'skip <no-such-field>');
    }
  }
  return item;
};