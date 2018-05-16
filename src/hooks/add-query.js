import fp from 'mostly-func';

/**
 * Add query to hook.params.query
 */
export default function addQuery (query) {
  return async context => {
    if (context.type !== 'before') {
      throw new Error(`The 'addQuery' hook should only be used as a 'before' hook.`);
    }
    context.params = context.params || {};
    context.params.query = context.params.query || {};
    context.params = fp.mergeDeepWithKey((k, l, r) => {
      if (k === '$select' && l) {
        return fp.is(String, l)? [k, l].join(',') : fp.concat(l, r); // join or concat
      }
      return fp.isArray(l)? fp.concat(l, r) : r; // concat or overwrite
    }, context.params, { query });
    return context;
  };
}
