import assert from 'assert';
import makeDebug from 'debug';
import errors from 'feathers-errors';
import fp from 'mostly-func';
import { plural } from 'pluralize';
import util from 'util';
import { getField, setField, isSelected, selectNext } from '../helpers';

const debug = makeDebug('mostly:feathers-mongoose:hooks:populate');

const defaultOptions = {
  idField: 'id',
  retained: false // retain existing field when populate as path
};

function isPopulated (obj) {
  return fp.none(fp.isIdLike, [].concat(obj));
}

function kebabServiceName (name) {
  return fp.kebabCase(plural(name));
}

const populateField = async function (app, item, target, params, options) {
  let field = options.field || target;
  const serviceName = options.getService || kebabServiceName; // get service name

  // Find by the field value by default or a custom query
  let entry = null;
  if (Array.isArray(item)) {
    entry = fp.pipe(
      fp.map(it => getField(it, field)),
      fp.flatten,
      fp.reject(fp.isNil)
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
    // already populated entry
    if (isPopulated(entry)) {
      return Promise.resolve(item);
    }
    const getPath = function (value) {
      return {
        _type: getField(value, options.path.substr(1)),
        [options.idField]: getField(value, field)
      };
    };

    options.path = '_type';
    if (Array.isArray(item)) {
      entry = fp.map(getPath, item);
      item.forEach(it => setField(it, field, entry, field, { idField: options.idField }));
    } else {
      entry = getPath(item);
      setField(item, field, entry, field, { idField: options.idField });
    }
  }

  // typed id with service like `document:1`, convert as options.path
  if (!options.path && !options.service) {
    // already populated entry
    if (isPopulated(entry)) {
      return Promise.resolve(item);
    }
    // convert typed id to to { _id, _type } structure
    const getPath =  function (value) {
      if (fp.is(String, value) && value.indexOf(':') > 0) {
        let [path, id] = value.split(':');
        return { _id: value, _type: path, [options.idField]: id };
      } else {
        // keep original value in _value
        return { _id: value, _type: value, [options.idField]: null, _value: value };
      }
    };

    // transform the data with _type path
    options.path = '_type';
    if (Array.isArray(entry)) {
      entry = fp.map(getPath, entry);
      if (Array.isArray(item)) {
        item.forEach(it => setField(it, field, entry, field, { idField: '_id' }));
      } else {
        setField(item, field, entry, field, { idField: '_id' });
      }
    } else {
      entry = getPath(entry);
      if (Array.isArray(item)) {
        item.forEach(it => setField(it, field, entry, field, { idField: '_id' }));
      } else {
        setField(item, field, entry, field, { idField: '_id' });
      }
    }
  }

  //debug('==> %s populate %s/%s, \n\tid: %j', options.service, target, field, entry);
  //debug(' \n\twith: %j', item);

  if (!options.path && isPopulated(entry)) {
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

  // pass infomation of the $select and specified by options.fallThrough
  const selection = { $select: params.query.$select };
  params = options.fallThrough? fp.pick(options.fallThrough, params) : {};
  params.query = selection;

  //console.log('populate:', field, entry, params);

  params.softDelete = options.softDelete || false; // filter deleted records

  // If the relationship is an array of ids, fetch and resolve an object for each,
  // otherwise just fetch the object.
  let fetchAll = null;

  if (Array.isArray(entry)) {
    let services = [];
    if (options.path) {
      let entries = fp.groupBy(fp.prop(options.path), entry);
      services = fp.map(entry => {
        return fp.map(fp.prop(options.idField), entry);
      }, entries);
    } else {
      services = {
        [options.service]: entry
      };
    }
    debug('populate =>', field, services, params.query.$select);

    params.paginate = false; // disable paginate
    fetchAll = Promise.all(fp.map(service => {
      let serviceParams = fp.assignAll({ query: {} }, params);
      if (services[service]) {
        serviceParams.query['_id'] = { $in: services[service] };
        const name = fp.kebabCase(plural(service));
        return app.service(serviceName(name)).find(serviceParams);
      }
    }, Object.keys(services)));
  } else {
    let service = options.service;
    let id = entry;
    if (options.path) {
      if (entry[options.path]) {
        service = serviceName(entry[options.path]);
      } else {
        service = options.path;
      }
      id = entry[options.idField];
    }
    debug('populate =>', field, { [service]: id }, params.query.$select);

    fetchAll = app.service(service).get(id, params);
  }

  try {
    let results = await fetchAll;
    // debug('populate services found', results);
    results = fp.propOf('data', results);
    if (Array.isArray(results)) {
      results = fp.flatMap(fp.propOf('data'), results);
    }
    // debug('setField %j \n ==> %s \n ==> %j', entry, field, data);
    if (Array.isArray(item)) {
      item.forEach(it => setField(it, target, results, field, options));
    } else {
      setField(item, target, results, field, options);
    }
    return item;
  } catch (err) {
    console.error(" ERROR: populate %s error %s", options.service, util.inspect(err));
    setField(item, target, {}, field, options);
    return item;
  }
};

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
export default function populate (target, opts) {
  opts = Object.assign({}, defaultOptions, opts);

  return async (context) => {
    const options = Object.assign({}, opts);  // clone for change

    if (context.type !== 'after') {
      throw new errors.GeneralError('Can not populate on before hook. (populate)');
    }

    // each target field should have its own params
    let params = fp.assignAll({ query: {} }, context.params);

    // target field must be specified by $select to populate
    if (!isSelected(target || options.field, params)) return context;

    // $select with * for next level
    if (params.query.$select) {
      params.query.$select = selectNext(target || options.field, params.query.$select);
    }

    const data = fp.propOf('data', context.result);

    if (fp.isNil(data) || fp.isEmpty(data)) return context;

    const result = await populateField(context.app, data, target, params, options);
    //debug('> populate result', util.inspect(result));
    if (fp.hasProp('data', context.result)) {
      context.result.data = result;
    } else {
      context.result = result;
    }
    return context;
  };
}
