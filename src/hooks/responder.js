import fp from 'mostly-func';

// 返回值定制
export default function responder () {
  return function (hook) {
    // If it was an internal call then skip this hook
    if (!hook.params.provider) {
      return hook;
    }

    let metadata = {};
    let data = hook.result;
    let message = '';

    if (hook.result && hook.result.data) {
      metadata = hook.result.metadata || fp.omit(['data'], hook.result);
      data = hook.result.data;
      message = hook.result.message || '';
    }

    hook.result = {
      status: 0,
      message: message,
      metadata: metadata,
      errors: [],
      data: data
    };
    return hook;
  };
}
