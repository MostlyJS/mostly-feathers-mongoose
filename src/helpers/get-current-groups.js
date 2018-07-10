const fp = require('mostly-func');

const getCurrentGroups = (path = ['id']) => (context) => {
  const groups = context.params.query.groups || (context.params.user && context.params.user.groups);
  return groups && fp.map(fp.pathOf(path), groups);
};

module.exports = getCurrentGroups;