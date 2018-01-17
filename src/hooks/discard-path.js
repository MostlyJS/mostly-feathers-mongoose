import fp from 'mostly-func';
import { checkContextIf } from 'feathers-hooks-common';
import { getHookData, setHookData } from './helpers';

export default function discardPath (...fieldNames) {
  return context => {
    checkContextIf(context, 'before', ['create', 'update', 'patch'], 'discard');

    let items = getHookData(context);
    if (items) {
      if (Array.isArray(items)) {
        items = fp.map(item => fp.dissocPaths(fieldNames, item), items);
      } else {
        items = fp.dissocPaths(fieldNames, items);
      }
      setHookData(context, items);
    }
    return context;
  };
}