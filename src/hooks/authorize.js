import { Forbidden } from 'feathers-errors';
import fp from 'mostly-func';
import { AceBuilder, Aces, toMongoQuery } from 'playing-permissions';
import { getHookDataAsArray } from '../helpers';

const defaultOptions = {
  idField: 'id',
  TypeKey: 'type',
  parent: { field: 'parent' },
  ancestors: { field: 'parent', service: null },
  inherited: { field: 'inherited' }
};

function getPermissions (user) {
  if (user) {
    const groupPermissions = fp.flatMap(fp.pathOr([], ['group', 'permissions']), user.groups || []);
    return fp.concat(groupPermissions, user.permissions || []);
  }
  return [];
}

function defineAcesFor (permissions, { TypeKey = 'type' }) {
  const builder = new AceBuilder();

  for (const permission of permissions) {
    builder.allow(permission);
  }

  return new Aces(builder.rules, { TypeKey });
}

export default function authorize (name = null, opts = {}) {
  opts = fp.assign({}, defaultOptions, opts);
  const TypeKey = opts.TypeKey;

  return async function (context) {
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

    const getAncestors = async (id) => {
      const svcResource = opts.ancestors.service?
        context.app.service(opts.ancestors.service) : context.service;
      const resource = await svcResource.get(id, {
        query: { $select: `${opts.ancestors.field},*` }
      });
      if (resource[opts.ancestors.field]) {
        return fp.concat(resource.ancestors, [fp.dissoc(opts.ancestors.field, resource)]);
      } else {
        return [resource];
      }
    };

    const throwDisallowed = (action, resources) => {
      let disallow = true;
      // reverse loop to check by inheritance
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
      // get the parent for checking permissions
      if (context.data[opts.parent.field]) {
        const ancestors = await getAncestors(context.data[opts.parent.field], opts.ancestors);
        context.data[opts.inherited.field] = true;
        throwDisallowed('create', fp.concat(ancestors, [context.data]));
      } else {
        throwDisallowed('create', [context.data]);
      }
    }
    // find, multi update/patch/remove
    else if (!context.id) {
      const rules = userAces.rulesFor(action, serviceName);
      const query = toMongoQuery(rules);

      if (query) {
        params.query = fp.assign(params.query, query);
      } else {
        context.result = {
          message: 'No data found for your account permissions',
          metadata: {
            total: 0,
            limit: context.params.query.$limit || 10,
            skip: context.params.query.$skip || 0,
          },
          data: []
        };
      }

      context.params = params;
      return context;
    }
    // get, update, patch, remove, action
    else { 
      // get the resource with ancestors for checking permissions
      const resources = await getAncestors(context.id, opts.ancestors);
      throwDisallowed(action, resources);

      return context;
    }
  };
}
