import crypto from 'crypto';
import makeDebug from 'debug';
import fp from 'mostly-func';
import util from 'util';
import { getHookDataAsArray } from '../helpers';

const debug = makeDebug('mostly:feathers-mongoose:hooks:cache');

const defaultOptions = {
  idField: 'id',
  keyPrefix: 'mostly:cache:',
  perUser: false,
  ttl: 60
};

/**
 * IMPORTANT CONSTRAINTS
 * Currently cacheMap must be stand-alone cache (like Redis) for each service,
 * otherwise cache cannot be deleted properly and may be stalled.
 * 
 * Another issue will be caching with populate/assoc fields, we need to find a 
 * possible way to invalidate cache when the populated data changed.
 * 
 * Cache structure
 * - service
 *   - metadata: lastWrite
 *   - queryKey: value
 * - id
 *   - metadata: lastWrite
 *   - queryKey: value
 */
export default function (cacheMap, opts) {
  opts = fp.assign(defaultOptions, opts);

  const genKey = (context, id) => {
    const hash = crypto.createHash('md5')
      .update(context.path)
      .update(context.method)
      .update(JSON.stringify(context.params.query || {}))
      .update(context.params.provider || '')
      .update(fp.dotPath('headers.enrichers-document', context.params) || '')
      .update(fp.dotPath('headers.enrichers-document', context.params) || '')
      .update(opts.perUser && context.params.user && context.params.user.id || '')
      .digest('hex');
    return opts.keyPrefix + (id? id + ':' + hash : hash);
  };

  // get query result from cacheMap and check lastWrite
  const getCacheValue = async function (svcKey, idKey, queryKey) {
    const results = await cacheMap.multi(svcKey, idKey, queryKey);
    const svcMeta = results[0] && JSON.parse(results[0]);
    const idMeta = results[1] && JSON.parse(results[1]);
    const cacheValue = results[2] && JSON.parse(results[2]);

    // special cache miss where it is out of date
    if (cacheValue && cacheValue.metadata) {
      let outdated = false;
      if (svcMeta && svcMeta.lastWrite) {
        outdated = cacheValue.metadata.lastWrite < svcMeta.lastWrite;
        if (idMeta && idMeta.lastWrite) {
          outdated = outdated
            || idMeta.lastWrite < svcMeta.lastWrite
            || cacheValue.metadata.lastWrite < idMeta.lastWrite;
        }
      }
      if (outdated) {
        debug(`<< ${svcKey} out of date:`, svcKey, idKey, queryKey);
        return null;
      } else {
        debug(`<< ${svcKey} hit cache:`, svcKey, idKey, queryKey);
        return cacheValue.data;
      }
    } else {
      debug(`<< ${svcKey} miss cache`, svcKey, idKey, queryKey);
      return null;
    }
  };

  const setCacheValue = async function (queryKey, value, ttl) {
    return cacheMap.set(queryKey, JSON.stringify({
      metadata: { lastWrite: Date.now() },
      data: value
    }));
  };

  const touchService = async function (nameKey) {
    debug('${nameKey} touched: ', Date.now());
    return cacheMap.set(nameKey, JSON.stringify({
      lastWrite: Date.now()
    }));
  };

  return async function (context) {
    const idField = opts.idField || (context.service || {}).id;
    const svcName = (context.service || {}).name;
   
    const svcKey = opts.keyPrefix + svcName;

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

    const saveHits = (queryKey) => {
      context.cacheHits = (context.cacheHits || []).concat(queryKey);
    };

    if (context.type === 'after') {

      const items = getHookDataAsArray(context);

      switch (context.method) {
        case 'find': // fall through
        case 'get': {
          // save for cache
          for (const item of items) {
            const idKey = opts.keyPrefix + item[idField];
            const queryKey = genKey(context, item[idField]);
            if (!fp.contains(queryKey, context.cacheHits || [])) {
              debug(`>> ${svcKey} set cache`, queryKey);
              await setCacheValue(queryKey, item, opts.ttl);
            }
          }
          break;
        }
        default: { // update, patch, remove
          for (const item of items) {
            const idKey = opts.keyPrefix + item[idField];
            await touchService(idKey);
          }
        }
      }

    } else {

      switch (context.method) {
        case 'find':
          if (context.params && context.params.query) {
            const id = context.params.query.id || context.params.query._id || {};
            if (fp.is(String, id)) {
              const idKey = opts.keyPrefix + id;
              const queryKey = genKey(context, id);
              const value = await getCacheValue(svcKey, idKey, queryKey);
              if (value) {
                saveHits(queryKey);
                context.result = resultFor([value]);
              }
            } else if (id.$in && id.$in.length > 0) {
              const ids = fp.uniq(id.$in);
              const values = await Promise.all(id => {
                const idKey = opts.keyPrefix + id;
                const queryKey = genKey(context, id);
                return getCacheValue(svcKey, idKey, queryKey);
              }, ids).then(fp.reject(fp.isNil));
              if (values.length === ids.length) { // hit all
                for (const id of ids) {
                  const queryKey = genKey(context, id);
                  saveHits(queryKey);
                }
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
          const idKey = opts.keyPrefix + context.id;
          const queryKey = genKey(context, context.id);
          const value = await getCacheValue(svcKey, idKey, queryKey);
          if (value) {
            saveHits(queryKey);
            context.result = value;
          }
          break;
        }
        default: { // update, patch, remove
          if (context.id) {
            const idKey = opts.keyPrefix + context.id;
            await touchService(idKey);
          } else {
            await touchService(svcKey);
          }
        }
      }
    }

    return context;
  };
}