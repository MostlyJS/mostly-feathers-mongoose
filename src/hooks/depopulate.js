import assert from 'assert';
import fp from 'mostly-func';
import { get, set, map } from 'lodash';
import { getField, setField } from '../helpers';

export default function depopulate (target, opts = { idField: 'id' }) {
  assert(target, 'target is empty');

  return async context => {
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

    if (context.type === 'before') {
      context.data = depopulated(context.data, target);
    } else {
      if (context.result) {
        if (fp.hasProp('data', context.result)) {
          context.result.data = depopulated(context.result.data, target);
        } else {
          context.result = depopulated(context.result, target);
        }
      }
    }
    return context;
  };
}