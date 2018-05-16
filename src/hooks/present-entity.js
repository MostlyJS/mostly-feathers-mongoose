import assert from 'assert';

export default function presentEntity (entity, options = {}) {
  assert(entity && entity.parse, 'Must be a valid Entity: ' + entity);

  return async context => {
    options.provider = context.params.provider;
    
    if (context.result) {
      if (context.result.data) {
        context.result.data = entity.parse(context.result.data, options);
      } else {
        context.result = entity.parse(context.result, options);
      }
    }
    return context;
  };
}
