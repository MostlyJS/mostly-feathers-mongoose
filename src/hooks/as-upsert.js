import makeDebug from 'debug';

const debug = makeDebug('mostly:feathers-mongoose:hooks:as-upsert');

// do an upsert instead of a create
export function asUpsert(upsertQuery) {
  if (typeof upsertQuery !== 'function') {
    throw new Error('You need to provide a upsertQuery function');
  }

  return function (hook) {
    const { service, data, params } = hook;

    params.mongoose = Object.assign({}, params.mongoose, { upsert: true });
    params.query = upsertQuery(hook);

    return service.patch(null, data, params).then(result => {
      hook.result = result;
      return hook;
    });
  };
}