import assert from 'assert';
import fp from 'mostly-func';

export default function prefixSelect(target, opts = { excepts: [] }) {
  assert(target, 'select target not provided.');
  const excepts = [target, '*'].concat(opts.excepts || []);

  return hook => {
    hook.params.query = hook.params.query || {};

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

    hook.params.query.$select = [target, '*'].concat(select);

    return hook;
  };
}
