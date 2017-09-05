import * as helpers from './helpers';
import * as hooks from './hooks';
import * as plugins from './plugins';
import * as mongoose from './mongoose';
import service from './service';

Object.assign(service, { hooks, plugins, service, helpers }, mongoose);

export default service;