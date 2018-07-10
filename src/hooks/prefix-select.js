const assert = require('assert');
const fp = require('mostly-func');

/**
 * prefix the $select with target excepts provided fields,
 * used for populating with absolute type path
 */
module.exports = function prefixSelect (target, opts = { excepts: [] }) {
  assert(target, 'select target not provided.');

  return async context => {
    context.params.query = context.params.query || {};

    let excepts = [target, '*'].concat(opts.excepts || []);
    const schemas = context.service.Model.schema && context.service.Model.schema.paths;
    if (schemas) {
      excepts = excepts.concat(Object.keys(schemas));
    }
    let select = context.params.query.$select || [];
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

    context.params.query.$select = fp.uniq([target, '*'].concat(select));

    return context;
  };
};