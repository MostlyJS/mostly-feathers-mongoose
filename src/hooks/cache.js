import makeDebug from 'debug';
import fp from 'mostly-func';
import { getItems } from 'feathers-hooks-common';

const debug = makeDebug('mostly:feathers-mongoose:hooks:cache');

const defaultOptions = {
  idField: 'id',
};


export default function (cacheMap, opts) {
  opts = Object.assign({}, defaultOptions, opts);
  
  return context => {
    const idName = opts.idField || (context.service || {}).id;
    const svcName = (context.service || {}).name;
    let items = getItems(context);
    items = Array.isArray(items) ? items : [items];

    if (context.type === 'after') {
      if (context.method === 'remove') return;

      items.forEach(item => {
        debug(`>> ${svcName} service set cache`, item[idName]);
        cacheMap.set(item[idName], fp.clone(item));
      });

      return;
    }

    switch (context.method) {
      case 'find': // fall through
      case 'create':
        return;
      case 'get':
        const value = cacheMap.get(context.id);
        if (value) {
          debug(`<< ${svcName} service get cache`, context.id);
          context.result = value;
        }
        return context;
      default: // update, patch, remove
        if (context.id) {
          cacheMap.delete(context.id);
          return;
        }

        items.forEach(item => {
          debug(`>> ${svcName} service delete cache`, item[idName]);
          cacheMap.delete(item[idName]);
        });
    }
  };
}