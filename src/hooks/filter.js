import _ from 'lodash';

export function filterField(field, preset) {
  return hook => {
    // If it was an internal call then skip this hook
    if (!hook.params.provider) {
      return hook;
    }

    if(!Array.isArray(preset)) {
      preset = [preset];
    }

    if (hook.params.query && !hook.params.query[field]) {
      hook.params.query[field] = { $in: preset };
    }

    return hook;
  };
}

export function filter(target, options) {
  options = Object.assign({}, options);

  if (!options.service) {
    throw new Error('You need to provide a service');
  }

  var field = options.field || target;

  return function(hook) {
    if (hook.type !== 'before') {
      throw new Error(`The 'filter' hook should only be used as a 'before' hook.`);
    }
    
    let query = hook.params.query;
    let filters = _.get(query, field);

    if (filters) {
      // in case of multiple filters query of same field
      if (_.isArray(filters)) {
        filters = _.filter(filters, it => it.$filter);
      } else {
        filters = [filters];
      }

      const service = hook.app.service(options.service);
      if (!service) {
        throw new Error("No such service: " + options.service);
      }
      
      let promises = _.map(filters, (filterField) => {
        if (_.isObject(filterField.$filter)) {
          return service.find({
            query: filterField.$filter,
            paginate: false,
          });
        } else {
          return Promise.resolve([]);
        }
      });
      return Promise.all(promises).then((results) => {
        if (results) {
          results.forEach((result) => {
            result = result && result.data || result;
            _.set(query, field, { $in: _.map(result, 'id') });
          });
        }
        hook.params.query = query;
        //debug('service filter query', field, query[field]);
        return hook;
      });
    }
  };
}