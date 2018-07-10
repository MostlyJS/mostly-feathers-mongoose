const fp = require('mostly-func');

const unsetIdv = function (obj) {
  if (obj && obj._id) {
    return fp.pipe(
      fp.assoc('id', String(obj.id || obj._id)),
      fp.dissoc('_id'),
      fp.dissoc('__v')
    )(obj);
  } else {
    return obj;
  }
};

const unsetObj = function (obj) {
  if (Array.isArray(obj)) {
    return fp.map(unsetIdv, obj);
  } else {
    return unsetIdv(obj);
  }
};

// transform the results
module.exports = function transform (results) {
  if (results) {
    if (fp.has('data', results)) {
      results.data = unsetObj(results.data);
    } else {
      results = unsetObj(results);
    }
  }
  return results;
};