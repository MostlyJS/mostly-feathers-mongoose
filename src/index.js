import * as hooks from './hooks';
import * as plugins from './plugins';
import service from './service';

Object.assign(service, { hooks, plugins, service });

export default service;