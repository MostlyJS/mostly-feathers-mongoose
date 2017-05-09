import { map } from 'lodash';

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
    if (query && query[field] && query[field].$filter && field.indexOf('$') === -1) {
      const service = hook.app.service(options.service);
      if (!service) {
        throw new Error("No such service: " + options.service);
      }
      
      let params = {};
      params.query = query[field].$filter;
      params.paginate = false;
      //debug('service filter params %j', params);
      return service.find(params).then(result => {
        query[field] = { $in: map(result || result.data, 'id') };
        //debug('service filter query', field, query[field]);
        return hook;
      });
    } else {
      return hook;
    }
  };
}