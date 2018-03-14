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

    if (context.type === 'after') {
      if (context.method === 'remove') return;

      items.forEach(item => {
        const key = item[idField], path = altKey + '.' + item[idField];
        if (!fp.contains(path, context.cacheHits || [])) {
          debug(`>> ${svcName} service set cache`, path);
          const value = cacheMap.get(item[idField]) || {};
          cacheMap.set(key, fp.merge(value, { [altKey]: item }));
        }
      });

      return;
    }

    switch (context.method) {
      case 'find': // fall through
      case 'create':
        break;
      case 'get': {
        const value = cacheMap.get(context.id), path = altKey + '.' + context.id;
        if (value && value[altKey]) {
          debug(`<< ${svcName} service hit cache`, path);
          context.cacheHits = fp.concat(context.cached || [], [path]);
          context.result = value[altKey];
        } else {
          debug(`<< ${svcName} service miss cache`, path);
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