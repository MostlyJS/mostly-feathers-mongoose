import fp from 'mostly-func';

/**
 * Add params to hook.params
 */
export default function addParams (params) {
  return async context => {
    if (context.type !== 'before') {
      throw new Error(`The 'addParams' hook should only be used as a 'before' hook.`);
    }
    context.params = fp.assignAll(context.params, params);
    return context;
  };
}
