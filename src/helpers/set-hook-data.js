const fp = require('mostly-func');

module.exports = function setHookData (context, items) {
  if (context.type === 'before') {
    context.data = items;
  } else {
    if (fp.hasProp('data', context.result)) {
      context.result.data = items;
    } else {
      context.result = items;
    }
  }
};
