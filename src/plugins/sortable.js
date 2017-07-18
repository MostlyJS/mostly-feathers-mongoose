import mongoose from 'mongoose';

/*
 * options:
 * classify: classify position by a specified field
 * unshift: insert at first
 */
export default function(schema, options) {
  options = options || {};

  if (!schema.get('position')) {
    schema.add({ position: 'Number' });
  }

  schema.index({ position: 1 });

  const preUpdate = function(item, Model, next) {
    if (typeof item.position === 'number') {
      return next();
    }

    const addLast = function(done) {
      let query = Model.findOne();
      if (options.classify) {
        query.where(options.classify).eq(item[options.classify]);
      }
      query.sort('-position').then((max) => {
        item.position = (max && max.position) ? max.position + 1 : 1;
        done();
      });
    };

    if (options.unshift === true) {
      Model.where('position').exists().setOptions({ multi: true })
        .update({
          $inc: { position: 1 }
        }, (err) => {
          if (err) {
            console.error('sortable $inc error:', err);
            return addLast(next);
          } else {
            item.position = 1;
            return next();
          }
        });
    } else {
      return addLast(next);
    }
  };

  schema.pre('save', function(next) {
    let item = this;
    const Model = mongoose.model(item.constructor.modelName);
    preUpdate(item, Model, next);
  });

  schema.pre('findOneAndUpdate', function(next) {
    let item = this.getUpdate();
    const Model = mongoose.model(this.model.modelName);
    preUpdate(item, Model, next);
  });
  
}