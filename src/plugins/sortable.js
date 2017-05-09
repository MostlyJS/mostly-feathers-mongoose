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

  schema.pre('save', function(next) {
    if (typeof this.position === 'number') {
      return next();
    }

    let item = this;
    const Model = mongoose.model(item.constructor.modelName);

    const addLast = function (done) { 
      let query = Model.findOne();
      if (options.classify) {
        query.where(options.classify).eq(item[options.classify]);
      }
      query.sort('-position').then(max => {
        item.position = (max && max.position) ? max.position + 1 : 1;
        done();
      });
    };

    if (options.unshift === true) {
      Model.where('position').exists().setOptions({ multi: true }).update(
        { $inc: { position: 1 } },
        function (err) {
          if (err) {
            console.error('err', err);
            return addLast(next);
          } else {
            item.position = 1;
            next();
          }
        }
      );
    } else {
      addLast(next);
    }
  });

  schema.statics.reorderPosition = function(item, newPos) {
    const prevPos = parseInt(item.position);
    newPos = parseInt(newPos);

    const self = this;

    const whichWay = (newPos > prevPos) ? -1 : 1;
    const start = (newPos > prevPos) ? prevPos + 1 : newPos;
    const end = (newPos > prevPos) ? newPos : prevPos - 1;
    return self.where('position').gte(start).lte(end)
      .setOptions({ multi: true })
      .update({ $inc: { sortOrder: whichWay } })
      .then(function() {
        return self.findOneAndUpdate({ _id: item._id }, { position: newPos });
      });
  };
}