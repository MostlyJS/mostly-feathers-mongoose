import * as helpers from './helpers';
import * as hooks from './hooks';
import * as plugins from './plugins';
import * as mongoose from './mongoose';
import * as service from './service';

export default Object.assign({}, service, mongoose, { hooks, plugins, service, helpers });
