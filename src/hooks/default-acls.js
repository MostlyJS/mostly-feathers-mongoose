const assert = require('assert');
const mongoose = require('mongoose');
const fp = require('mostly-func');

module.exports = function defaultAcls (policy, permission, opts) {
  assert(policy !== undefined, 'defaultAcls policy not provided');
  assert(permission !== undefined, 'defaultAcls permission not provided');

  return async context => {
    let options = Object.assign({}, opts);

    if (context.type !== 'before') {
      throw new Error(`The 'defaultAcls' hook should only be used as a 'before' hook.`);
    }

    const getACLs = async function (names) {
      const nameToIds = names.map(name => {
        if (mongoose.Types.ObjectId.isValid(name)) {
          return Promise.resolve(name);
        } else {
          return context.app.service(options.service).get(null, {
            query: { [options.field] : name }
          }).then(obj => obj.id);
        }
      });
      const ids = await Promise.all(nameToIds);
      return fp.reduce((acc, id) => {
        acc[id] = {
          permission: permission,
          granted: true,
          begin: options.begin,
          end: options.end
        };
        return acc;
      }, {}, ids || []);
    };

    if (context.data) {
      let promiseACLs = Promise.resolve({});
      switch (policy) {
        case 'restrictToOwner':
          promiseACLs = getACLs([context.params.user.id]);
          break;
        case 'restrictToGroups':
          assert(options.groups && Array.isArray(options.groups), 'defaultAcls groups not provided');
          assert(options.service && options.field, 'defaultAcls service and field not provided');
          promiseACLs = getACLs(options.groups);
          break;
        case 'restrictToRoles':
          assert(options.roles && Array.isArray(options.roles), 'defaultAcls roles not provided');
          assert(options.service && options.field, 'defaultAcls service and field not provided');
          promiseACLs = getACLs(options.roles);
          break;
        case 'restrictToPublic':
          promiseACLs = Promise.resolve({
            '*': {
              permission: permission,
              granted: true
            }
          });
          break;
        case 'inheriteParent':
          promiseACLs = Promise.resolve({
            '*': {
              inherited: permission
            }
          });
          break;
        default:
          throw new Error('Unkown defaultAcls policy ' + policy);
      }
      const acls = await promiseACLs;
      context.data.ACL = Object.assign({}, context.data.ACL || {}, acls);
    }
    return context;
  };
};