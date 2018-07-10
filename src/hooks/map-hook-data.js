const errors = require('feathers-errors');
const fp = require('mostly-func');
const { getHookData, setHookData } = require('../helpers');

module.exports = function mapHookData (func) {
  if (!func || typeof func !== 'function') {
    throw new errors.BadRequest('Function required. (alter)');
  }

  return async context => {
    let items = getHookData(context);
    if (items) {
      if (Array.isArray(items)) {
        items = fp.mapIndexed((item, index) => func(item, context), items);
      } else {
        items = func(items, context);
      }
      setHookData(context, items);
    }
    return context;
  };
};