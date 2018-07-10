const fp = require('mostly-func');

module.exports = function convertMongoId (id) {
  if (id && fp.isObjectId(id.toString())) {
    return id.toString();
  } else {
    return Array.isArray(id)? fp.map(convertMongoId, id) : id;
  }
};