import { flatten, keyBy, mapValues } from 'lodash';
import { getField, setFieldByKey } from '../helpers';

export function convertId(target, options) {
  options = Object.assign({}, options);

  if (!options.service) {
    throw new Error('You need to provide a service');
  }

  var field = options.field;

  return function(hook) {

    if (hook.type !== 'before') {
      throw new Error(`The 'convertId' hook should only be used as a 'before' hook.`);
    }
    
    let data = hook.data;
    if (field && data) {
      let values = getField(data, target);
      if (values) {
        const service = hook.app.service(options.service);
        if (!service) {
          throw new Error("No such service: " + options.service);
        }
        
        let params = {};
        params.query = { [field]: { $in: flatten(values) } };
        params.paginate = false;
        return service.find(params).then(result => {
          let dataByKey = mapValues(keyBy(result, field), 'id');
          hook.data = setFieldByKey(data, target, dataByKey);
          return hook;
        });
      }
    }
    return hook;
  };
}