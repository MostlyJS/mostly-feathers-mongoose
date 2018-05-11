import fp from 'mostly-func';

const defaultOptions = {
  field: 'primary',
  select: '*'
};

/**
 * Add route service object to hook.params
 */
export default function addRouteObject (name, opts) {
  opts = Object.assign({}, defaultOptions, opts);

  return async context => {
    let options = Object.assign({}, opts);

    if (context.type !== 'before') {
      throw new Error(`The 'addRouteObject' hook should only be used as a 'before' hook.`);
    }

    if (!options.service || !options.field) {
      throw new Error('You need to provide a service and a field');
    }

    context.params = context.params || {};
    const primary = options.field === 'id'? context.id : context.params[options.field];
    if (!primary) {
      throw new Error(`No primary service id found in the context params`);
    }

    if (!context.params[name]) {
      try {
        const service = context.app.service(options.service);
        const object = await service.get(primary, {
          query: { $select: opts.select },
          user: context.params.user
        });
        if (!object) {
          throw new Error(`Not found primary service object ${name} of ${primary}`);
        }
        context.params = fp.assoc(name, object, context.params);
      } catch (err) {
        throw new Error(`Not found primary service object ${name}: ` + err.message);
      }
    }
    return context;
  };
}
