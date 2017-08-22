// A mongoose random select plugin using a random document instead of a random field

import _ from 'lodash';
import mongoose from 'mongoose';


export default function(schema, options) {
  options = options || {};

  const RandomModel = mongoose.model(options.model || 'random');
  const idField = options.randomId || 'randomId';
  const idModel = options.randomId || 'randomModel';
  const randField = options.randomId || '_rand';


  function randCoords() {
    return [Math.random(), Math.random()];
  }

  function upsertRandom(id, modelName) {
    let randItem = {};
    randItem[idField] = id;
    randItem[idModel] = modelName;
    randItem[randField] = {
      type: 'Point',
      coordinates: randCoords()
    };
    return RandomModel.findOneAndUpdate({ [idField]: id },
      randItem, { upsert: true, new: true }
    );
  }

  schema.post('save', function(item, next) {
    upsertRandom(item._id, item.constructor.modelName).exec(next);
  });

  schema.statics.findRandom = function (conditions, fields, options) {
    var self = this;

    if (!conditions || typeof conditions === 'function') {
      conditions = {};
    }

    if (conditions._id) {
      console.error('Cannot findRandom with _id conditions specified!');
      return self.find.call(self, conditions, fields, options);
    }

    return RandomModel.find({
      [idModel] : self.modelName,
      [randField] : {
        $near: {
          $geometry: { type: 'Point', coordinates: randCoords() }
        }
      }
    }).then(rands => {
      let randIds = _.map(rands, idField);
      conditions._id = conditions._id || { $in: randIds };
      return self.find.call(self, conditions, fields, options);
    });
  };

  schema.statics.syncRandom = function (callback) {
    const self = this;
    let stream = self.find({}).stream();
    let result = {
      attempted: 0,
      updated: 0
    };
    let left = 0;
    let streamEnd = false;

    stream.on('data', function (doc) {
      result.attempted += 1;
      left += 1;

      upsertRandom(doc._id, self.modelName).then(() => {
        result.updated += 1;
        left -= 1;
        if (streamEnd && !left) {
          return callback(null, result);
        }
      }).catch(console.error);
    }).on('error', function (err) {
      console.error(err.stack);
    }).on('end', function () {
      streamEnd = true;
    });
    return stream;
  };

}