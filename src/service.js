import { map } from 'lodash';
import makeDebug from 'debug';
import { Service as BaseService } from 'feathers-mongoose';

const debug = makeDebug('mostly:feathers-mongoose:service');

const defaultOptions = {
  lean: true,
  paginate: {
    default: 10,
    max: 50
  }
};

// prevent accidental multiple operations
const assertMultiple = function(id, params, message) {
  if (!id) {
    if (params && params.query && params.query.$multiple) {
      delete params.query.$multiple;
    } else {
      throw new Error(message);
    }
  }
}

// transform the results
const transform = function(results) {
  // debug('transform', results);
  let data = [].concat(results? results.data || results : []);
  data.forEach(item => {
    // output id instead of _id
    item.id = item._id || item.id;
    delete item._id;
    delete item.__v;
  });
  return Promise.resolve(results);
}

export class Service extends BaseService {
  constructor(options) {
    options = Object.assign({}, defaultOptions, options);
    super(options);
    this.name = options.name || 'MongooseService';
  }

  setup(app) {
    this.app = app;
  }

  find(params) {
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

    // allow extra params to be used only in after hook
    if (params.query && params.query.$after) {
      params.after = params.query.$after;
      delete params.query.$after;
    }

    // search by regex
    Object.keys(params.query || []).forEach(field => {
      if (params.query[field] && params.query[field].$search && field.indexOf('$') === -1) {
        params.query[field] = { $regex: new RegExp(params.query[field].$search), $options: 'i' };
      }
      if (params.query[field] && params.query[field].$like && field.indexOf('$') === -1) {
        params.query[field] = { $regex: new RegExp(params.query[field].$like), $options: 'i' };
      }
    });

    const action = params.__action;

    if (!action || action === 'find') {
      debug('service %s find %j', this.name, params.query);
      return super.find(params).then(transform);
    }

    // TODO secure action call by find
    if (this[action]) {
      delete params.__action;
      return this._action(action, null, {}, params);
    }
    throw new Error("No such **get** action: " + action);
  }

  get(id, params) {
    if (id === 'null') id = null;
    
    const action = params.__action;
    if (!action || action === 'get') {
      debug('service %s get %j', this.name, id);
      return super.get(id, params).then(transform);
    }
    
    // TODO secure action call by get
    if (this[action]) {
      delete params.__action;
      return this._action(action, id, {}, params);
    }
    throw new Error("No such **get** action: " + action);
  }

  create(data, params) {
    // add support to create multiple objects
    if (Array.isArray(data)) {
      return Promise.all(data.map(current => this.create(current, params)));
    }
    return super.create(data, params).then(transform);
  }

  update(id, data, params) {
    if (id === 'null') id = null;
    assertMultiple(id, params, "Found null id, update must be called with $multiple.");

    const action = params.__action;
    if (!action || action === 'update') {
      return super.update(id, data, params).then(transform);
    }
    
    if (this[action]) {
      delete params.__action;
      return this._action(action, id, data, params);
    } else {
      throw new Error("No such **put** action: " + action);
    }
  }

  patch(id, data, params) {
    if (id === 'null') id = null;
    assertMultiple(id, params, "Found null id, patch must be called with $multiple.");

    const action = params.__action;
    if (!action || action === 'patch') {
      return super.patch(id, data, params).then(transform);
    }
    if (this[action]) {
      delete params.__action;
      return this._action(action, id, data, params);
    } else {
      throw new Error("No such **patch** action: " + action);
    }
  }

  remove(id, params) {
    if (id === 'null') id = null;
    assertMultiple(id, params, "Found null id, remove must be called with $multiple..");
    
    const action = params.__action;
    if (!action || action === 'remove') {
      if (params.query.$soft) {
        delete params.query.$soft;
        return super.patch(id, { destroyedAt: new Date() }, params).then(transform);
      } else {
        return super.remove(id, params).then(transform);
      }
    }

    if (action === 'restore') {
      delete params.__action;
      return this.restore(id, params);
    } else {
      throw new Error("No such **remove** action: " + action);
    }
  }

  _action(action, id, data, params) {
    debug(' => %s action %s with %j', this.name, action, id, data);
    // delete params.provider;
    let query = id? this.get(id, params) : Promise.resolve(null);
    return query.then(origin => {
      if (origin && origin.data) {
        origin = origin.data;
      }
      if (id && !origin) {
        throw new Error('No such record ' + id + ' in ' + this.Model.modelName);
      }
      return this[action].call(this, id, data, params, origin);
    });
  }

  // some reserved words

  count(id, data, params) {
    params = params || id || { query: {} };
    params.query.$limit = 0;
    return super.find(params).then(result => result.total);
  }

  first(id, data, params) {
    params = params || id || { query: {} };
    params.query.$limit = 1;
    return this.find(params).then(results => {
      if (results && Array.isArray(results.data) && results.data.length > 0) {
        return results.data[0];
      }
      return null;
    });
  }

  last(id, data, params) {
    params = params || id || { query: {} };
    return this.count(id, data, params).then(total => {
      params.query.$limit = 1;
      params.query.$skip = total - 1;
      return this.find(params).then(results => {
        if (results && Array.isArray(results.data) && results.data.length > 0) {
          return results.data[0];
        }
        return null;
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