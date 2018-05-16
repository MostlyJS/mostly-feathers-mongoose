import makeDebug from 'debug';
import fp from 'mostly-func';
import { pathId, isSelected, selectNext } from '../helpers';

const debug = makeDebug('mostly:feathers-mongoose:hooks:assoc');

const defaultOptions = {
  idField: 'id'
};

function isPresent (obj, target) {
  return fp.reduce((result, val) => {
    return result && fp.has(target, val);
  }, true, [].concat(obj));
}

// associcate current data as a foreign key to another service
export default function assoc (target, opts) {
  opts = Object.assign({}, defaultOptions, opts);

  return async hook => {
    let options = Object.assign({}, opts);

    if (hook.type !== 'after') {
      throw new Error(`The 'assoc' hook should only be used as a 'after' hook.`);
    }

    if (!options.service || !options.field) {
      throw new Error('You need to provide a service and a field');
    }

    const assocField = async function (data, params, target) {
      const service = hook.app.service(options.service);

      // pass infomation of the $select and specified by options.fallThrough
      const selection = { $select: params.query.$select };
      params = options.fallThrough? fp.pick(options.fallThrough, params) : {};
      params.query = selection;

      // if options.typeField specified, assoc as typed id like `document:1`
      const assocProp = (item) => {
        if (options.typeField) {
          return item[options.typeField] + ':' + item[options.idField];
        } else {
          return item[options.idField];
        }
      };

      if (Array.isArray(data)) {
        // assoc with array field
        if (options.elemMatch) {
          params.query = fp.merge(params.query, {
            [options.field]: {
              $elemMatch: {
                [options.elemMatch]: { $in: fp.map(assocProp, data) }
              }
            }
          });
        } else {
          params.query = fp.merge(params.query, {
            [options.field]: { $in: fp.map(assocProp, data) },
          });
        }
      } else {
        // assoc with array field
        if (options.elemMatch) {
          params.query = fp.merge(params.query, {
            [options.field]: {
              $elemMatch: {
                [options.elemMatch]: assocProp(data)
              }
            }
          });
        } else {
          params.query = fp.merge(params.query, {
            [options.field]: assocProp(data)
          });
        }
      }
      params.populate = false; // prevent recursive populate
      params.paginate = false; // disable paginate

      // filter
      if (options.filters && options.filters.length > 0) {
        for (const filter of options.filters) {
          if (filter.field && filter.value) {
            const value = typeof filter.value === 'function'
              ? filter.value.call(null, hook) : filter.value;
            params.query[filter.field] = Array.isArray(value)? { $in: value } : value;
          }
        }
      }
      // sort
      if (options.sort) {
        params.query.$sort = options.sort;
      }
      // limit
      if (options.limit) {
        params.query.$limit = options.limit;
      }

      debug('assoc =>', target, options.service, params.query);

      const filterById = function (id) {
        return fp.filter(obj => {
          let prop = [].concat(obj[options.field] || []);
          // assoc with array field
          if (options.elemMatch) {
            return fp.find(elem => pathId(options.elemMatch, elem) === id, prop);
          } else {
            return fp.find(elem => pathId(options.idField, elem) === id, prop);
          }
        });
      };

      const assocResult = function (results) {
        return fp.map((item) => {
          let values = filterById(item[options.idField])(results);
          if (values) {
            if (options.sort) {
              values = fp.sortBy(fp.prop(options.sort), values);
            }
            return fp.assoc(target, values, item);
          }
          return item;
        });
      };

      let results = await service.find(params);
      results = results && results.data || results;
      if (Array.isArray(data)) {
        return assocResult(results)(data);
      } else {
        return fp.assoc(target, results, data);
      }
    };

    let data = hook.result && hook.result.data || hook.result;

    if (fp.isNil(data) || fp.isEmpty(data)) return hook;

    // each assoc field should have its own params
    let params = fp.assignAll({ query: {} }, hook.params);

    // target must be specified by $select to assoc
    if (!isSelected(target, params.query.$select)) return hook;

    // already associcated
    if (isPresent(data, target)) return hook;

    // $select with * for next level
    if (params.query.$select) {
      params.query.$select = selectNext(target, params.query.$select);
    }

    const results = assocField(data, params, target, options);
    if (hook.result.data) {
      hook.result.data = results;
    } else {
      hook.result = results;
    }
    return hook;
  };
}

