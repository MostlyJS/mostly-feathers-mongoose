import Entity from 'mostly-entity';
import fp from 'mostly-func';

// 返回值定制
export default function responder() {
  return function(hook) {
    // If it was an internal call then skip this hook
    if (!hook.params.provider) {
      return hook;
    }

    let metadata = {};
    let data = hook.result;

    if (hook.result && hook.result.data) {
      metadata = hook.result.metadata || fp.omit(['data'], hook.result);
      data = hook.result.data;
    }

    hook.result = {
      status: 0,
      message: '',
      metadata: metadata,
      errors: [],
      data: data
    };
    return hook;
  };
}
