import assert from 'assert';
import fp from 'mostly-func';

export default function prefixSelect(target, opts = { excepts: [] }) {
  assert(target, 'select target not provided.');

  return hook => {
    hook.params.query = hook.params.query || {};

    let excepts = [target, '*'].concat(opts.excepts || []);
    const schemas = hook.service.Model.schema && hook.service.Model.schema.paths;
    if (schemas) {
      excepts = excepts.concat(Object.keys(schemas));
    }
    let select = hook.params.query.$select || [];
    if (select.length) {
      if (fp.is(String, select)) {
        // convert string $select to array
        select = fp.map(fp.trim, fp.split(',', select));
      }
      select = select.map(field => {
        const excepted = excepts.some(except => field.startsWith(except));
        return excepted? field : target + '.'  + field;
      });
    }

    hook.params.query.$select = fp.uniq([target, '*'].concat(select));

    return hook;
  };
}
