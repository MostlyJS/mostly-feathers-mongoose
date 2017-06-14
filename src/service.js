import makeDebug from 'debug';
import { Service as BaseService } from 'feathers-mongoose';

const debug = makeDebug('mostly:feathers-mongoose:service');

export class Service extends BaseService {
  constructor(options) {
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

    debug('service %s find %j', this.name, params.query);

    const action = params.__action;
    if (!action || action === 'find') {
      return super.find(params);
    }

    if (action === 'count') {
      delete params.__action;
      return this.count(params);
    } else {
      throw new Error("No such **find** action: " + action);
    }
  }

  get(id, params) {
    const action = params.__action;
    if (!action || action === 'get') {
      debug('service %s get %j', this.name, id);
      return super.get(id, params);
    }
    
    if (this[action]) {
      delete params.__action;
      return this.action(action, id, {}, params);
    }
    throw new Error("No such **get** action: " + action);
  }

  // override to validate before create/update/patch
  validate() {
    return Promise.resolve(true);
  }

  create(data, params) {
    // add support to create mutiple objects
    if (Array.isArray(data)) {
      return Promise.all(data.map(current => this.create(current, params)));
    }
    return this.validate(data).then(() => {
      return super.create(data, params);
    });
  }

  update(id, data, params) {
    if (!id && !params.query.$mutiple) throw new Error("Mutiple update is prohibit now.");

    const action = params.__action;
    if (!action || action === 'update') {
      return this.validate(data).then(() => {
        delete params.query.$mutiple;
        return super.update(id, data, params);
      });
    }
    
    if (!this[action]) {
      delete params.__action;
      return this.action(action, id, data, params);
    } else {
      throw new Error("No such **put** action: " + action);
    }
  }

  patch(id, data, params) {
    if (!id && !params.query.$mutiple) throw new Error("Mutiple patch is prohibit now.");

    const action = params.__action;
    if (!action || action === 'patch') {
      delete params.query.$mutiple;
      return super.patch(id, data, params);
    }
    debug('#####', action, this[action]);
    if (this[action]) {
      delete params.__action;
      return this.action(action, id, data, params);
    } else {
      throw new Error("No such **patch** action: " + action);
    }
  }

  remove(id, params) {
    if (!id && !params.query.$mutiple) throw new Error("Mutiple remove is prohibit now.");
    
    const action = params.__action;
    if (!action || action === 'remove') {
      if (params.query.$force) {
        delete params.query.$mutiple;
        delete params.query.$force;
        return super.remove(id, params);
      } else {
        const data = { destroyedAt: new Date() };
        return super.patch(id, data, params);
      }
    }

    if (action === 'restore') {
      delete params.__action;
      return this.restore(id, params);
    } else {
      throw new Error("No such **remove** action: " + action);
    }
  }

  action(action, id, data, params) {
    // delete params.provider;
    return this.get(id, params).then(origin => {
      origin = origin.data || origin;
      if (!origin) {
        throw new Error('No such record ' + id + ' in ' + this.Model.modelName);
      }
      return this[action].call(this, id, data, params, origin);
    });
  }

  restore(id, params) {
    const data = { destroyedAt: null };
    return super.patch(id, data, params);
  }

  count(params) {
    params.query.$limit = 0;
    return this.find(params).then(result => result.total);
  }
}

export default function init (options) {
  return new Service(options);
}

init.Service = Service;