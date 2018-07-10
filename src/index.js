const helpers = require('./helpers');
const hooks = require('./hooks');
const plugins = require('./plugins');
const mongoose = require('./mongoose');
const service = require('./service');

module.exports = Object.assign({}, service, mongoose, { hooks, plugins, service, helpers });
