import mongoose from 'mongoose';

export default function(schema) {

  if (!schema.get('ACL')) {
    schema.add({ ACL: 'Mixed' });
  }

  schema.methods.setPublicReadAccess = function(bool) {
    this.ACL = this.ACL || {};
    this.ACL['*'] = { 'Read': bool };
    return this.save();
  };

  schema.methods.setWriteAccess = function(user, bool) {
    this.ACL = this.ACL || {};
    this.ACL[user] = { 'Write': bool };
    return this.save();
  };
}