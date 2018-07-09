import assert from 'assert';
import mongoose from 'mongoose';
import fp from 'mostly-func';

const defaultOptions = {
  trash: null,         // trashable field
  classify: null,      // classify position by a specified field
  unshift: false       // insert at first
};

export default function (schema, options) {
  options = fp.assignAll(defaultOptions, options);

  if (!schema.get('position')) {
    schema.add({ position: { type: Number } });
  }

  schema.index({ position: 1 });

  const preUpdate = function (item, Model, next) {

    const classifyQuery = function (query) {
      if (options.classify) {
        assert(options.classify in item, 'classify field is not provided with item');
        query.where(options.classify).eq(item[options.classify]);
      }
      return query;
    };

    const addLast = function (done) {
      let query = Model.findOne();
      if (options.trash) {
        query.where(options.trash, null);
      }
      classifyQuery(query).sort('-position').then(max => {
        item.position = (max && max.position)? max.position + 1 : 0;
        done();
      });
    };

    const addFirst = function (done) {
      let query = Model.where('position').exists();
      classifyQuery(query).setOptions({ multi: true })
        .update({
          $inc: { position: 1 }
        }, err => {
          if (err) {
            console.error('sortable $inc error:', err);
            addLast(done);
          } else {
            item.position = 0;
            done();
          }
        });
    };

    // if item has the deleted field
    if (options.trash && item[options.trash] !== undefined) {
      if (item[options.trash] || item.position === undefined) {
        return next(); // skip
      } else {
        // untrash with new position (null)
        if (options.unshift === true) {
          return addFirst(next);
        } else {
          return addLast(next);
        }
      }
    }

    // if item is with specified position or without specified classify field
    if (fp.isValid(item.position) || (options.classify && !item[options.classify])) {
      return next(); // skip
    } else {
      // update with new position (null/undefined)
      if (options.unshift === true) {
        return addFirst(next);
      } else {
        return addLast(next);
      }
    }
  };

  // TODO function model like pre('update')
  schema.pre('save', function (next) {
    let item = this;
    const Model = mongoose.model(item.constructor.modelName);
    preUpdate(item, Model, next);
  });

  schema.pre('update', function (next) {
    const update = this.getUpdate();
    if (this.model && update && update.$set) {
      if (update.$inc && !fp.isNil(update.$inc.position)) {
        return next();
      }
      preUpdate(update.$set, this.model, next);
    } else {
      return next();
    }
  });

  // TODO function model like pre('update')
  schema.pre('findOneAndUpdate', function (next) {
    let item = this.getUpdate();
    const Model = mongoose.model(this.model.modelName);
    preUpdate(item, Model, next);
  });
  
}