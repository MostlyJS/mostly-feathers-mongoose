import fp from 'mostly-func';

/**
 * Add params to hook.params
 */
export default function addParams (params) {
  return hook => {
    if (hook.type !== 'before') {
      throw new Error(`The 'addParams' hook should only be used as a 'before' hook.`);
    }
    hook.params = fp.assignAll(hook.params, params);
    return hook;
  };
}
