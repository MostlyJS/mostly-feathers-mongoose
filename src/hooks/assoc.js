import makeDebug from 'debug';
import fp from 'mostly-func';

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

    // target must be specified by $select to assoc
    let select = hook.params.query
      ? [].concat(hook.params.query.$select || [])
      : [];
    if (!fp.contains(target, select)) return hook;

    const assocField = function (data, target) {
      const service = hook.app.service(options.service);

      // Fall through the hook.params ?
      let params = options.fallThrough
        ? Object.assign({}, hook.params, { query: undefined })
        : {};

      if (Array.isArray(data)) {
        params.query = {
          [options.field]: { $in: fp.map(fp.prop(options.idField), data) },
        };
      } else {
        params.query = {
          [options.field]: fp.prop(options.idField, data)
        };
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
    
    return assocField(data, target, options).then(result => {
      if (isPaginated) {
        hook.result.data = result;
      } else {
        hook.result = result;
      }
      return hook;
    });
  };
}

