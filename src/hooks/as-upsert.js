import makeDebug from 'debug';

const debug = makeDebug('mostly:feathers-mongoose:hooks:as-upsert');

// do an upsert instead of a create
export default function asUpsert (upsertQuery) {
  if (typeof upsertQuery !== 'function') {
    throw new Error('You need to provide a upsertQuery function');
  }

  return async context => {
    const { service, data, params } = context;

    params.mongoose = Object.assign({}, params.mongoose, { upsert: true });
    params.query = upsertQuery(context);

    context.result = await service.patch(null, data, params);

    return context;
  };
}