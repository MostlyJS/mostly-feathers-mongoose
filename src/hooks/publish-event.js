const fp = require('mostly-func');
const { getHookDataAsArray } = require('../helpers');

const defaultOptions = {
  prefix: 'feathers'
};

module.exports = function publishEvent (name, opts) {
  opts = Object.assign({}, defaultOptions, opts);
  const topic = `${opts.prefix}.events`;

  return async context => {
    let options = Object.assign({}, opts);

    if (context.type !== 'after') {
      throw new Error(`The 'publishEvent' hook should only be used as a 'after' hook.`);
    }

    const trans = context.app.trans;
    const publish = function (event) {
      trans.act({
        pubsub$: true,
        topic,
        cmd: name,
        event
      });
    };

    const data = getHookDataAsArray(context);
    fp.map(publish, data);

    return context;
  };
};