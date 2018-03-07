import { get } from 'lodash';
import makeDebug from 'debug';
import { getId } from '../helpers';

const debug = makeDebug('mostly:feathers-mongoose:hooks:cascade-update');

export default function cascadeUpdate(target, opts) {
  if (!opts.service) {
    throw new Error('You need to provide a service');
  }

  var field = opts.field;

  return function (hook) {
    let options = Object.assign({}, opts);

    if (hook.type !== 'after') {
      throw new Error(`The 'cascadeUpdate' hook should only be used as a 'after' hook.`);
    }

    let data = hook.result && hook.result.data || hook.result;
    if (field && data) {
      let foreignField = get(data, target);
      if (data.id && foreignField) {
        const service = hook.app.service(options.service);
        if (!service) {
          throw new Error("No such service: " + options.service);
        }

        let foreignId = getId(foreignField);
        return service.patch(foreignId, {
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
