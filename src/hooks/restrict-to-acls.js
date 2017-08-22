import _ from 'lodash';
import errors from 'feathers-errors';
import makeDebug from 'debug';
import minimatch from 'minimatch';

const debug = makeDebug('mostly:feathers-mongoose:hooks:restrict-to-acls');

const defaults = {
  rolesField: 'roles',
  aclsField: 'acls',
  idField: 'id',
  ownerField: 'userId',
  owner: false
};

export function restrictToAcls(options = {}){
  if (!options.acls || !options.acls.length) {
    throw new Error(`You need to provide an array of 'acls' to check against.`);
  }

  return function(hook) {
    if (hook.type !== 'before') {
      throw new Error(`The 'restrictToRoles' hook should only be used as a 'before' hook.`);
    }

    // If it was an internal call then skip this hook
    if (!hook.params.provider) {
      return hook;
    }

    if (!hook.params.user) {
      debug('Auth user not populoated properly, check your hook chain!');
      throw new errors.NotAuthenticated();
    }

    options = Object.assign({}, defaults, hook.app.get('auth'), options);

    let authorized = false;
    let roles = hook.params.user[options.rolesField];
    const id = hook.params.user[options.idField];

    if (id === undefined) {
      throw new Error(`'${options.idField} is missing from current user.'`);
    }

    // If the user doesn't even have a `fieldName` field and we're not checking
    // to see if they own the requested resource return Forbidden error
    if (!options.owner && roles === undefined) {
      throw new errors.Forbidden('Permissions denied to access this.');
    }

    // If the roles is not an array, normalize it
    if (!Array.isArray(roles)) {
      roles = [roles];
    }
    let acls = _.reduce(roles, (result, role) => {
      return _.union(result, role[options.aclsField] || []);
    }, []);
    debug('user roles with acls', acls);

    // Iterate through all the roles the user may have and check
    // to see if any one of them is in the list of permitted roles.
    // authorized = acls.some(acl => options.acls.indexOf(acl) !== -1);
    authorized = acls.some(acl =>
      minimatch.match(options.acls, acl).length > 0
    );

    // If we should allow users that own the resource and they don't already have
    // the permitted roles check to see if they are the owner of the requested resource
    if (options.owner && !authorized) {
      if (!hook.id) {
        throw new errors.MethodNotAllowed(`The 'restrictToRoles' hook should only be used on the 'get', 'update', 'patch' and 'remove' service methods if you are using the 'owner' field.`);
      }

      // look up the document and throw a Forbidden error if the user is not an owner
      return new Promise((resolve, reject) => {
        // Set provider as undefined so we avoid an infinite loop if this hook is
        // set on the resource we are requesting.
        const params = Object.assign({}, hook.params, { provider: undefined });

        this.get(hook.id, params).then(data => {
          if (data.toJSON) {
            data = data.toJSON();
          }
          else if (data.toObject) {
            data = data.toObject();
          }

          let field = data[options.ownerField];

          // Handle nested Sequelize or Mongoose models
          if (_.isPlainObject(field)) {
            field = field[options.idField];
          }

          if ( field === undefined || field.toString() !== id.toString() ) {
            reject(new errors.Forbidden('You do not have the permissions to access this.'));
          }

          resolve(hook);
        }).catch(reject);
      });
    }

    if (!authorized) {
      throw new errors.Forbidden('Permissions denied to access this.');
    }
  };
}