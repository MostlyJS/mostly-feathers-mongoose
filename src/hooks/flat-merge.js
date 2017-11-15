import errors from 'feathers-errors';
import fp from 'mostly-func';
import mongose from 'mongoose';
import { isSelected, splitHead } from '../helpers';

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
      if (value === undefined) return data;
      const mergeData = (data, value) => {
        const path = field.split('.');
        // merge deep left except the id
        let merged = fp.mergeDeepWithKey((k, l, r) => {
          return (k === 'id')? r : l;
        }, data, value);
        if (!fp.path(path, value)) {
          return fp.dissocPath(path, merged);
        } else {
          return merged;
        }
      };
      if (!mongose.Types.ObjectId.isValid(value)) {
        return mergeData(data, value);
      } else {
        return mergeData(data, { [options.idField]: value });
      }
    };

    const mergeData = function(data) {
      if (Array.isArray(data)) {
        let results = fp.map(item => setData(item, getData(item)), data);
        if (results && options.sort) {
          results = fp.sortBy(fp.prop(options.sort), results);
        }
        return results;
      } else {
        return setData(data, getData(data));
      }
    };

    // each field should have its own params
    let params = fp.assign({ query: {} }, hook.params);

    // target must be specified by $select to merge
    if (!isSelected(field, params.query.$select)) return hook;

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