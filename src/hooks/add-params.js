const fp = require('mostly-func');

/**
 * Add params to hook.params
 */
module.exports = function addParams (params) {
  return async context => {
    if (context.type !== 'before') {
      throw new Error(`The 'addParams' hook should only be used as a 'before' hook.`);
    }
    context.params = fp.assignAll(context.params, params);
    return context;
  };
};
