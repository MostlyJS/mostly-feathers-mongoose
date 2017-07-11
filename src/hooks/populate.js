import util from 'util';
import errors from 'feathers-errors';
import validator from 'validator';
import makeDebug from 'debug';
import { getField, setField, setFieldByKey } from '../helpers';
import { compact, flatten, flattenDeep, get, isArray, map, reduce, set } from 'lodash';

const debug = makeDebug('mostly:feathers-mongoose:common:hooks:populate');

function isPopulated(obj) {
  if (isArray(obj)) {
    return reduce(obj, (result, val) => {
      return result && !validator.isMongoId(val.toString());
    }, true);
  } else {
    if (obj) {
      return !validator.isMongoId(obj.toString());
    } else {
      return false;
    }
  }
}

/**
 * The populate hook uses a property from the result (or every item if it is a list)
 * to retrieve a single related object from a service and add it to the original object.
 * It is meant to be used as an after hook on any service method.
 *
 * @param {string} target - The prop name to contain the populated item or array of populated items.
 *    This is also the default for options.field if that is not specified.
 * @param {Object} options - options
 *    For a mongoose model, these are the options for item.toObject().
 *    For a Sequelize model, these are the options for item.toJSON().
 * @param {string} options.service - The service for the related object, e.g. '/messages'.
 * @param {string|Array.<string>} options.field - The field containing the key(s)
 *    for the item(s) in options.service.
 * @returns {Function} hook function(hook):Promise resolving to the hook.
 *
 * 'options.field' is the foreign key for one related item in options.service,
 *    i.e. item[options.field] === foreignItem[idField].
 * 'target' is set to this related item once it is read successfully.
 *
 * If 'options.field' is not present in the hook result item, the hook is ignored.
 *
 * So if the hook result has the message item
 *    { _id: '1...1', senderId: 'a...a', text: 'Jane, are you there?' }
 * and the /users service has the item
 *    { _id: 'a...a', name: 'John Doe'}
 * and then the hook is run
 *    hooks.populate('sender', { field: 'userId', service: '/users' })
 * the hook result will contain
 *    { _id: '1...1', senderId : 'a...a', text: 'Jane, are you there?',
 *      sender: { _id: 'a...a', name: 'John Doe'} }
 *
 * If 'senderId' is an array of keys, then 'sender' will be an array of populated items.
 */
export function populate(target, options) {
  options = Object.assign({}, options);

  if (!options.service) {
    throw new Error('You need to provide a service');
  }

  return function(hook) {
    // If it was an internal call then do not recursive populate
    options.recursive = !!hook.params.provider;

    function populate(item, target, options) {
      const service = hook.app.service(options.service);
      if (!service) {
        throw new Error("No such service: " + options.service);
      }
      let field = options.field || target;

      // Find by the field value by default or a custom query
      let id = null;
      if (isArray(item)) {
        id = compact(flattenDeep(map(item, i => getField(i, field))));
      } else {
        id = getField(item, field);
      }
      //debug('==> %s populate %s/%s, \n\tid: %j', options.service, target, field, id);
      //debug(' \n\twith: %j', item);

      // invalid id
      if (!id || id.length === 0) {
        return Promise.resolve(item);
      }

      if (isPopulated(id)) {
        debug('==> %s already populate %s/%s, \n\tid: %j', options.service, target, field, id);
        return Promise.resolve(item);
      }

      // If it's a mongoose model then
      if (typeof item.toObject === 'function') {
        item = item.toObject(options);
      }
      // If it's a Sequelize model
      else if (typeof item.toJSON === 'function') {
        item = item.toJSON(options);
      }
      // Remove any query from params as it's not related
      let params = {}; // Object.assign({}, hook.params, { query: undefined });
      //console.log('populate:', field, id, params);

      params.populate = options.recursive; // recursive populate
      params.softDelete = options.softDelete || false; // enforce destroyedAt

      // If the relationship is an array of ids, fetch and resolve an object for each,
      // otherwise just fetch the object.
      let promise = null;

      if (isArray(id) && id.length > 1) {
        params.query = { _id: { $in: id } };
        params.paginate = false; // disable paginate
        promise = service.find(params);
      } else {
        if (isArray(id)) id = id[0];
        promise = service.get(id, params);
      }
      return promise.then(result => {
        //debug('setField %j \n ==> %s \n ==> %j', item, field, result.data || result);
        let data = result.data || result;
        if (isArray(item)) {
          item.forEach(i => setField(i, target, data, field, options));
        } else {
          setField(item, target, data, field, options);
        }

        // try nested populate(s)
        if (options.populate) {
          let pPopulates = isArray(options.populate)? options.populate : [options.populate];
          let pPromises = reduce(pPopulates, (promises, pOptions) => {
            let pItem = flatten(getField(item, field));
            let pTarget = pOptions.target || pOptions.field;
            //debug('>>> nested populate %s/%s(options=%s) with %s',
            //  pTarget, pOptions.field, util.inspect(pOptions), util.inspect(pItem));
            promises.push(populate(pItem, pTarget, pOptions));
            return promises;
          }, []);
          return Promise.all(pPromises).then(() => item);
        } else {
          return item;
        }
      }).catch(function(err) {
        console.error(" ERROR: populate %s error %s", options.service, util.inspect(err));
        setField(item, target, {}, field, options);
        return item;
      });
    }

    if (hook.type !== 'after') {
      throw new errors.GeneralError('Can not populate on before hook. (populate)');
    }

    if (hook.params.populate === false) return hook;

    let isPaginated = hook.method === 'find' && hook.result.data;
    let data = isPaginated ? hook.result.data : hook.result;

    if (isArray(data) && data.length === 0) return hook;

    return populate(data, target, options).then(result => {
      //debug('> populate result', util.inspect(result));
      if (isPaginated) {
        hook.result.data = result;
      } else {
        hook.result = result;
      }
      return hook;
    });
  };
}

export function depopulate(target, options = { idField: 'id' }) {
  options = Object.assign({}, options);

  return function(hook) {
    function getDepopulated(item, target) {
      let field = get(item, target);
      if (field === undefined) return undefined;
      if (isArray(field)) {
        field = map(field, it => it[options.idField] || it);
      } else if (field) {
        field = field[options.idField] || field
      }
      return field? field : null;
    }

    function setTarget(data, target, value) {
      if (value !== undefined) {
        set(data, target, value);
      }
    }

    if (hook.type === 'before') {
      setTarget(hook.data, target, getDepopulated(hook.data, target));
    } else {
      if (hook.result) {
        if (hook.result.data) {
          setTarget(hook.result.data, target, getDepopulated(hook.result.data, target));
        } else {
          setTarget(hook.result, target, getDepopulated(hook.result, target));
        }
      }
    }
    if (target === 'parent') {
      debug('depopulate parent', hook.data.parent, typeof hook.data.parent, hook.data);
    }
    return hook;
  };
}