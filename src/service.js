import assert from 'assert';
import fp from 'ramda';
import makeDebug from 'debug';
import { Service as BaseService } from 'feathers-mongoose';
import { errorHandler } from 'feathers-mongoose/lib/error-handler';

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
const assertMultiple = function(id, params, message) {
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

const unset_id = function(obj) {
  if (obj && obj._id) {
    return fp.pipe(
      fp.assoc('id', String(obj._id)),
      fp.dissoc('_id'),
      fp.dissoc('__v')
    )(obj);
  } else {
    return obj;
  }
};

const unsetObj = function(obj) {
  if (Array.isArray(obj)) {
    return fp.map(unset_id, obj);
  } else {
    return unset_id(obj);
  }
};

// transform the results
const transform = function(results) {
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
  constructor(options) {
    options = Object.assign({}, defaultOptions, options);
    super(options);

    this.options = unsetOptions(options);
    this.name = options.name || 'mongoose-service';
  }

  setup(app) {
    this.app = app;
  }

  find(params) {
    params = params || { query: {} };
    // default behaviours for external call
    if (params.provider && params.query) {
      // fix id query as _ids
      if (params.query.id) {
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
    if (this[action] && defaultMethods.indexOf(action) < 0) {
      params = fp.dissoc('__action', params);
      return this._action(action, null, {}, params);
    }
    throw new Error("No such **find** action: " + action);
  }

  get(id, params) {
    if (id === 'null' || id === '0') id = null;
    params = params || { query: {} };

    let action = params.__action;

    // if id is null, try find the first one with params
    if (id === null && !action) action = 'first';

    if (!action || action === 'get') {
      debug('service %s get %j', this.name, id, params);
      return super.get(id, params).then(transform);
    }

    // TODO secure action call by get
    if (this[action] && defaultMethods.indexOf(action) < 0) {
      params = fp.dissoc('__action', params);
      return this._action(action, id, {}, params);
    }
    throw new Error("No such **get** action: " + action);
  }

  create(data, params) {
    params = params || { query: {} };
    // add support to create multiple objects
    if (Array.isArray(data)) {
      return Promise.all(data.map(current => this.create(current, params)));
    }
    return super.create(data, params).then(transform);
  }

  update(id, data, params) {
    if (id === 'null') id = null;
    params = params || {};
    assertMultiple(id, params, "Found null id, update must be called with $multi.");

    const action = params.__action;
    if (!action || action === 'update') {
      debug('service %s update %j', this.name, id, data, typeof data.parent);
      return super.update(id, data, params).then(transform);
    }
    
    // TODO secure action call by get
    if (this[action] && defaultMethods.indexOf(action) < 0) {
      params = fp.dissoc('__action', params);
      return this._action(action, id, data, params);
    } else {
      throw new Error("No such **put** action: " + action);
    }
  }

  patch(id, data, params) {
    if (id === 'null') id = null;
    params = params || {};
    assertMultiple(id, params, "Found null id, patch must be called with $multi.");

    const action = params.__action;
    if (!action || action === 'patch') {
      return super.patch(id, data, params).then(transform);
    }

    // TODO secure action call by get
    if (this[action] && defaultMethods.indexOf(action) < 0) {
      debug('service %s patch %j', this.name, id);
      params = fp.dissoc('__action', params);
      return this._action(action, id, data, params);
    } else {
      throw new Error("No such **patch** action: " + action);
    }
  }

  remove(id, params) {
    if (id === 'null') id = null;
    assertMultiple(id, params, "Found null id, remove must be called with $multi.");

    const action = params.__action;
    if (!action || action === 'remove') {
      if (params.query.$soft) {
        debug('service %s remove soft %j', this.name, id);
        params = fp.dissocPath(['query', '$soft'], params);
        return super.patch(id, { destroyedAt: new Date() }, params).then(transform);
      } else {
        debug('service %s remove %j', this.name, id);
        return super.remove(id, params).then(transform);
      }
    }

    // TODO secure action call by get
    if (action === 'restore') {
      params = fp.dissoc('__action', params);
      return this.restore(id, params);
    } else {
      throw new Error("No such **remove** action: " + action);
    }
  }

  _action(action, id, data, params) {
    debug(' => %s action %s with %j', this.name, action, id, data);
    assert(this[action], 'No such action method: ' + action);

    // delete params.provider;
    let query = id? this.get(id, params) : Promise.resolve(null);
    return query.then(origin => {
      if (origin && origin.data) {
        origin = origin.data;
      }
      if (id && !origin) {
        throw new Error('Not found record ' + id + ' in ' + this.Model.modelName);
      }
      return this[action].call(this, id, data, params, origin);
    });
  }

  // some reserved actions

  upsert(data, params) {
    params = params || {};
    let query = params.query || data;  // default find by input data
    return this.Model.findOneAndUpdate(query, data, { upsert: true, new: true })
      .lean()
      .then(transform)
      .catch(errorHandler);
  }

  count(id, data, params) {
    params = params || id || { query: {} };
    params.query.$limit = 0;
    return super.find(params).then(result => result.total);
  }

  first(id, data, params) {
    params = params || id || { query: {} };
    params.query.$limit = 1;
    return this.find(params).then(results => {
      results = results.data || results;
      if (Array.isArray(results) && results.length > 0) {
        return results[0];
      } else {
        return null;
      }
    });
  }

  last(id, data, params) {
    params = params || id || { query: {} };
    return this.count(id, data, params).then(total => {
      params.query.$limit = 1;
      params.query.$skip = total - 1;
      return this.find(params).then(results => {
        results = results.data || results;
        if (Array.isArray(results) && results.length > 0) {
          return results[0];
        } else {
          return results;
        }
      });
    });
  }

  restore(id, data, params) {
    return super.patch(id, { destroyedAt: null }, params).then(transform);
  }
}

export default function init (options) {
  return new Service(options);
}

init.Service = Service;
init.transform = transform;
