import assert from 'assert';
import makeDebug from 'debug';
import fp from 'mostly-func';
import { defaultMethods, isAction } from 'mostly-feathers';

import { Service as BaseService } from './base';
import { normalizeSelect, transform } from './helpers';

const debug = makeDebug('mostly:feathers-mongoose:service');

const defaultOptions = {
  lean: true,
  sort: {
    createdAt: -1
  },
  paginate: {
    default: 10,
    max: 50
  }
};

const descSorts = ['desc', 'descending', '-1', -1];

// prevent accidental multiple operations
const assertMultiple = function (id, params, message) {
  if (!id) {
    if (params && params.query && (params.$multi || params.query.$multi)) {
      delete params.query.$multi;
    } else {
      throw new Error(message);
    }
  }
};

const unsetOptions = fp.pipe(
  fp.dissoc('Model'),
  fp.dissoc('ModelName'),
  fp.dissoc('name')
);

const filterSelect = function (params) {
  // select by * and field.* or field.**
  if (params && params.query && params.query.$select) {
    // normalize the $select
    let select = normalizeSelect(params.query.$select);
    select = fp.map(fp.splitHead, select);
    if (fp.contains('*', select)) {
      return fp.dissocPath(['query', '$select'], params);
    } else {
      return fp.assocPath(['query', '$select'], select, params);
    }
  }
  return params;
};

export class Service extends BaseService {
  constructor (options) {
    options = fp.assign(defaultOptions, options);
    super(options);

    this.name = options.name || 'mongoose-service';
    this.options = unsetOptions(options);
  }

  setup (app) {
    this.app = app;
  }

  find (params = {}) {
    params = { query: {}, ...params };
    params = filterSelect(params); // filter $select

    if (params.query) {
      // fix id query inconsistent with service.id
      if (this.id === '_id' && params.query.id) {
        params.query._id = params.query.id;
        delete params.query.id;
      }
      if (this.id === 'id' && params.query._id) {
        params.query.id = params.query._id;
        delete params.query._id;
      }
      if (params.query.$sort) {
        params.query.$sort = fp.map(dir => {
          return descSorts.indexOf(dir) === -1 ? 1 : -1;
        }, params.query.$sort);
      }
      // filter destroyed item by default
      if (!params.query.destroyedAt) {
        params.query.destroyedAt = null;
      }
      // default sort
      if (!params.query.$sort) {
        params.query.$sort = this.options.sort;
      }
    }

    // search by regex
    Object.keys(params.query || []).forEach(field => {
      if (params.query[field] && params.query[field].$like !== undefined && field.indexOf('$') === -1) {
        params.query[field] = { $regex: new RegExp(params.query[field].$like), $options: 'i' };
      }
    });

    debug('service %s find %j', this.name, params.query);
    return super.find(params).then(transform);
  }
  
  get (id, params = {}) {
    params = { query: {}, ...params };
    params = filterSelect(params); // filter $select

    if (this._isAction(id, params)) {
      return this._action('get', id, null, params);
    }
    debug('service %s get %j', this.name, id, params.query);
    return super.get(id, params).then(transform);
  }

  create (data, params = {}) {
    params = { query: {}, ...params };
    params = filterSelect(params); // filter $select

    debug('service %s create %j', this.name, data);
    return super.create(data, params).then(transform);
  }

  update (id, data, params = {}) {
    params = { query: {}, ...params };
    params = filterSelect(params); // filter $select
    assertMultiple(id, params, "Found null id, update must be called with $multi.");

    if (this._isAction(id, params)) {
      return this._action('update', id, data, params);
    }
    debug('service %s update %j', this.name, id, data);
    return super.update(id, data, params).then(transform);
  }

  patch (id, data, params = {}) {
    params = { query: {}, ...params };
    params = filterSelect(params); // filter $select
    assertMultiple(id, params, "Found null id, patch must be called with $multi.");

    if (this._isAction(id, params)) {
      return this._action('patch', id, data, params);
    }
    debug('service %s patch %j', this.name, id, data);
    return super.patch(id, data, params).then(transform);
  }

  remove (id, params = {}) {
    params = { query: {}, ...params };
    params = filterSelect(params); // filter $select
    assertMultiple(id, params, "Found null id, remove must be called with $multi.");

    if (this._isAction(id, params)) {
      return this._action('remove', id, null, params);
    }
    if (params.query && params.query.$soft) {
      params = fp.dissocPath(['query', '$soft'], params); // remove soft
      debug('service %s remove soft %j', this.name, id);
      return super.patch(id, { destroyedAt: new Date() }, params).then(transform);
    } else {
      debug('service %s remove %j', this.name, id);
      return super.remove(id, params).then(transform);
    }
  }

  /**
   * proxy to action method (same code as in mostly-feathers)
   * syntax sugar for calling from other services, do not call them by super
   */
  action (action) {
    assert(action, 'action is not provided');
    return {
      get: async (params = {}) => {
        params.action = action;
        return this.get(null, params);
      },

      create: async (data, params = {}) => {
        params.action = action;
        return this.patch(null, data, params);
      },

      update: async (id, data, params = {}) => {
        params.action = action;
        return this.update(id, data, params);
      },

      patch: async (id, data, params = {}) => {
        params.action = action;
        return this.patch(id, data, params);
      },

      remove: async (id, params = {}) => {
        params.action = action;
        return this.remove(id, params);
      }
    };
  }

  /**
   * check if name is a service method
   */
  _isAction (id, params) {
    return isAction(this, id, params);
  }

  /**
   * Proxy to a action service
   */
  async _action (method, id, data, params) {
    const action = params && (params.action || (params.query && params.query.$action)) || id;
    assert(action, 'action is not provided');

    if (!fp.isFunction(this[action]) || defaultMethods.indexOf(action) >= 0) {
      throw new Error(`Not implemented **${method}** action: ${action}`);
    }
    params = fp.dissoc('action', fp.dissocPath(['query', '$action'], params));
    debug('service %s %s action %s id %j => %j', this.name, method, action, id, data);

    switch (method) {
      case 'get': return this[action].call(this, params);
      case 'create': return this[action].call(this, null, data, params);
      case 'update': return this[action].call(this, id, data, params);
      case 'patch': return this[action].call(this, id, data, params);
      case 'remove': return this[action].call(this, id, params);
      default: throw new Error(`Invalid method ${method}`);
    }
  }

  upsert (id, data, params = {}) {
    params = { query: {}, ...params };
    if (fp.isEmpty(params.query)) {
      params.query = { ...data };  // default find by input data
    }
    params.mongoose = Object.assign({}, params.mongoose, {
      setDefaultsOnInsert: true, upsert: true
    });

    // TODO: setDefaultsOnInsert already done this?
    // upsert do not set default value in schema, so ...
    // const schemas = this.Model.schema && this.Model.schema.paths;
    // if (schemas) {
    //   for (const key in schemas) {
    //     const val = fp.path(key.split('.'), data);
    //     if (!key.startsWith('_') && val === undefined && schemas[key].defaultValue !== undefined) {
    //       data[key] = typeof schemas[key].defaultValue === 'function'
    //         ? schemas[key].defaultValue() : schemas[key].defaultValue;
    //     }
    //   }
    // }
    return super.patch(null, data, params).then(fp.head).then(transform);
  }

  count (params = {}) {
    params = { query: {}, ...params };
    
    params.query.$limit = 0;
    return super.find(params).then(result => result.total);
  }

  first (params = {}) {
    params = { query: {}, ...params };
    params = filterSelect(params); // filter $select

    params.query.$limit = 1;
    params.paginate = false; // disable paginate
    
    return super.find(params).then(results => {
      return results && results.length > 0? results[0] : null;
    }).then(transform);
  }

  last (params = {}) {
    params = { query: {}, ...params };
    params = filterSelect(params); // filter $select

    return this.count(params).then(total => {
      params.query.$limit = 1;
      params.query.$skip = total - 1;
      params.paginate = false;
      return super.find(params).then(results => {
        return results && results.length > 0? results[0] : null;
      }).then(transform);
    });
  }

  restore (id, data, params = {}) {
    return super.patch(id, { destroyedAt: null }, params).then(transform);
  }
}

export default function init (options) {
  return new Service(options);
}
