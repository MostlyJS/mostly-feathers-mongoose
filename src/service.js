import assert from 'assert';
import makeDebug from 'debug';
import fp from 'mostly-func';
import { Service as BaseService } from 'feathers-mongoose';
import { splitHead, repeatDoubleStar } from './helpers';

const debug = makeDebug('mostly:feathers-mongoose:service');

const defaultOptions = {
  lean: true,
  paginate: {
    default: 10,
    max: 50
  }
};

const defaultMethods = ['find', 'get', 'create', 'update', 'patch', 'remove'];

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
  fp.dissoc('ModelName')
);

const unset_id = function (obj) {
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
    return fp.map(unset_id, obj);
  } else {
    return unset_id(obj);
  }
};

const normalizeSelect = function (select) {
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

const filterSelect = function (params) {
  // select by * and field.* or field.**
  if (params && params.query && params.query.$select) {
    // normalize the $select (mutate on purpose)
    params.query.$select = normalizeSelect(params.query.$select);

    const select = fp.map(splitHead, params.query.$select);
    if (fp.contains('*', select)) {
      return fp.dissocPath(['query', '$select'], params);
    } else {
      return fp.assocPath(['query', '$select'], select, params);
    }
  }
  return params;
};

// transform the results
const transform = function (results) {
  if (results) {
    if (results.data) {
      results.data = unsetObj(results.data);
    } else {
      results = unsetObj(results);
    }
  }
  return results;
};

export class Service extends BaseService {
  constructor (options) {
    options = Object.assign({}, defaultOptions, options);
    super(options);

    this.options = unsetOptions(options);
    this.name = options.name || 'mongoose-service';
  }

  setup(app) {
    this.app = app;
  }

  find (params) {
    // filter $select
    params = filterSelect(params);
    
    params = fp.assign({ query: {} }, params);

    if (params.query) {
      // fix id query as _ids
      if (this.id === '_id' && params.query.id) {
        params.query._id = params.query.id;
        delete params.query.id;
      }
      // filter destroyed item by default
      if (!params.query.destroyedAt) {
        params.query.destroyedAt = null;
      }
      // default sort
      if (!params.query.$sort) {
        params.query.$sort = { createdAt: -1 };
      }
    }

    // search by regex
    Object.keys(params.query || []).forEach(field => {
      if (params.query[field] && params.query[field].$like !== undefined && field.indexOf('$') === -1) {
        params.query[field] = { $regex: new RegExp(params.query[field].$like), $options: 'i' };
      }
    });

    const action = params.__action;

    if (!action || action === 'find') {
      debug('service %s find %j', this.name, params.query);
      return super.find(params).then(transform);
    }

    // TODO secure action call by find
    return this._action('find', action, null, null, params);
  }

  get (id, params) {
    if (id === 'null' || id === '0') id = null;

    // filter $select
    params = filterSelect(params);

    params = fp.assign({ query: {} }, params);

    let action = params.__action;

    // check if id is action for find
    if (id && !action) {
      if (this['_' + id] && defaultMethods.indexOf(id) < 0) {
        params = fp.assoc('__action', id, params);
        return this.find(params);
      }
    }

    if (!action || action === 'get') {
      debug('service %s get %j', this.name, id, params);
      return super.get(id, params).then(transform);
    }

    // TODO secure action call by get
    return this._action('get', action, id, null, params);
  }

  create (data, params) {
    params = fp.assign({ query: {} }, params);

    // add support to create multiple objects
    if (Array.isArray(data)) {
      return Promise.all(data.map(current => this.create(current, params)));
    }

    const action = params.__action;
    if (!action || action === 'create') {
      debug('service %s create %j', this.name, data);
      return super.create(data, params).then(transform);
    }

    // TODO secure action call by get
    return this._action('create', action, null, data, params);
  }

  update (id, data, params) {
    if (id === 'null') id = null;
    params = fp.assign({}, params);

    assertMultiple(id, params, "Found null id, update must be called with $multi.");

    let action = params.__action;
    
    // check if id is action for patch
    if (id && !action) {
      if (this['_' + id] && defaultMethods.indexOf(id) < 0) {
        action = id;
        id = null;
      }
    }

    if (!action || action === 'update') {
      debug('service %s update %j', this.name, id, data);
      return super.update(id, data, params).then(transform);
    }
    
    // TODO secure action call by get
    return this._action('update', action, id, data, params);
  }

  patch (id, data, params) {
    if (id === 'null') id = null;
    params = fp.assign({}, params);

    assertMultiple(id, params, "Found null id, patch must be called with $multi.");

    let action = params.__action;
    
    // check if id is action for patch
    if (id && !action) {
      if (this['_' + id] && defaultMethods.indexOf(id) < 0) {
        action = id;
        id = null;
      }
    }

    if (!action || action === 'patch') {
      return super.patch(id, data, params).then(transform);
    }

    // TODO secure action call by get
    return this._action('patch', action, id, data, params);
  }

  remove (id, params) {
    if (id === 'null') id = null;
    params = fp.assign({}, params);

    assertMultiple(id, params, "Found null id, remove must be called with $multi.");

    const action = params.__action;
    if (!action || action === 'remove') {
      if (params.query && params.query.$soft) {
        debug('service %s remove soft %j', this.name, id);
        params = fp.dissocPath(['query', '$soft'], params);
        return super.patch(id, { destroyedAt: new Date() }, params).then(transform);
      } else {
        debug('service %s remove %j', this.name, id);
        return super.remove(id, params).then(transform);
      }
    }

    // TODO secure action call by get
    this._action('remove', action, id, null, params);
  }

  /**
   * proxy to action method
   * syntax sugar for calling from other services, do not call them by super
   */
  action (action) {
    return {
      find: (params = {}) => {
        params.__action = action;
        return this.find(params);
      },

      get: (id, params = {}) => {
        params.__action = action;
        return this.get(id, params);
      },

      create: (data, params = {}) => {
        params.__action = action;
        return this.create(data, params);
      },

      update: (id, data, params = {}) => {
        params.__action = action;
        return this.update(id, data, params);
      },

      patch: (id, data, params = {}) => {
        params.__action = action;
        return this.patch(id, data, params);
      },

      remove: (id, params = {}) => {
        params.__action = action;
        return this.remove(id, params);
      }
    };
  }

  /**
   * private actions, aciton method are pseudo private by underscore
   */

  _action (method, action, id, data, params) {
    if (this['_' + action] === undefined || defaultMethods.indexOf(action) >= 0) {
      throw new Error(`No such **${method}** action: ${action}`);
    }
    params = fp.dissoc('__action', params);
    debug('service %s %s action %s id %j => %j', this.name, method, action, id, data);

    // get target item with params.query (without provider)
    let query = id
      ? this.get(id, { query: params.query || {} })
      : Promise.resolve(null);
    return query.then(origin => {
      if (id && !origin) {
        throw new Error('Not found record ' + id + ' in ' + this.Model.modelName);
      }
      return this['_' + action].call(this, id, data, params, origin);
    });
  }

  _upsert (id, data, params) {
    params = fp.assign({}, params);
    if (fp.isNil(params.query) || fp.isEmpty(params.query)) {
      params.query = fp.assign({}, data);  // default find by input data
    }
    params.mongoose = fp.assign({}, params.mongoose, { upsert: true });

    // upsert do not set default value in schema
    const schemas = this.Model.schema && this.Model.schema.paths;
    if (schemas) {
      for (const key in schemas) {
        if (!key.startsWith('_') && data[key] === undefined && schemas[key].defaultValue !== undefined) {
          data[key] = typeof schemas[key].defaultValue === 'function'
            ? schemas[key].defaultValue() : schemas[key].defaultValue;
        }
      }
    }
    return super.patch(null, data, params).then(results => {
      return results && results.length > 0? results[0] : null;
    }).then(transform);
  }

  _count (id, data, params) {
    params = fp.assign({ query: {} }, params || id);

    params.query.$limit = 0;
    return super.find(params).then(result => result.total);
  }

  _first (id, data, params) {
    // filter $select
    params = filterSelect(params || id);

    params = fp.assign({ query: {} }, params);

    params.query.$limit = 1;
    params.paginate = false; // disable paginate
    
    return super.find(params).then(results => {
      return results && results.length > 0? results[0] : null;
    }).then(transform);
  }

  _last (id, data, params) {
    // filter $select
    params = filterSelect(params || id);

    params = fp.assign({ query: {} }, params);

    return this._count(id, data, params).then(total => {
      params.query.$limit = 1;
      params.query.$skip = total - 1;
      params.paginate = false;
      return super.find(params).then(results => {
        return results && results.length > 0? results[0] : null;
      }).then(transform);
    });
  }

  _restore (id, data, params) {
    return super.patch(id, { destroyedAt: null }, params).then(transform);
  }
}

export default function init (options) {
  return new Service(options);
}

init.Service = Service;
init.transform = transform;
