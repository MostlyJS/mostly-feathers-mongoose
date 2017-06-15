/**
 * Mongoose Cache Plugin
 * Based on https://github.com/englercj/mongoose-cache-manager
 */
import util from 'util';
import crypto from 'crypto';

const debug = require('debug')('mostly:feathers-mongoose:plugins:mongoose_cache_plugin');

const defaultOptions = {
  cache: true,
  ttl: 60,
  prefix: 'mostly:mongoose:',
  cacheStrageries: []
};

let isMongoosePatched = false;
let redisClient = null;

// get query result from redis cache and check lastWrite
let getCacheQuery = function (collectionKey, queryKey) {
  return new Promise(function(ok) {
    redisClient.multi().get(collectionKey).get(queryKey).exec(function (err, results) {
      if (err) {
        err.message = util.format('mongoose cache error %s', queryKey);
        debug(err);
        ok([null, null]); // ignore error, instead reject
        //return error(err);
      }

      var collectionData = results[0] && JSON.parse(results[0]),
        queryData = results[1] && JSON.parse(results[1]);
      //debug('redis cache object size', queryKey, helpers.getObjectSize(queryData));

      // special cache miss where it is out of date
      if (queryData && collectionData && collectionData.lastWrite > queryData.metadata.lastWrite) {
        debug('mongoose cache out of date: ', queryKey);
        queryData = null;
      }
      ok([collectionData, queryData]);
    });
  });
};

let touchCollection = function (name) {
  debug('mongoose touched: ', name, Date.now());
  redisClient.set(defaultOptions.prefix + name, JSON.stringify({
    lastWrite: Date.now()
  }));
};

let genKey = function(query, populate) {
  if (query._pipeline) {
    return genKeyAggregate(query, populate);
  }
  return crypto.createHash('md5')
    .update(JSON.stringify(query._conditions || {}))
    .update(JSON.stringify(query._optionsForExec(query.model) || {}))
    .update(JSON.stringify(query._fields || {}))
    .update(JSON.stringify(populate))
    .digest('hex');
};

let genDebugKey = function(query, populate) {
  return 'condition = ' + JSON.stringify(query._conditions || {})  + 
    ', options = ' + JSON.stringify(query._optionsForExec(query.model) || {}) + 
    ', fields = ' + JSON.stringify(query._fields || {}) + 
    ', populate = ' + JSON.stringify(populate);
};

let genKeyAggregate = function(aggregate, populate) {
  return crypto.createHash('md5')
    .update(JSON.stringify(aggregate._conditions || {}))
    .update(JSON.stringify(aggregate._pipeline || {}))
    .update(JSON.stringify(aggregate._optionsForExec(aggregate.model) || {}))
    .update(JSON.stringify(aggregate._fields || {}))
    .update(JSON.stringify(populate))
    .digest('hex');
};

// This make regexp serialize properly in queries with regular expressions
if(!RegExp.prototype.hasOwnProperty('toJSON')) {
  Object.assign(RegExp.prototype, {
    toJSON: function() {
      let str = this.toString();
      let obj = { $regexp: this.source };
      let opts = str.substring(str.lastIndexOf('/') + 1);

      if (opts.length) {
        obj.$options = opts;
      }
      return obj;
    }
  });
}


export default function mongooseCache(mongoose, redis, options) {
  // 'options' is an optional param
  // if (typeof options === 'function') {
  //   cb = options;
  //   options = null;
  // }

  // setup the default options
  options = options || {};
  Object.keys(defaultOptions).forEach(k => {
    defaultOptions[k] = options[k] !== undefined ? options[k] : defaultOptions[k];
  });

  // export some values for testing
  mongooseCache._defaultOptions = defaultOptions;

  redisClient = redis;
  
  // don't patch it again, just let the options/cache get updated
  debug('mongoose patched: ', isMongoosePatched);
  if (isMongoosePatched) {
    return mongoose;
  }

  var origQuery = {
    execFind: mongoose.Query.prototype.execFind,
    exec: mongoose.Query.prototype.exec
    //execAggregate: Aggregate.prototype.exec
  };
  var origModel = {};

  var protoQuery = mongoose.Query.prototype,
    protoModel = mongoose.Model.prototype;

  /**
   * Patch the mongoose exec method
   */
  protoQuery.exec = function (operation, cb) {
    var op = operation;
    var callback = cb;

    if (typeof op === 'function') {
      callback = op;
      op = null;
    }

    var self = this,
      populate = this.options.populate || {},
      cached = this.options.cached || this.cached,
      ttl = this.options.cacheStrageries[this.model.collection.name] || this.ttl;

    // remove our temp options
    delete this._mongooseOptions.cache;
    delete this._mongooseOptions.ttl;

    // if this is a exec'd write query pass it along and update the timestamp
    if (op === 'update' || op === 'remove') {
      debug('mongoose exec update/remove: ', op, arguments);
      touchCollection(this.model.collection.name);
      return origQuery.exec.apply(this, arguments);
    }

    // if we are not caching this query
    if (!cached) {
      debug('mongoose not cached: ', op, this.model.collection.name, genDebugKey(this));
      return origQuery.exec.apply(this, arguments);
    }

    // generate the hash that will be used as the key
    var hash = genKey(this, populate),
      debugHash = genDebugKey(this),
      // create the string keys for the cache
      collectionKey = defaultOptions.prefix + this.model.collection.name,
      queryKey  = collectionKey + ':' + hash;

    console.time('mongoose-cache-plugin');
    return new Promise(function(ok, error) {
      getCacheQuery(collectionKey, queryKey).spread(function(collectionData, queryData) {
        // CACHE HIT CASE
        // if the key was found in cache, and the date check was also good
        // then just return this cache key directly to the user.
        if (queryData) {
          debug('mongoose cache hit: ', queryKey, debugHash);
          // innstance the mongoose document
          //var docs = new self.model(queryData.docs);
          console.timeEnd('mongoose-cache-plugin');
          ok(queryData.docs);
        }
        // CACHE MISS CASE
        // if the query is not found in cache, or if the last write time that
        // the cached query results represent is before a more recent write, then
        // run the original Mongoose exec() function and cache the results.
        else {
          debug('mongoose cache miss: ', queryKey, debugHash);
          Object.keys(populate).forEach(k => {
            let path = populate[k];
            path.options = path.options || {};
            path.options.cache = path.options.cache || false;
          });

          // run the regular mongoose exec()
          origQuery.exec.call(self, function (err, docs) {
            if (err) return error(err);

            // store the docs in the cache to get a hit next time
            var cacheData = JSON.stringify(self._createQueryCacheData(docs, collectionData && collectionData.lastWrite));
            debug('mongoose store cache: ', ttl, queryKey);
            redisClient.setex(queryKey, ttl, cacheData, function(err) {
              if (err) {
                err.message = 'mongoose redis error';
                debug(err);
              }
            });
            // return the value to the user
            console.timeEnd('mongoose-cache-plugin');
            ok(docs);
          });
        }
      }).catch(function(err) {
        //TODO: Should we treat a cache error as just a cache miss??
        error(err);
      });
    }).asCallback(callback);
  };

  /**
   * Patch the mongoose update method
   */
  ['remove', 'save', 'update'].forEach(function (op) {
    origQuery[op] = protoQuery[op];
    protoQuery[op] = function () {
      debug('touch query collection', op, this.model.collection.name, JSON.stringify(arguments));
      this._touchCollectionCheck.apply(this, arguments);
      return origQuery[op].apply(this, arguments);
    };
  });

  /**
   * Patch the mongoose save method
   */
  ['remove', 'save', 'update', 'create'].forEach(function (op) {
    origModel[op] = protoModel[op];
    protoModel[op] = function () {
      debug('touch model collection', op, this.collection.name, JSON.stringify(arguments));
      touchCollection(this.collection.name);
      return origModel[op].apply(this, arguments);
    };
  });

  /**
   * Set the cache/ttl settings for this query
   *
   * @method cache
   * @param ttl {Boolean|Number} The time to live for this query, `false` means do not cache
   * @return {Query} returns the query object
   */
  protoQuery.cache = function (ttl) {
    this.options.cache = (ttl !== false);
    this.options.ttl = ttl;

    return this;
  };

  /**
   * Creates the cache data object that will be stored for a query
   *
   * @method _createQueryCacheData
   * @private
   * @param docs {Mixed} The mongoose document data to store
   * @param lastWrite {Number} The lastWrite value that was read from the collection cache
   * @return {String} The cache data to write to the store
   */
  protoQuery._createQueryCacheData = function (docs, lastWrite) {
    return {
      metadata: {
        lastWrite: lastWrite || 0
      },
      docs: docs
    };
  };

  protoQuery._touchCollectionCheck = function () {
    var callback = arguments.length ? arguments[arguments.length - 1] : false;

    // mquery doesn't run the write unless there is a callback so unless
    // there is one here, we do not want to touch the collection data.
    if (callback) {
      touchCollection(this.model.collection.name);
    }
  };

  Object.defineProperty(protoQuery, 'ttl', {
    get: function () {
      // we always check the most specific (query options) first and get
      // more and more general until we default to the global option.
      return this.options.ttl ||
          this.model && this.model.schema.options.ttl ||
          (this._mongooseOptions && this._mongooseOptions.ttl) ||
          defaultOptions.ttl;
    }
  });

  /* jshint ignore:start */
  Object.defineProperty(protoQuery, 'cached', {
    get: function () {
      // if a value is null || undefined skip it and check the next.
      // we always check the most specific (query options) first and get
      // more and more general until we default to the global option.
      if (this.options.cache != null) {
        return this.options.cache;
      }
      else if (this.model && this.model.schema.options.cache != null) {
        return this.model.schema.options.cache;
      }
      else if (this._mongooseOptions && this._mongooseOptions.cache != null) {
        return this._mongooseOptions.cache;
      }
      else {
        return defaultOptions.cache;
      }
    }
  });
  /* jshint ignore:end */


  isMongoosePatched = true;

  return mongoose;
}