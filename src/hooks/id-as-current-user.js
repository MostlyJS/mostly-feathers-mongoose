const errors = require('feathers-errors');

module.exports = function idAsCurrentUser (id) {
  return async context => {
    if (context.id === id && context.params.user) {
      if (context.params.user && context.params.user.id) {
        context.id = context.params.user.id;
      } else {
        throw new errors.GeneralError('authenticate payload is null');
      }
    }
    return context;
  };
};