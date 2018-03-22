import errors from 'feathers-errors';

export default function idAsCurrentUser (id) {
  return hook => {
    if (hook.id === id && hook.params.user) {
      if (hook.params.user && hook.params.user.id) {
        hook.id = hook.params.user.id;
      } else {
        throw new errors.GeneralError('authenticate payload is null');
      }
    }
    return hook;
  };
}
