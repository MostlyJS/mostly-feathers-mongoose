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
    const idName = opts.idField || (context.service || {}).id;
    const svcName = (context.service || {}).name;
    const keyPrefix = genHookKey(context, opts.perUser) + ':';

    const items = getHookDataAsArray(context);

    if (context.type === 'after') {
      if (context.method === 'remove') return;

      items.forEach(item => {
        const key = keyPrefix + item[idName];
        if (!fp.contains(key, context.cacheHits || [])) {
          debug(`>> ${svcName} service set cache`, key);
          cacheMap.set(key, fp.clone(item));
        }
      });

      return;
    }

    switch (context.method) {
      case 'find': // fall through
      case 'create':
        break;
      case 'get': {
        const key = keyPrefix + context.id;
        const value = cacheMap.get(key);
        if (value) {
          debug(`<< ${svcName} service hit cache`, key);
          context.cacheHits = fp.concat(context.cached || [], [key]);
          context.result = value;
        } else {
          debug(`<< ${svcName} service miss cache`, key);
        }
        break;
      }
      default: { // update, patch, remove
        if (context.id) {
          const key = keyPrefix + context.id;
          debug(`>> ${svcName} service delete cache`, key);
          cacheMap.delete(key);
        } else {
          items.forEach(item => {
            const key = keyPrefix + context.id;
            debug(`>> ${svcName} service delete cache`, key);
            cacheMap.delete(key);
          });
        }
      }
    }
    return context;
  };
}