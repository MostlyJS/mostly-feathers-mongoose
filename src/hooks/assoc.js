import makeDebug from 'debug';
import fp from 'mostly-func';
import { repeatDoubleStar, splitHead, selectTail } from '../helpers';

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

      // whether fall through the params
      if (options.fallThrough) {
        params = fp.reduce((acc, path) => {
          path = path.split('.');
          return fp.assocPath(path, fp.path(path, params), acc);
        }, {}, options.fallThrough);
      }

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
    let selected = false;
    if (params.query && params.query.$select) {
      // split $select to current level field
      const currSelect = fp.map(splitHead, params.query.$select);
      selected = fp.contains(target, currSelect);
      // $select with * for next populate level
      const nextSelect = fp.filter(fp.startsWith(target), params.query.$select);
      params.query.$select = selectTail(nextSelect);
    }
    if (selected === false) return hook;

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

