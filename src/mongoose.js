import assert from 'assert';
import makeDebug from 'debug';
import mongoose from 'mongoose';

const debug = makeDebug('mostly:feathers-mongoose:connect');

mongoose.Promise = global.Promise;

export function connectDb(url) {
  return function(app) {
    mongoose.connection.once('open', function() {
      debug('MongoDB connected [%s]', url);

      mongoose.connection.on('connected', function() {
        debug('MongoDB event connected', url);
      });

      mongoose.connection.on('disconnected', function() {
        debug('MongoDB event disconnected', url);
      });

      mongoose.connection.on('reconnected', function() {
        debug('MongoDB event reconnected', url);
      });

      mongoose.connection.on('error', function(err) {
        console.error('MongoDB event error: ' + err);
      });
    });

    mongoose.connect(url).catch(err => {
      console.error('connect to %s error: ', url, err.message);
      process.exit(1);
    });

    mongoose.set('debug', true);
    app.set('mongoose', mongoose);
  };
}

export function createModel(app, name, config) {
  const mongooseClient = app.get('mongoose');
  assert(mongooseClient, 'mongoose not set by app');
  debug('mongoose connected', mongooseClient.connection.readyState);
  const schema = new mongooseClient.Schema({ any: {} }, {strict: false});
  return mongooseClient.model(name, schema);
}