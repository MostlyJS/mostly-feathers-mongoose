const { errors } = require('feathers-errors');

module.exports = function isAction (...actions) {
  if (!actions.length) {
    throw new errors.MethodNotAllowed('Calling iff() predicate incorrectly. (isAction)');
  }

  return async context => {
    const hookAction = (context.params || {}).action;
    return actions.some(action => action === hookAction);
  };
};