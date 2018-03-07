import _ from 'lodash';
import { getId } from '../helpers';

export default function filter(target, opts) {

  if (!opts.service) {
    throw new Error('You need to provide a service');
  }

  var field = opts.field || target;

  return function(hook) {
    let options = Object.assign({}, opts);
    
    if (hook.type !== 'before') {
      throw new Error(`The 'filter' hook should only be used as a 'before' hook.`);
    }
    
    let query = hook.params.query;
    let filters = _.get(query, field);

    if (filters) {
      // in case of multiple filters query of same field, order matters
      if (_.isArray(filters)) {
        filters = _.filter(filters, it => {
          return it.$filter || it;
        });
      } else if (_.isObject(filters)) {
        filters = _.map(Object.keys(filters), key => {
          return filters[key] !== true? { [key]: filters[key] } : key;
        });
      } else {
        filters = [filters];
      }

      const service = hook.app.service(options.service);
      if (!service) {
        throw new Error("No such service: " + options.service);
      }
      
      let promises = _.map(filters, (filterField) => {
        if (_.isObject(filterField.$filter)) {
          return service.find({
            query: filterField.$filter,
            paginate: false,
          });
        } else {
          return Promise.resolve(filterField);
        }
      });
      return Promise.all(promises).then((results) => {
        if (results) {
          let conditions = _.map(results, result => {
            if (_.isObject(result)) {
              return {
                $in: _.flatMap(result.data || result, (it) => {
                  return getId(it);
                })
              };
            } else {
              return result;
            }
          });
          if (conditions.length > 1) {
            conditions = _.map(conditions, cond => {
              return { [field]: cond };
            });
            let newQuery = _.omit(query, field);
            newQuery.$and = (query.$and || []).concat(conditions);
            hook.params.query = newQuery;
          } else {
            _.set(query, field, conditions.length > 0? conditions[0] : undefined);
            hook.params.query = query;
          }
        }
        //debug('service filter query', field, query[field]);
        return hook;
      });
    }
  };
}