import makeDebug from 'debug';
import fp from 'mostly-func';
import util from 'util';
import { getHookDataAsArray, genHookKey } from '../helpers';

const debug = makeDebug('mostly:feathers-mongoose:hooks:cache');

const defaultOptions = {
  idField: 'id',
  perUser: false
};

/**
 * IMPORTANT CONSTRAINTS
 * Currently cacheMap must be stand-alone cache (like Redis) for each service,
 * otherwise cache cannot be deleted properly and may be stalled.
 * 
 * Another issue will be caching with populate/assoc fields, we need to find a 
 * possible way to invalidate cache when the populated data changed.
 */
export default function (cacheMap, opts) {
  opts = fp.assign(defaultOptions, opts);

  // get query result from cacheMap and check lastWrite
  const getCacheQuery = async function (svcKey, queryKey) {
    const results = await cacheMap.multi(svcKey, queryKey);
    const svcData = results[0] && JSON.parse(results[0]);
    let queryData = results[1] && JSON.parse(results[1]);

    // special cache miss where it is out of date
    if (queryData && svcData && svcData.lastWrite > queryData.metadata.lastWrite) {
      debug('cache out of date: ', queryKey);
      queryData = null;
    }
    return [svcData, queryData];
  };

  return async function (context) {
    const idField = opts.idField || (context.service || {}).id;
    const svcName = (context.service || {}).name;
    const altKey = genHookKey(context, opts.perUser);

    const resultFor = (data) => {
      return {
        metadata: {
          total: data.length,
          limit: context.params.query.$limit || 10,
          skip: context.params.query.$skip || 0
        },
        data: data
      };
    };

    if (context.type === 'after') {

      const items = getHookDataAsArray(context);

      switch (context.method) {
        case 'find': // fall through
        case 'get': {
          // save for cache
          for (const item of items) {
            const key = item[idField], path = item[idField] + '.' + altKey;
            if (!fp.contains(path, context.cacheHits || [])) {
              debug(`>> ${svcName} service set cache`, path);
              const value = await cacheMap.get(item[idField]) || {};
              await cacheMap.set(key, fp.merge(value, { [altKey]: item }));
            }
          }
          break;
        }
        default: { // update, patch, remove
          for (const item of items) {
            debug(`>> ${svcName} service delete cache`, item[idField]);
            await cacheMap.delete(item[idField]);
          }
        }
      }

    } else {

      const getFromCache = async (id) => {
        const value = await cacheMap.get(id), path = id + '.' + altKey;
        if (value && value[altKey]) {
          debug(`<< ${svcName} service hit cache`, path);
          context.cacheHits = fp.concat(context.cacheHits || [], [path]);
          return value[altKey];
        } else {
          debug(`<< ${svcName} service miss cache`, path);
          return null;
        }
      };

      switch (context.method) {
        case 'find':
          if (context.params && context.params.query) {
            const id = context.params.query.id || context.params.query._id || {};
            if (fp.is(String, id)) {
              const value = await getFromCache(id);
              if (value) {
                context.result = resultFor([value]);
              }
            } else if (id.$in && id.$in.length > 0) {
              const ids = fp.uniq(id.$in);
              const values = await Promise.all(fp.map(getFromCache, ids)).then(fp.reject(fp.isNil));
              if (values.length === ids.length) { // hit all
                context.result = resultFor(values);
              }
            } else {
              // cache on service level
            }
          }
          break;
        case 'create':
          break;
        case 'get': {
          const value = await getFromCache(context.id);
          if (value) {
            context.result = value;
          }
          break;
        }
        default: { // update, patch, remove
          if (context.id) {
            debug(`>> ${svcName} service delete cache`, context.id);
            await cacheMap.delete(context.id);
          }
        }
      }
    }

    return context;
  };
}