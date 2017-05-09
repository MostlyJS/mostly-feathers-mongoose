/**
 * Pagination Plugin
 */
import { findIndex, isEmpty } from 'lodash';
import util from 'util';
import { Query } from 'mongoose';

const defaults = {
  limit: 10 // 每页条数
};

/**
 * paginate
 *
 * @param {Object} options
 */
Query.prototype.paginate = function(options) {
  let opts = util._extend({}, defaults);
  opts = util._extend(opts, options);

  let query = this;
  let model = query.model;
  
  if (!query.options.sort) {
    query.options.sort = {};
  }

  return new Promise(function(resolve, reject) {
    let sortKeys = Object.keys(query.options.sort);
    let sortKey = sortKeys[0] || '_id';

    // add secondary (only) sort by _id
    if (!isEmpty(query.options.sort) && !query.options.sort._id) {
      query.options.sort._id = -1;
    }

    let promise = Promise.resolve(null);
    if (opts.maxid || opts.minid) {
      // optimize for sort on _id without query
      if (sortKey !== '_id') {
        query.where({ [sortKey]: { $ne: null } });
        opts.limit = opts.limit * 2; // fetch more records for later filter
        promise = model.findById(opts.maxid || opts.minid);
      } else {
        promise = Promise.resolve({ _id: opts.maxid || opts.minid });
      }
    }

    promise.then(sortBy => {
      let lt = (opts.reverse? '$gt' : '$lt') + (sortKey !== '_id'? 'e' : '');
      let gt = (opts.reverse? '$lt' : '$gt') + (sortKey !== '_id'? 'e' : '');

      if (opts.maxid) {
        if (sortBy && sortBy[sortKey]) {
          query.where({ [sortKey]: { [gt]: sortBy[sortKey] } });
        }
      } else if (opts.minid) {
        if (sortBy && sortBy[sortKey]) {
          query.where({ [sortKey]: { [lt]: sortBy[sortKey] } });
        }
      }

      return query.limit(opts.limit).exec();
    }).then(result => {
      result = result || [];
      let skip = findIndex(result, item => {
        return item._id.equals(opts.maxid || opts.minid);
      });
      if (skip >= 0) {
        result = result.slice(skip + 1);
      }

      let metadata = { count: result.length };
      if (result.length > 0) {
        metadata.maxid = result[0]._id;
        metadata.minid = result[result.length - 1]._id;
      } else {
        metadata.minid = opts.minid || '';
        metadata.maxid = opts.maxid || '';
      }
      resolve({
        metadata: metadata,
        data: result
      });
    }).catch(reject);
  });
};

