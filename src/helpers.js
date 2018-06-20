import makeDebug from 'debug';
import { cloneDeep, compact, defaults, find, flatten, get, set, map } from 'lodash';
import fp from 'mostly-func';
import { plural } from 'pluralize';

const debug = makeDebug('mostly:feathers-mongoose:helpers');

// get field by path, supporting `array.field`
export function getField (item, field) {
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

export function setFieldByKey (item, field, data) {
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
}

// set field by path
export function setField (item, target, data, field, options) {
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
      return match ? cloneDeep(match) : (options.keepOrig ? k : null);
    } else {
      return String(v[options.idField]) === String(k)? cloneDeep(v) : (options.keepOrig ? k : null);
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
}

const unsetIdv = function (obj) {
  if (obj && obj._id) {
    return fp.pipe(
      fp.assoc('id', String(obj.id || obj._id)),
      fp.dissoc('_id'),
      fp.dissoc('__v')
    )(obj);
  } else {
    return obj;
  }
};

const unsetObj = function (obj) {
  if (Array.isArray(obj)) {
    return fp.map(unsetIdv, obj);
  } else {
    return unsetIdv(obj);
  }
};

// transform the results
export const transform = function (results) {
  if (results) {
    if (fp.has('data', results)) {
      results.data = unsetObj(results.data);
    } else {
      results = unsetObj(results);
    }
  }
  return results;
};

export const reorderPosition = async function (Model, item, newPos, options) {
  const idField = options.idField || '_id';
  const prevPos = parseInt(item.position || 0);
  newPos = parseInt(newPos || 0);

  const whichWay = (newPos > prevPos) ? -1 : 1;
  const start = (newPos > prevPos) ? prevPos + 1 : newPos;
  const end = (newPos > prevPos) ? newPos : prevPos - 1;

  const others = {
    position: { '$gte': start, '$lte': end }
  };
  if (options.classify) {
    others[options.classify] = { $eq : item[options.classify] };
  }
  // update others position one way down
  await Model.update(others, {
    $inc: { position: whichWay }
  }, {
    multi: true
  });

  const cond = {
    [idField]: item._id || item.id
  };
  if (options.classify) {
    cond[options.classify] = { $eq : item[options.classify] };
  }
  // update position of the item
  return Model.findOneAndUpdate(cond, {
    position: newPos
  }, {
    new : true
  });
};

// get mongo id as string (object, mongo id, typed id)
export const pathId = fp.curry((idField, obj) => {
  if (obj) {
    if (fp.is(String, obj)) {
      // whether a typed id
      if (obj.indexOf(':') > 0) {
        return fp.last(fp.split(':', obj));
      } else {
        return obj;
      }
    }
    if (fp.isObjectId(obj.toString())) return obj.toString();
    if (obj[idField]) return pathId(idField, obj[idField]);
  }
  return null;
});
export const getId = pathId('id');

export const typedId = (obj) => {
  return obj && obj.type? obj.type + ':' + obj.id : obj;
};

export const convertMongoId = (id) => {
  if (id && fp.isObjectId(id.toString())) {
    return id.toString();
  } else {
    return Array.isArray(id)? fp.map(convertMongoId, id) : id;
  }
};

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

export const addToSelect = (select, ...args) => {
  select = select? normalizeSelect(select) : [];
  return fp.uniq(select.concat(args));
};

export const prefixSelect = (select, prefix) => {
  const fields = fp.splitOrArray(select);
  return fp.map(fp.concat(prefix + '.'), fields);
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
      fp.unless(fp.isEmpty, fp.append('*')) // add * for non-empty
    )(select);
  }
  return select;
};

export const sortWith = (sort, data) => {
  const descSorts = ['desc', 'descending', '-1', -1];
  var propSort = fp.mapObjIndexed((dir, field) => {
    if (descSorts.indexOf(dir) === -1) {
      return fp.ascend(fp.prop(field));
    } else {
      return fp.descend(fp.prop(field));
    }
  }, sort);
  return fp.sortWith(fp.values(propSort), data);
};

export const getHookData = (context) => {
  const items = context.type === 'before'? context.data : context.result;
  return fp.propOf('data', items);
};

export const getHookDataAsArray = (context) => {
  const items = getHookData(context);
  return items? fp.asArray(items) : [];
};

export const setHookData = (context, items) => {
  if (context.type === 'before') {
    context.data = items;
  } else {
    if (fp.hasProp('data', context.result)) {
      context.result.data = items;
    } else {
      context.result = items;
    }
  }
};

// find with a groupby entries like { 'type1': [{ id: 1 }, { id: 2 }] }
export const findEntriesByType = (app, entriesByType, params = {}, options = {}) => {
  // find by descriminated service
  const findByType = fp.mapObjIndexed((entries, type) => {
    if (options.skipType && type === options.skipType) {
      return Promise.resolve(entries);
    } else {
      let typeParams = fp.assignAll({ query: {} }, params); // copy for change
      typeParams.query.id = {
        $in: fp.map(fp.prop('id'), entries)
      };
      typeParams.paginate = false;
      return app.service(plural(type)).find(typeParams);
    }
  });

  const promises = fp.values(findByType(entriesByType));
  return Promise.all(promises).then(entries => {
    // merge the results
    const data = fp.flatMap(fp.propOf('data'), entries);
    // sort again
    const sort = fp.dotPath('query.$sort', params) || options.sort;
    return sort? sortWith(sort, data) : data;
  });
};

// find with typed ids from various descriminated services
export const findWithTypedIds = (app, list, params, options) => {
  if (!fp.isValid(list)) return Promise.resolve(list);

  const typeAndIds = fp.map(typed => {
    const field = fp.split(':', typed);
    return { type: fp.head(field), id: fp.last(field) };
  }, list);
  const entriesByType = fp.groupBy(fp.prop('type'), typeAndIds);

  // find the grouped entries by descriminated service
  return findEntriesByType(app, entriesByType, params, options);
};

// find and merge the results from various descriminated services
export const discriminatedFind = (app, keyType, result, params, options) => {
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

// get the result from descriminated service
export const discriminatedGet = (app, keyType, result, params) => {
  if (result && result.type && result.type !== keyType) {
    return app.service(plural(result.type)).get(result.id, params);
  } else {
    return Promise.resolve(result);
  }
};

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

export function populateByService (app, idField, typeField, options = {}) {
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
}
