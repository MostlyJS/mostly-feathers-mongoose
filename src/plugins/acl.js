import mongoose from 'mongoose';

export default function(schema) {

  if (!schema.get('ACL')) {
    schema.add({ ACL: 'Mixed' });
  }

  schema.methods.setPublicReadAccess = function(bool) {
    this.ACL = this.ACL || {};
    this.ACL['*'] = { permission: 'Read', granted: bool };
    return this.save();
  };

  schema.methods.setWriteAccess = function(user, bool) {
    this.ACL = this.ACL || {};
    this.ACL[user] = { permission: 'ReadWrite', granted: bool };
    return this.save();
  };
}