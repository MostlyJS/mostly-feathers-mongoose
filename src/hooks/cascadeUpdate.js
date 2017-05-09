import { get } from 'lodash';
import makeDebug from 'debug';

const debug = makeDebug('mostly:feathers-mongoose:hooks:cascadeUpdate');

export function cascadeUpdate(target, options) {
  options = Object.assign({}, options);

  if (!options.service) {
    throw new Error('You need to provide a service');
  }

  var field = options.field;

  return function(hook) {
    if (hook.type !== 'after') {
      throw new Error(`The 'cascadeUpdate' hook should only be used as a 'after' hook.`);
    }

    let data = hook.result.data || hook.result;
    if (field && data) {
      let foreignField = get(data, target);
      if (data.id && foreignField) {
        const service = hook.app.service(options.service);
        if (!service) {
          throw new Error("No such service: " + options.service);
        }
        
        let foreignId = foreignField.id || foreignField;
        return service.patch(foreignId.toString(), {
          [field]: options.value !== undefined? options.value : data.id.toString()
        }).then(() => {
          return hook;
        });
      } else {
        debug('Skip hook cascadeUpdate, nothing to run', target, field, data);
      }
    }
    return hook;
  };
}
