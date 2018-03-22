import assert from 'assert';
import fp from 'mostly-func';
import { get, set, map } from 'lodash';
import { getField, setField } from '../helpers';

export default function depopulate (target, opts = { idField: 'id' }) {
  assert(target, 'target is empty');

  return function (hook) {
    let options = Object.assign({}, opts);

    const depopulated = function (data, target) {
      const fields = target.split('.');
      const init = fp.init(fields).join('.'), last = fp.last(fields);
      let value = init? get(data, init) : data;
      if (Array.isArray(value)) {
        value = fp.map(it => {
          if (it[last]) {
            it[last] = it[last][options.idField] || it[last];
          }
          return it;
        }, value);
      } else if (value[last]) {
        value[last] = value[last][options.idField] || value[last];
      }
      return data;
    };

    if (hook.type === 'before') {
      hook.data = depopulated(hook.data, target);
    } else {
      if (hook.result) {
        if (hook.result.data) {
          hook.result.data = depopulated(hook.result.data, target);
        } else {
          hook.result = depopulated(hook.result, target);
        }
      }
    }
    return hook;
  };
}