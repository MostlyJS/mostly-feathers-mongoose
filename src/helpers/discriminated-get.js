const { plural } = require('pluralize');

// get the result = require(descriminated service
module.exports = function discriminatedGet (app, keyType, result, params) {
  if (result && result.type && result.type !== keyType) {
    return app.service(plural(result.type)).get(result.id, params);
  } else {
    return Promise.resolve(result);
  }
};