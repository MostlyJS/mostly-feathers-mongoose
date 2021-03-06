const { get } = require('lodash');
const makeDebug = require('debug');
const fp = require('mostly-func');

const { getId } = require('../helpers');

const debug = makeDebug('mostly:feathers-mongoose:hooks:cascade-update');

module.exports = function cascadeUpdate (target, opts) {
  if (!opts.service) {
    throw new Error('You need to provide a service');
  }

  var field = opts.field;

  return async context => {
    let options = Object.assign({}, opts);

    if (context.type !== 'after') {
      throw new Error(`The 'cascadeUpdate' hook should only be used as a 'after' hook.`);
    }

    let data = fp.propOf('data', context.result);
    if (field && data) {
      let foreignField = get(data, target);
      if (data.id && foreignField) {
        const service = context.app.service(options.service);
        if (!service) {
          throw new Error("No such service: " + options.service);
        }

        let foreignId = getId(foreignField);
        await service.patch(foreignId, {
          [field]: options.value !== undefined? options.value : data.id.toString()
        });
      } else {
        debug('Skip hook cascadeUpdate, nothing to run', target, field, data);
      }
    }
    return context;
  };
};