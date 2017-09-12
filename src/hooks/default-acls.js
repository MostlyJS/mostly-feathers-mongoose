import assert from 'assert';
import mongoose from 'mongoose';
import fp from 'mostly-func';
import { plural } from 'pluralize';

export default function defaultAcls(policy, permission, opts) {
  assert(policy !== undefined, 'defaultAcls policy not provided');
  assert(permission !== undefined, 'defaultAcls permission not provided');

  return function(hook) {
    let options = Object.assign({}, opts);

    if (hook.type !== 'before') {
      throw new Error(`The 'defaultAcls' hook should only be used as a 'before' hook.`);
    }

    const getACLs = function(names) {
      const nameToIds = names.map(name => {
        if (mongoose.Types.ObjectId.isValid(name)) {
          return Promise.resolve(name);
        } else {
          return hook.app.service(options.service).action('first').find({ query: {
            [options.field] : name
          }}).then(obj => obj.id);
        }
      });
      return Promise.all(nameToIds).then(ids => {
        let aces = fp.reduce((acc, id) => {
          acc[id] = {
            permission: permission,
            granted: true,
            begin: options.begin,
            end: options.end
          };
          return acc;
        }, {}, ids || []);
        return aces;
      });
    };
    
    if (hook.data) {
      let promise = Promise.resolve({});
      switch (policy) {
        case 'restrictToOwner':
          promise = getACLs([hook.params.user.id]);
          break;
        case 'restrictToGroups':
          assert(options.groups && Array.isArray(options.groups), 'defaultAcls groups not provided');
          assert(options.service && options.field, 'defaultAcls service and field not provided');
          promise = getACLs(options.groups);
          break;
        case 'restrictToRoles':
          assert(options.roles && Array.isArray(options.roles), 'defaultAcls roles not provided');
          assert(options.service && options.field, 'defaultAcls service and field not provided');
          promise = getACLs(options.roles);
          break;
        case 'restrictToPublic':
          promise = Promise.resolve({
            '*': {
              permission: permission,
              granted: true
            }
          });
          break;
        case 'inheriteParent':
          promise = Promise.resolve({
            '*': {
              inherited: permission
            }
          });
          break;
        default:
          throw new Error('Unkown defaultAcls policy ' + policy);
      }
      return promise.then((acls) => {
        hook.data.ACL = Object.assign({}, hook.data.ACL || {}, acls);
        return hook;
      });
    }
    return hook;
  };
}