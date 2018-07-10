const fp = require('mostly-func');

// get mongo id as string (object, mongo id, typed id)
const pathId = fp.curry((idField, obj) => {
  if (obj) {
    if (fp.is(String, obj)) {
      // whether a typed id
      if (obj.indexOf(':') > 0) {
        return fp.last(fp.split(':', obj));
      } else {
        return obj;
      }
    }
    if (fp.isObjectId(obj.toString())) return obj.toString();
    if (obj[idField]) return pathId(idField, obj[idField]);
  }
  return null;
});

module.exports = pathId;