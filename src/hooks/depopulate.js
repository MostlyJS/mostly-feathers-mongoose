import fp from 'ramda';

export default function depopulate (target, opts = { idField: 'id' }) {

  return function(hook) {
    let options = Object.assign({}, opts);

    function getDepopulated(item, target) {
      let field = fp.prop(target, item);
      if (field === undefined) return undefined;
      if (Array.isArray(field)) {
        field = fp.map((it) => it[options.idField] || it, field);
      } else if (field) {
        field = field[options.idField] || field;
      }
      return field? field : null;
    }

    function setTarget(data, target, value) {
      if (value !== undefined) {
        return fp.assocPath(target.split('.'), value, data);
      }
      return data;
    }

    if (hook.type === 'before') {
      hook.data = setTarget(hook.data, target, getDepopulated(hook.data, target));
    } else {
      if (hook.result) {
        if (hook.result.data) {
          hook.result.data = setTarget(hook.result.data, target, getDepopulated(hook.result.data, target));
        } else {
          hook.result = setTarget(hook.result, target, getDepopulated(hook.result, target));
        }
      }
    }
    return hook;
  };
}