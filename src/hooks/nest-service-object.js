import fp from 'mostly-func';

const defaultOptions = {
  field: 'sid',
  select: '*'
};

/**
 * Add nest service object to hook.params
 */
export default function nestServiceObject (name, opts) {
  opts = Object.assign({}, defaultOptions, opts);

  return async context => {
    let options = Object.assign({}, opts);

    if (context.type !== 'before') {
      throw new Error(`The 'addQuery' hook should only be used as a 'before' hook.`);
    }

    if (!options.service || !options.field) {
      throw new Error('You need to provide a service and a field');
    }

    context.params = context.params || {};
    const sid = context.params[options.field];
    if (!sid) {
      throw new Error(`No service id field ${options.field} found in the context params`);
    }

    const service = context.app.service(options.service);
    const object = await service.get(sid, { query: { $select: opts.select }});
    if (!object) {
      throw new Error(`Not found service object ${name} of ${sid}`);
    }
    context.params = fp.assoc(name, object, context.params);
    return context;
  };
}
