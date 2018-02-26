import makeDebug from 'debug';
import { cloneDeep, compact, defaults, find, flatten, get, set, map } from 'lodash';
import fp from 'mostly-func';
import { plural } from 'pluralize';
import validator from 'validator';

const debug = makeDebug('mostly:feathers-mongoose:helpers');

// get field by path, supporting `array.field`
export function getField(item, field) {
  let parts = field.split('.');
  let value = item, part;
  while (parts.length) {
    part = parts.shift();
    if (Array.isArray(value)) {
      value = fp.pipe(
        fp.map(fp.prop(part)),
        fp.reject(fp.isNil),
        fp.flatten
      )(value);
    } else {
      value = value? value[part] : null;
    }
  }

  return Array.isArray(value) ? fp.filter(fp.identity, value) : value;
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
        set(v, key, compact(entry.map(it => {
          let id = options.path? it[options.idField] : it;
          let clone = cloneById(data, id);
          return options.retained? defaults(it, clone) : clone;
        })));
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
        set(item, target, compact(entry.map(it => {
          let id = options.path? it[options.idField] : it;
          let clone = cloneById(data, id);
          return options.retained? defaults(it, clone) : clone;
        })));
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
  const prevPos = parseInt(item.position || 0);
  newPos = parseInt(newPos || 0);

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

// get mongo obj.id or id as string
export const getId = fp.curry((idField, obj) => {
  if (obj) {
    if (fp.is(String, obj)) return obj;
    if (validator.isMongoId(obj.toString())) return obj.toString();
    if (obj[idField]) return getId(idField, obj[idField]);
  }
  return null;
});

export const repeatDoubleStar = fp.map(fp.replace(/(\w*).\*\*/, '$1.$1.**'));

export const normalizeSelect = function (select) {
  if (select) {
    // convert string $select to array
    if (fp.is(String, select)) {
      select = fp.map(fp.trim, fp.split(',', select));
    }
    // repeat ** as recursive fields
    select = repeatDoubleStar(select);
  }
  return select;
};

export const isSelected = (target, select) => {
  if (select) {
    // normalize the $select
    select = normalizeSelect(select);
    // check whether target is in the $select
    return fp.any(fp.startsWith(target), select);
  }
  return false;
};

export const selectNext = (target, select) => {
  if (select) {
    // normalize the $select
    select = normalizeSelect(select);
    // filter and replace current target from the $select
    return fp.pipe(
      fp.filter(fp.startsWith(target)),
      fp.map(fp.replace(new RegExp('^' + target + '\.?'), '')),
      fp.reject(fp.isEmpty),
      fp.when(fp.complement(fp.isEmpty), fp.append('*')) // add * for non-empty
    )(select);
  }
  return select;
};

export const sortWith = (sort, data) => {
  const descSorts = ['desc', 'descending', '-1', -1];
  var propSort = fp.mapObjIndexed((dir, field) => {
    console.log(descSorts.indexOf(dir));
    if (descSorts.indexOf(dir) === -1) {
      return fp.ascend(fp.prop(field));
    } else {
      return fp.descend(fp.prop(field));
    }
  }, sort);
  return fp.sortWith(fp.values(propSort), data);
};

export const discriminatedFind = (app, keyType, result, params, options) => {
  if (result && result.data && result.data.length > 0) {
    const entriesByType = fp.groupBy(fp.prop('type'), result.data);
    const findByType = fp.mapObjIndexed((entries, type) => {
      if (type === keyType) {
        return Promise.resolve(entries);
      } else {
        const paramsIds = fp.assocDotPath('query.id', {
          $in: fp.map(fp.prop('id'), entries)
        }, params);
        return app.service(plural(type)).find(paramsIds);
      }
    });
    const promises = fp.values(findByType(entriesByType));
    return Promise.all(promises).then(entries => {
      const data = fp.flatten(fp.map(entry => (entry && entry.data) || entry, entries));
      const sort = params && fp.dotPath('query.$sort', params) || options.sort;
      result.data = sort? sortWith(sort, data) : data;
      return result;
    });
  } else {
    return result;
  }
};

export const discriminatedGet = (app, keyType, result, params) => {
  if (result && result.type && result.type !== keyType) {
    return app.service(plural(result.type)).get(result.id, params);
  } else {
    return result;
  }
};

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
      fp.map((type) => {
        let entries = types[type];
        return app.service(plural(type)).find(Object.assign({
          query: {
            _id: { $in: fp.map(fp.prop(idField), entries) },
          }
        }, options));
      }, Object.keys(types))
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
