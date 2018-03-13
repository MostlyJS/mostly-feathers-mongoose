import { Forbidden } from 'feathers-errors';
import fp from 'mostly-func';
import { AceBuilder, Aces, toMongoQuery } from 'playing-permissions';
import { getHookDataAsArray } from '../helpers';

function defineAcesFor(user, { TypeKey = 'type' }) {
  const builder = new AceBuilder();

  for (const permission of user.permissions || []) {
    builder.allow(permission);
  }

  return new Aces(builder.rules, { TypeKey });
}

export default function authorize(name = null, opts) {
  const TypeKey = opts.TypeKey || 'type';

  return async function(context) {
    if (context.type !== 'before') {
      throw new Error(`The 'authorize' hook should only be used as a 'before' hook.`);
    }

    let params = fp.assign({ query: {} }, context.params);

    // If it was an internal call then skip this hook
    if (!params.provider) return context;

    const action = params.__action || context.method;
    const serviceName = name || context.path;

    const aces = defineAcesFor(params.user, { TypeKey });
    const throwDisallowed = (action, data) => {
      const resource = fp.assoc(TypeKey, data[TypeKey] || serviceName, data);
      if (aces.disallow(action, resource)) {
        throw new Forbidden(`You are not allowed to ${action} ${resource.id || context.id || context.path}`)
      }
    };

    if (context.method === 'create') {
      throwDisallowed('create', context.data);
    }

     // find, multi update/patch/remove
    if (!context.id) {
      const rules = aces.rulesFor(action, serviceName);
      const query = toMongoQuery(rules);

      if (query) {
        params.query = fp.assign(params.query, query);
      } else {
        params.query.$limit = 0; // TODO skip the mongoose query
      }

      context.params = params;
      return context;
    }
    // get, update, patch, remove, action
    else { 
      // get the resource by id for checking permissions
      const resource = await context.service.get(context.id);

      throwDisallowed(action, resource);

      return context;
    }
  };
}
