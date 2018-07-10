module.exports = function filterField (field, preset) {
  return async context => {
    // If it was an internal call then skip this hook
    if (!context.params.provider) return context;

    if(!Array.isArray(preset)) {
      preset = [preset];
    }

    if (context.params.query && !context.params.query[field]) {
      context.params.query[field] = { $in: preset };
    }

    return context;
  };
};