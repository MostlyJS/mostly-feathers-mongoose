import assert from 'assert';

export default function presentEntity(entity, options = {}) {
  assert(entity && entity.parse, 'Must be a valid Entity: ' + entity);

  return function(hook) {
    options.provider = hook.params.provider;
    
    if (hook.result) {
      if (hook.result.data) {
        hook.result.data = entity.parse(hook.result.data, options);
      } else {
        hook.result = entity.parse(hook.result, options);
      }
    }
    return hook;
  };
}
