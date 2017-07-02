import * as hooks from './hooks';
import * as plugins from './plugins';
import service from './service';
import { connectDb, createModel } from './mongoose';

Object.assign(service, { hooks, plugins, service, connectDb, createModel });

export default service;