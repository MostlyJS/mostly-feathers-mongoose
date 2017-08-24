import _ from 'lodash';

export default function filterField(field, preset) {
  return hook => {
    // If it was an internal call then skip this hook
    if (!hook.params.provider) {
      return hook;
    }

    if(!Array.isArray(preset)) {
      preset = [preset];
    }

    if (hook.params.query && !hook.params.query[field]) {
      hook.params.query[field] = { $in: preset };
    }

    return hook;
  };
}
