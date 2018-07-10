const fp = require('mostly-func');
const { checkContextIf } = require('feathers-hooks-common');
const { getHookData, setHookData } = require('../helpers');

module.exports = function discardFields (...fieldNames) {
  return async context => {
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
};