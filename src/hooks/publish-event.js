import { flatten, keyBy, mapValues } from 'lodash';
import { getField, setFieldByKey } from '../helpers';

const defaultOptions = {
  prefix: 'feathers'
};

export default function publishEvent (name, opts) {
  opts = Object.assign({}, defaultOptions, opts);
  const topic = `${opts.prefix}.events`;

  return function (hook) {
    let options = Object.assign({}, opts);

    if (hook.type !== 'after') {
      throw new Error(`The 'publishEvent' hook should only be used as a 'after' hook.`);
    }
    
    const trans = hook.app.trans;
    const publish = function (event) {
      trans.act({
        pubsub$: true,
        topic,
        cmd: name,
        event
      });
    };

    let data = [].concat(hook.result && hook.result.data || hook.result);
    data.map(publish);

    return hook;
  };
}