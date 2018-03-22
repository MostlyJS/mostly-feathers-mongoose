import fp from 'mostly-func';

/**
 * Add query to hook.params.query
 */
export default function addQuery (query) {
  return hook => {
    if (hook.type !== 'before') {
      throw new Error(`The 'addQuery' hook should only be used as a 'before' hook.`);
    }
    hook.params = hook.params || {};
    hook.params.query = hook.params.query || {};
    hook.params = fp.mergeDeepWithKey((k, l, r) => {
      if (k === '$select' && l) {
        return fp.is(String, l)? [k, l].join(',') : fp.concat(l, r); // join or concat
      }
      return fp.is(Array, l)? fp.concat(l, r) : r; // concat or overwrite
    }, hook.params, { query });
    return hook;
  };
}
