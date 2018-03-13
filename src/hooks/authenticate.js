import assert from 'assert';
import { hooks as auth } from 'feathers-authentication';
import { NotAuthenticated } from 'feathers-errors';
import fp from 'mostly-func';

const verifyIdentity = auth.authenticate('jwt');

const defaultOptions = {
  anonymous: true,
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
    const anonymousToken = fp.path(['auth', 'local', 'anonymousToken'], opts);
    if (accessToken && anonymousToken && opts.anonymous && accessToken.startsWith(anonymousToken)) {
      // create an anonymous user with provided fake accessToken like 'anonymous:uuid'
      return context;
    } else {
      // verify and fetch user with $select fields
      const permissionField = opts.permissionField || fp.path(['auth', 'local', 'permissionField'], opts);
      if (permissionField) {
        context.params = fp.assign(context.params, {
          $auth: {
            query: { $select: permissionField }
          }
        });
      }
      return await verifyIdentity(context);
    }
  };
}
