import makeDebug from 'debug';
import { cloneDeep, compact, defaults, find, flatten, get, set, map } from 'lodash';
import fp from 'ramda';
import { plural } from 'pluralize';

const debug = makeDebug('mostly:feathers-mongoose:helpers');

// get field by path, supporting `array.field`
export function getField(item, field) {
  let parts = field.split('.');
  let value = item, part;
  while (parts.length) {
    part = parts.shift();
    if (Array.isArray(value)) {
      value = map(value, part);
    } else {
      value = value? value[part] : null;
    }
  }

  return Array.isArray(value) ? compact(flatten(value)) : value;
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

  if (Array.isArray(value) && !value[key]) {
    value.forEach(function(v) {
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
    if (Array.isArray(value) && parts.length > 0) {
      key = [...parts, key].join('.');
      debug('setField with upper array', value, key);
      break;
    }
  }

  if (!value) {
    warn(0, '<nothing-to-setField>');
    return; // nothing to setField
  }

  function warn(which, id) {
    debug(' >>> WARN %d: setField %s/%s(id=%j) not found with item %s',
      which, target, field, id, item[options.idField]);
  }

  // avoid duplicate setField
  function cloneById(v, k) {
    if (Array.isArray(v)) {
      let match = find(v, it => String(it[options.idField]) === String(k));
      return match ? cloneDeep(match) : (options.preserveOrigin ? k : null);
    } else {
      return String(v[options.idField]) === String(k)? cloneDeep(v) : (options.preserveOrigin ? k : null);
    }
  }

  if (Array.isArray(value) && !value[key]) {
    value.forEach(function(v) {
      let entry = get(v, key);
      if(Array.isArray(entry)) {
        set(v, key, entry.map(it => {
          let id = options.path? it[options.idField] : it;
          let clone = cloneById(data, id);
          return options.retained? defaults(it, clone) : clone;
        }));
        if (!get(v, key)) warn(1, entry);
      } else {
        let id = options.path? entry[options.idField] : entry;
        let clone = cloneById(data, id);
        set(v, key, options.retained? defaults(entry, clone) : clone);
        if (!get(v, key)) warn(2, entry);
      }
    });
  } else {
    if (value && value[key]) {
      let entry = get(value, key);
      if (Array.isArray(entry)) {
        set(item, target, entry.map(it => {
          let id = options.path? it[options.idField] : it;
          let clone = cloneById(data, id);
          return options.retained? defaults(it, clone) : clone;
        }));
        if (!get(item, target)) warn(3, entry);
      } else {
        let id = options.path? entry[options.idField] : entry;
        let clone = cloneById(data, id);
        set(item, target, options.retained? defaults(entry, clone) : clone);
        if (!get(item, target)) warn(4, entry);
      }
    } else {
      warn(4, '<no-such-field>');
    }
  }
}

export function reorderPosition(Model, item, newPos, options = {}) {
  const prevPos = parseInt(item.position);
  newPos = parseInt(newPos);

  const whichWay = (newPos > prevPos) ? -1 : 1;
  const start = (newPos > prevPos) ? prevPos + 1 : newPos;
  const end = (newPos > prevPos) ? newPos : prevPos - 1;

  const cond = {
    position: { '$gte': start, '$lte': end }
  };
  if (options.classify) {
    cond[options.classify] = { $eq : item[options.classify] };
  }
  return Model.update(cond, { $inc: { position: whichWay } }, { multi: true })
    .then(() => {
      return Model.findOneAndUpdate({ _id: item._id || item.id }, { position: newPos });
    });
}

const populateList = (list, idField, options = {}) => (data) => {
  return fp.map((doc) => {
    let item = data.find((item) => {
      return String(doc[idField]) === String(item.id);
    });
    // retain _id for orignal id
    const retained = fp.reduce((acc, field) => {
      acc['_' + field] = doc[field];
      return acc;
    }, {});
    return item && fp.mergeAll([retained(options.retained || []), doc, item]);
  })(list);
};

export function populateByService(app, idField, typeField, options = {}) {
  return (list) => {
    let types = fp.groupBy(fp.prop(typeField), list);
    return Promise.all(
      Object.keys(types).map((type) => {
        let entries = types[type];
        return app.service(plural(type)).find(Object.assign({
          query: {
            _id: { $in: fp.map(fp.prop(idField), entries) },
          }
        }, options));
      })
    ).then((results) => {
      return fp.pipe(
        fp.map(fp.prop('data')),
        fp.flatten,
        populateList(list, idField, options),
        fp.reject(fp.isNil)
      )(results);
    });
  };
}
