import * as hooks from './hooks';
import * as plugins from './plugins';
import service from './service';
console.log("####1", hooks);
console.log("####2", plugins);
console.log("####3", service);

Object.assign(service, { hooks, plugins, service });

export default service;