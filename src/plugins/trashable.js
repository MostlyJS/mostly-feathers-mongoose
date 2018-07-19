const mongoose = require('mongoose');

module.exports = function (schema) {

  if (!schema.get('destroyedAt')) {
    schema.add({ destroyedAt: 'Date' });
  }

  schema.index({ destroyedAt: 1 });

  schema.statics.findSoft = function (conditions, projection, options) {
    const Model = mongoose.model(this.modelName);

    if (!conditions || typeof conditions === 'function') {
      conditions = {};
    }

    conditions.destroyedAt = conditions.destroyedAt || null;

    return Model.find(conditions, projection, options);
  };

  schema.statics.findOneSoft = function (conditions, projection, options) {
    const Model = mongoose.model(this.modelName);

    if (!conditions || typeof conditions === 'function') {
      conditions = {};
    }

    conditions.destroyedAt = conditions.destroyedAt || null;

    return Model.findOne(conditions, projection, options);
  };

  schema.statics.countSoft = function (conditions, projection, options) {
    const Model = mongoose.model(this.modelName);

    if (!conditions || typeof conditions === 'function') {
      conditions = {};
    }

    conditions.destroyedAt = conditions.destroyedAt || null;

    return Model.count(conditions, projection, options);
  };

  schema.methods.trash = function () {
    this.destroyedAt = new Date();
    return this.save();
  };

  schema.methods.restore = function () {
    this.destroyedAt = null;
    return this.save();
  };
};