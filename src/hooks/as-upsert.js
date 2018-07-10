// do an upsert instead of a create
module.exports = function asUpsert (upsertQuery) {
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
};