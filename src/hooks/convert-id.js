const { flatten, keyBy, mapValues } = require('lodash');
const { getField, setFieldByKey } = require('../helpers');

module.exports = function convertId (target, opts) {
  if (!opts.service) {
    throw new Error('You need to provide a service');
  }

  var field = opts.field;

  return async context => {
    let options = Object.assign({}, opts);

    if (context.type !== 'before') {
      throw new Error(`The 'convertId' hook should only be used as a 'before' hook.`);
    }
    
    if (field && context.data) {
      const values = getField(context.data, target);
      if (values) {
        const service = context.app.service(options.service);
        if (!service) {
          throw new Error("No such service: " + options.service);
        }
        
        let params = {};
        params.query = { [field]: { $in: flatten(values) } };
        params.paginate = false;
        const result = await service.find(params);
        const dataByKey = mapValues(keyBy(result, field), 'id');
        context.data = setFieldByKey(context.data, target, dataByKey);
      }
    }
    return context;
  };
};