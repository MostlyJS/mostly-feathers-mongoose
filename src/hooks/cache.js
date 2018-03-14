import makeDebug from 'debug';
import fp from 'mostly-func';
import { getHookDataAsArray, genHookKey } from '../helpers';

const debug = makeDebug('mostly:feathers-mongoose:hooks:cache');

const defaultOptions = {
  idField: 'id',
  perUser: false
};

export default function (cacheMap, opts) {
  opts = fp.assign(defaultOptions, opts);
  
  return context => {
    const idField = opts.idField || (context.service || {}).id;
    const svcName = (context.service || {}).name;
    const altKey = genHookKey(context, opts.perUser);

    const items = getHookDataAsArray(context);
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
      if (context.method === 'remove') return;

      items.forEach(item => {
        const key = item[idField], path = item[idField] + '.' + altKey;
        if (!fp.contains(path, context.cacheHits || [])) {
          debug(`>> ${svcName} service set cache`, path);
          const value = cacheMap.get(item[idField]) || {};
          cacheMap.set(key, fp.merge(value, { [altKey]: item }));
        }
      });

      if (context.cacheResults) {
        const results = getHookDataAsArray(context);
        context.result = resultFor(fp.concat(context.cacheResults, results));
      }

      return;
    }

    const getFromCache = (id) => {
      const value = cacheMap.get(id), path = id + '.' + altKey;
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
            const value = getFromCache(id);
            if (value) {
              context.result = resultFor([value]);
            }
          } else if (id.$in && id.$in.length > 0) {
            const ids = fp.uniq(id.$in);
            const values = fp.reject(fp.isNil, fp.map(getFromCache, ids));
            if (values.length === ids.length) { // hit all
              context.result = resultFor(values);
            }
          }
        }
        break;
      case 'create':
        break;
      case 'get': {
        const value = getFromCache(context.id);
        if (value) {
          context.result = value;
        }
        break;
      }
      default: { // update, patch, remove
        if (context.id) {
          debug(`>> ${svcName} service delete cache`, context.id);
          cacheMap.delete(context.id);
        } else {
          items.forEach(item => {
            debug(`>> ${svcName} service delete cache`, context.id);
            cacheMap.delete(context.id);
          });
        }
      }
    }
    return context;
  };
}