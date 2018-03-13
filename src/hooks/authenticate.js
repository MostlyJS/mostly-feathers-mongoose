import assert from 'assert';
import { hooks as auth } from 'feathers-authentication';
import { NotAuthenticated } from 'feathers-errors';
import fp from 'mostly-func';

const verifyIdentity = auth.authenticate('jwt');

const defaultOptions = {
  anonymous: 'anonymous',
  retained: false // retain existing field when populate as path
};

function getAccessToken(hook) {
  return fp.path(['headers', 'authorization'], hook.params) ||
         fp.path(['accessToken'], hook.data);
}

export default function authenticate(strategies, opts = {}) {
  opts = fp.assign(defaultOptions, opts);
  assert(strategies, "The 'authenticate' hook requires one of your registered passport strategies.");

  return async function(context) {
    const accessToken = getAccessToken(context);
    if (accessToken && accessToken.startsWith(opts.anonymous)) {
      // create an anonymous user with provided fake accessToken like 'anonymous:uuid'
      return context;
    } else {
      // verify and fetch user with $select fields
      if (opts.$select) {
        context.params = fp.assign(context.params, {
          $auth: {
            query: { $select: opts.$select }
          }
        });
      }
      return await verifyIdentity(context);
    }
  };
}
