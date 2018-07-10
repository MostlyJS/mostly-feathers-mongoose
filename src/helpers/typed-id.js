module.exports = function typedId (obj) {
  return obj && obj.type? obj.type + ':' + obj.id : obj;
};