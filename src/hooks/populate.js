import assert from 'assert';
import makeDebug from 'debug';
import errors from 'feathers-errors';
import { plural } from 'pluralize';
import fp from 'ramda';
import validator from 'validator';
import util from 'util';
import { getField, setField, setFieldByKey } from '../helpers';

const debug = makeDebug('mostly:feathers-mongoose:hooks:populate');

const defaultOptions = {
  idField: 'id',
  retained: false // retain existing field when populate as path
};

function isPopulated (obj) {
  const isPlain = (val) => val && !(fp.is(String, val) || validator.isMongoId(val.toString()));
  return fp.reduce((result, val) => {
    return result && isPlain(val)
  }, true, [].concat(obj));
}

function populateField (hook, item, target, options) {
  let field = options.field || target;

  // Find by the field value by default or a custom query
  let entry = null;
  if (Array.isArray(item)) {
    entry = fp.compose(
      fp.reject(fp.isNil),
      fp.flatten,
      fp.map(it => getField(it, field))
    )(item);
  } else {
    entry = getField(item, field);
  }

  // invalid entry id
  if (!entry || entry.length === 0) {
    return Promise.resolve(item);
  }

  // absolute path for the service
  if (options.path && options.path.startsWith('@')) {
    function getPath(value) {
      return {
        _type: getField(value, options.path.substr(1)),
        [options.idField]: getField(value, field)
      };
    }

    if (Array.isArray(item)) {
      entry = fp.map(getPath, item);
      item.forEach((it) => setField(it, field, entry, field, { idField: options.idField }));
    } else {
      entry = getPath(item);
      setField(item, field, entry, field, { idField: options.idField });
    }
    options.path = '_type';
  }

  // id with service `document:1`, convert as options.path
  if (!options.path && !options.service) {
    function getPath(value) {
      if (value.indexOf(':') > 0) {
        let [path, id] = value.split(':');
        return { _id: value, _type: path, [options.idField]: id };
      }
      return value;
    }

    if (Array.isArray(entry)) {
      entry = fp.map(getPath, entry);
      item.forEach((it) => setField(it, field, entry, field, { idField: '_id' }));
    } else {
      entry = getPath(entry);
      setField(item, field, entry, field, { idField: '_id' });
    }
    options.path = '_type';
  }

  //debug('==> %s populate %s/%s, \n\tid: %j', options.service, target, field, entry);
  //debug(' \n\twith: %j', item);

  if (!options.path && isPopulated(entry)) {
    debug('==> %s already populate %s/%s, \n\tid: %j', options, target, field, entry);
    return Promise.resolve(item);
  }

  assert(options.service || options.path, 'You need to provide a service or path');

  // If it's a mongoose model then
  if (typeof item.toObject === 'function') {
    item = item.toObject(options);
  }
  // If it's a Sequelize model
  else if (typeof item.toJSON === 'function') {
    item = item.toJSON(options);
  }
  // Fall through the hook.params ?
  let params = options.fallThrough
    ? Object.assign({}, hook.params, { query: undefined })
    : {};
  //console.log('populate:', field, entry, params);

  params.populate = options.recursive; // recursive populate
  params.softDelete = options.softDelete || false; // enforce destroyedAt

  // If the relationship is an array of ids, fetch and resolve an object for each,
  // otherwise just fetch the object.
  let promise = null;

  if (Array.isArray(entry)) {
    let services = [];
    if (options.path) {
      let entries = fp.groupBy(fp.prop(options.path), entry);
      services = fp.map((entry) => {
        return fp.map(fp.prop(options.idField), entry);
      }, entries);
      debug('populate services', services);
    } else {
      services = {
        [options.service]: entry
      };
    }
    params.paginate = false; // disable paginate
    promise = Promise.all(fp.map((service) => {
      let groupParams = Object.assign({}, params);
      groupParams.query = { _id: { $in: services[service] } };
      return hook.app.service(plural(service)).find(groupParams);
    }, Object.keys(services)));
  } else {
    let service = options.service;
    let id = entry;
    if (options.path) {
      if (entry[options.path]) {
        service = plural(entry[options.path]);
      } else {
        service = options.path;
      }
      id = entry[options.idField];
      debug('populate service', service, id);
    }
    promise = hook.app.service(service).get(id, params);
  }
  return promise.then((results) => {
    debug('services found', results);
    let data = results.data || results;
    if (Array.isArray(results)) {
      data = fp.flatten(fp.map(result => result.data || result, results));
    }
    // debug('setField %j \n ==> %s \n ==> %j', entry, field, data);
    if (Array.isArray(item)) {
      item.forEach(it => setField(it, target, data, field, options));
    } else {
      setField(item, target, data, field, options);
    }

    // try nested populate(s)
    if (options.populate) {
      let pPopulates = Array.isArray(options.populate)? options.populate : [options.populate];
      let pPromises = fp.reduce((promises, pOptions) => {
        let pItem = fp.flatten(getField(item, field));
        let pTarget = pOptions.target || pOptions.field;
        //debug('>>> nested populate %s/%s(options=%s) with %s',
        //  pTarget, pOptions.field, util.inspect(pOptions), util.inspect(pItem));
        promises.push(populateField(pItem, pTarget, pOptions));
        return promises;
      }, [], pPopulates);
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
export function populate (target, opts) {
  opts = Object.assign({}, defaultOptions, opts);

  return function(hook) {
    let options = Object.assign({}, opts);  // clone for change

    // If it was an internal call then do not recursive populate
    options.recursive = !!hook.params.provider;

    if (hook.type !== 'after') {
      throw new errors.GeneralError('Can not populate on before hook. (populate)');
    }

    if (hook.params.populate === false) return hook;

    let isPaginated = hook.method === 'find' && hook.result.data;
    let data = isPaginated ? hook.result.data : hook.result;

    if (Array.isArray(data) && data.length === 0) return hook;
    
    return populateField(hook, data, target, options).then(result => {
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

export function depopulate (target, opts = { idField: 'id' }) {

  return function(hook) {
    let options = Object.assign({}, opts);

    function getDepopulated(item, target) {
      let field = fp.prop(target, item);
      if (field === undefined) return undefined;
      if (Array.isArray(field)) {
        field = fp.map((it) => it[options.idField] || it, field);
      } else if (field) {
        field = field[options.idField] || field;
      }
      return field? field : null;
    }

    function setTarget(data, target, value) {
      if (value !== undefined) {
        return fp.assocPath(target.split('.'), value, data);
      }
      return data;
    }

    if (hook.type === 'before') {
      hook.data = setTarget(hook.data, target, getDepopulated(hook.data, target));
    } else {
      if (hook.result) {
        if (hook.result.data) {
          hook.result.data = setTarget(hook.result.data, target, getDepopulated(hook.result.data, target));
        } else {
          hook.result = setTarget(hook.result, target, getDepopulated(hook.result, target));
        }
      }
    }
    return hook;
  };
}