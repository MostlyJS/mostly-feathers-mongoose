import assert from 'assert';
import mongoose from 'mongoose';
import fp from 'mostly-func';

/*
 * options:
 * classify: classify position by a specified field
 * unshift: insert at first
 */
export default function (schema, options) {
  options = options || {};

  if (!schema.get('position')) {
    schema.add({ position: { type: Number } });
  }

  schema.index({ position: 1 });

  const preUpdate = function (item, Model, next) {
    if (fp.isValid(item.position)) {
      return next();
    }

    const addLast = function (done) {
      let query = Model.findOne();
      if (options.classify) {
        assert(item[options.classify], 'classify field is not provided with item');
        query.where(options.classify).eq(item[options.classify]);
      }
      query.sort('-position').then(max => {
        item.position = (max && max.position) ? max.position + 1 : 0;
        done();
      });
    };

    if (options.unshift === true) {
      Model.where('position').exists().setOptions({ multi: true })
        .update({
          $inc: { position: 1 }
        }, err => {
          if (err) {
            console.error('sortable $inc error:', err);
            return addLast(next);
          } else {
            item.position = 0;
            return next();
          }
        });
    } else {
      return addLast(next);
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