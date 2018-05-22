import fp from 'mostly-func';

// custom response
export default function responder () {
  return async context => {
    // If it was an internal call then skip this hook
    if (!context.params.provider) {
      return context;
    }

    let metadata = {};
    let data = context.result;
    let message = '';

    if (fp.hasProp('data', context.result)) {
      metadata = context.result.metadata || fp.omit(['data'], context.result);
      data = context.result.data;
      message = context.result.message || '';
    }

    context.result = {
      status: 0,
      message: message,
      metadata: metadata,
      errors: [],
      data: data
    };
    return context;
  };
}
