import crypto from 'crypto';
import makeDebug from 'debug';
import fp from 'mostly-func';
import util from 'util';
import { getHookData, getHookDataAsArray } from '../helpers';

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
 *   - lastWrite: time
 *   - queryKey: value
 * - id
 *   - lastWrite: time
 *   - queryKey: value
 */
export default function (cacheMap, opts) {
  opts = fp.assign(defaultOptions, opts);

  // generate a unique key for query with same params
  // you can fake a query also to hit the cache
  const genQueryKey = (context, id, fakeQuery) => {
    const hash = crypto.createHash('md5')
      .update(context.path)
      .update(context.method)
      .update(JSON.stringify(fakeQuery || context.params.query || {}))
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
    if (cacheValue) {
      let outdated = false;
      if (svcMeta) {
        outdated = outdated || cacheValue.metadata.lastWrite < svcMeta.lastWrite;
      }
      if (idMeta) {
        outdated = outdated || cacheValue.metadata.lastWrite < idMeta.lastWrite;
      }
      if (svcMeta && idMeta) {
        outdated = outdated || idMeta.lastWrite < svcMeta.lastWrite;
      }
      if (outdated) {
        debug(`<< ${svcKey} out of date: ${queryKey}`);
        return null;
      } else {
        debug(`<< ${svcKey} hit cache: ${queryKey}`);
        return fp.dissocPath(['metadata', 'lastWrite'], cacheValue);
      }
    } else {
      debug(`<< ${svcKey} miss cache: ${queryKey}`);
      return null;
    }
  };

  const setCacheValue = async function (queryKey, value, ttl) {
    let metadata = { lastWrite: Date.now() };
    let data = value;

    if (value && value.data) {
      metadata = fp.assign(metadata, value.metadata || fp.omit(['data'], value));
      data = value.data;
    }
    return cacheMap.set(queryKey, JSON.stringify({ metadata, data }));
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

    const saveHits = (queryKey) => {
      context.cacheHits = (context.cacheHits || []).concat(queryKey);
    };

    if (context.type === 'after') {

      const saveForCache = async function (items) {
        for (const item of items) {
          const idKey = opts.keyPrefix + item[idField];
          const queryKey = genQueryKey(context, item[idField]);
          if (!fp.contains(queryKey, context.cacheHits || [])) {
            debug(`>> ${svcKey} set cache: ${queryKey}`);
            await setCacheValue(queryKey, item, opts.ttl);
          }
        }
      };

      switch (context.method) {
        case 'find': {
          const queryKey = genQueryKey(context);
          await setCacheValue(queryKey, context.result, opts.ttl);
          break;
        }
        case 'get': {
          // save for cache
          if (context.id) {
            const item = getHookData(context);
            await saveForCache([item]);
          }
          break;
        }
        default: { // update, patch, remove
          const items = getHookDataAsArray(context);
          for (const item of items) {
            const idKey = opts.keyPrefix + item[idField];
            await touchService(idKey);
          }
        }
      }

    } else {

      switch (context.method) {
        case 'find': {
          const queryKey = genQueryKey(context);
          const values = await getCacheValue(svcKey, null, queryKey);
          if (values) {
            context.result = values;
          }
          break;
        }
        case 'create':
          break;
        case 'get': {
          if (context.id) {
            const idKey = opts.keyPrefix + context.id;
            const queryKey = genQueryKey(context, context.id);
            const value = await getCacheValue(svcKey, idKey, queryKey);
            if (value) {
              saveHits(queryKey);
              context.result = value.data;
            }
          }
          break;
        }
        default: { // update, patch, remove
          if (context.id) {
            const idKey = opts.keyPrefix + context.id;
            await Promise.all([
              touchService(svcKey),
              touchService(idKey)
            ]);
          } else {
            await touchService(svcKey);
          }
        }
      }
    }

    return context;
  };
}