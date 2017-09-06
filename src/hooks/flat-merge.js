import errors from 'feathers-errors';
import fp from 'mostly-func';
import mongose from 'mongoose';

export default function flatMerge(field, opts = { idField: 'id' }) {

  return hook => {
    let options = Object.assign({}, opts);
    
    if (hook.type !== 'after') {
      throw new errors.GeneralError('Can not merge on before hook.');
    }

    const getData = function (value) {
      const data = fp.path(field.split('.'), value);
      if (Array.isArray(data)) {
        throw new errors.GeneralError('Cannot merge with array field');
      }
      return data;
    };

    const setData = function (data, value) {
      if (value !== undefined && !mongose.Types.ObjectId.isValid(value)) {
        return fp.dissocPath(field.split('.'), fp.merge(data, value));
      }
      return fp.dissocPath(field.split('.'), fp.merge(data, { [options.idField]: value }));
    };

    const mergeData = function(data) {
      if (Array.isArray(data)) {
        return fp.map(item => setData(item, getData(item)), data);
      } else {
        return setData(data, getData(data));
      }
    };

    if (hook.result) {
      if (hook.result.data) {
        hook.result.data = mergeData(hook.result.data);
      } else {
        hook.result = mergeData(hook.result);
      }
    }
    return hook;
  };
}