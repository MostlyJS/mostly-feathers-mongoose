import makeDebug from 'debug';
import fp from 'mostly-func';
import { isSelected, selectNext, selectTail, splitHead } from '../helpers';

const debug = makeDebug('mostly:feathers-mongoose:hooks:assoc');

const defaultOptions = {
  idField: 'id'
};

// associcate current data as a foreign key to another service
export default function assoc(target, opts) {
  opts = Object.assign({}, defaultOptions, opts);

  return function(hook) {
    let options = Object.assign({}, opts);

    if (hook.type !== 'after') {
      throw new Error(`The 'assoc' hook should only be used as a 'after' hook.`);
    }

    if (!options.service || !options.field) {
      throw new Error('You need to provide a service and a field');
    }

    const assocField = function (data, params, target) {
      const service = hook.app.service(options.service);

      // pass infomation of the $select and specified by options.fallThrough
      const selection = { $select: params.query.$select };
      params = options.fallThrough
        ? fp.pick(options.fallThrough, params)
        : {};
      params.query = selection;

      if (Array.isArray(data)) {
        params.query = fp.merge(params.query, {
          [options.field]: { $in: fp.map(fp.prop(options.idField), data) },
        });
      } else {
        params.query = fp.merge(params.query, {
          [options.field]: fp.prop(options.idField, data)
        });
      }
      params.populate = false; // prevent recursive populate
      params.paginate = false; // disable paginate
      
      return service.find(params).then((results) => {
        const filterById = function (id) {
          return fp.filter(obj => {
            let prop = Array.concat([], obj[options.field] || []);
            prop = fp.map(fp.toString, prop); // convert ObjectId
            return prop.indexOf(id) >= 0;
          });
        };
        const assocResult = function (results) {
          return fp.map((item) => {
            let values = filterById(item[options.idField])(results);
            if (values) {
              return fp.assoc(target, values, item);
            }
            return item;
          });
        };
        if (Array.isArray(data)) {
          return assocResult(results)(data);
        } else {
          return fp.assoc(target, results, data);
        }
      });
    };

    let isPaginated = hook.method === 'find' && hook.result.data;
    let data = isPaginated ? hook.result.data : hook.result;

    if (Array.isArray(data) && data.length === 0) return hook;
    
    // each assoc field should have its own params
    let params = fp.assign({}, hook.params);
    
    // target must be specified by $select to assoc
    if (!isSelected(target, params.query.$select)) return hook;

    // $select with * for next level
    if (params.query.$select) {
      params.query.$select = selectNext(target, params.query.$select);
    }

    return assocField(data, params, target, options).then(result => {
      if (isPaginated) {
        hook.result.data = result;
      } else {
        hook.result = result;
      }
      return hook;
    });
  };
}

