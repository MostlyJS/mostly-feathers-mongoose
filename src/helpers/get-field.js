const fp = require('mostly-func');

// get field by path, supporting `array.field`
module.exports = function getField (item, field) {
  let parts = field.split('.');
  let value = item, part;
  while (parts.length) {
    part = parts.shift();
    if (Array.isArray(value)) {
      value = fp.pipe(
        fp.map(fp.prop(part)),
        fp.reject(fp.isNil),
        fp.flatten
      )(value);
    } else {
      value = value? value[part] : null;
    }
  }

  return Array.isArray(value)? fp.filter(fp.identity, value) : value;
};