module.exports = function getCurrentUser (context) {
  const params = context.params || context;
  return (params.query && params.query.user) || (params.user && params.user.id);
};