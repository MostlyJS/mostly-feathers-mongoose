const assert = require('assert');
const { hooks: auth } = require('feathers-authentication');
const fp = require('mostly-func');

const defaultOptions = {
  anonymous: true,
};

function getAccessToken (hook) {
  return fp.path(['headers', 'authorization'], hook.params) ||
         fp.path(['accessToken'], hook.data);
}

module.exports = function authenticate (strategies, opts = {}, fields) {
  opts = fp.assignAll(defaultOptions, opts);
  assert(strategies, "The 'authenticate' hook requires one of your registered passport strategies.");

  const verifyIdentity = auth.authenticate(strategies);

  return async context => {
    const accessToken = getAccessToken(context);
    // verify and fetch user with $select fields
    const select = fp.reject(fp.isNil, [fields, opts.local && opts.local.fields]).join(',');
    if (select) {
      context.params.$auth = {
        query: { $select: select }
      };
    }
    return await verifyIdentity(context);
  };
};
