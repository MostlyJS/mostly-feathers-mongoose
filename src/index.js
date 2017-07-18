import * as helpers from './helpers';
import * as hooks from './hooks';
import * as plugins from './plugins';
import service from './service';
import { connectDb, createModel, createService } from './mongoose';

Object.assign(service, { hooks, plugins, service, helpers, connectDb, createModel, createService });

export default service;