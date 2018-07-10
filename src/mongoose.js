const assert = require('assert');
const makeDebug = require('debug');
const mongoose = require('mongoose');

const debug = makeDebug('mostly:feathers-mongoose:connect');

mongoose.Promise = global.Promise;

function connectDb (url) {
  return function (app) {
    mongoose.connection.once('open', function () {
      debug('MongoDB connected [%s]', url);

      mongoose.connection.on('connected', function () {
        debug('MongoDB event connected', url);
      });

      mongoose.connection.on('disconnected', function () {
        debug('MongoDB event disconnected', url);
      });

      mongoose.connection.on('reconnected', function () {
        debug('MongoDB event reconnected', url);
      });

      mongoose.connection.on('error', function (err) {
        console.error('MongoDB event error: ' + err);
      });
    });

    mongoose.connect(url).catch(err => {
      console.error('connect to %s error: ', url, err.message);
      process.exit(1);
    });

    if ((process.env.DEBUG || '').indexOf('mongoose') > -1) {
      mongoose.set('debug', true);
    }
    app.set('mongoose', mongoose);
  };
}

/**
 * Get or create the mongoose model if not exists
 */
function getModel (app, name, Model) {
  const mongooseClient = app.get('mongoose');
  assert(mongooseClient, 'mongoose client not set by app');
  const modelNames = mongooseClient.modelNames();
  if (modelNames.includes(name)) {
    return mongooseClient.model(name);
  } else {
    assert(Model && typeof Model === 'function', 'Model function not privided.');
    return Model(app, name);
  }
}

/**
 * Create a mongoose model with free schema
 */
function createModel (app, name, options) {
  const mongooseClient = app.get('mongoose');
  assert(mongooseClient, 'mongoose client not set by app');
  const schema = new mongooseClient.Schema({ any: {} }, {strict: false});
  return mongooseClient.model(name, schema);
}

/**
 * Create a service with mogoose model
 */
function createService (app, Service, Model, options) {
  Model = options.Model || Model;
  if (typeof Model === 'function') {
    assert(options.ModelName, 'createService but options.ModelName not provided');
    options.Model = Model(app, options.ModelName);
  } else {
    options.Model = Model;
  }
  const service = new Service(options);
  return service;
}

module.exports = {
  connectDb,
  getModel,
  createModel,
  createService
};