import { Forbidden } from 'feathers-errors';
import fp from 'mostly-func';
import { AceBuilder, Aces, toMongoQuery } from 'playing-permissions';
import { getHookDataAsArray } from '../helpers';

function getPermissions(user) {
  if (user) {
    const groupPermissions = fp.flatMap(fp.path(['group', 'permissions']), user.groups || []);
    return fp.concat(groupPermissions, user.permissions || []);
  }
  return [];
}

function defineAcesFor(permissions, { TypeKey = 'type' }) {
  const builder = new AceBuilder();

  for (const permission of permissions) {
    builder.allow(permission);
  }

  return new Aces(builder.rules, { TypeKey });
}

export default function authorize(name = null, opts = {}) {
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

    const userPermissions = getPermissions(params.user);
    const userAces = defineAcesFor(userPermissions , { TypeKey });

    const throwDisallowed = (action, resources) => {
      let disallow = true;
      // reverse loop to check inheritance
      for (let i = resources.length - 1; i >= 0; i--) {
        if (!resources[i]) break;
        const resource = fp.assoc(TypeKey, resources[i][TypeKey] || serviceName, resources[i]);
        disallow = disallow && userAces.disallow(action, resource);
        if (!resource.inherited) break;
      }
      if (disallow) {
        throw new Forbidden(`You are not allowed to ${action} ${resources[0] && resources[0].id}, with ${context.path}/${context.id}`);
      }
    };

    if (context.method === 'create') {
      throwDisallowed('create', [context.data]);
    }

     // find, multi update/patch/remove
    if (!context.id) {
      const rules = userAces.rulesFor(action, serviceName);
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
      const resource = await context.service.get(context.id, {
        query: { $select: 'ancestors,*' }
      });
      throwDisallowed(action, fp.concat(resource && resource.ancestors || [], [resource]));

      return context;
    }
  };
}
