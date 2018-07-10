const fp = require('mostly-func');

module.exports = function getHookData (context) {
  const items = context.type === 'before'? context.data : context.result;
  return fp.propOf('data', items);
};