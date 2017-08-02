import _ from 'lodash';
import assert from 'assert';
import makeDebug from 'debug';
import Entity from 'mostly-entity';
import { cascadeUpdate } from './cascadeUpdate';
import { convertId } from './convertId';
import { filter, filterField } from './filter';
import { populate, depopulate } from './populate';
import { publishEvent } from './publishEvent';
import { restrictToAcls } from './restrict';
import validation from './validation';

const debug = makeDebug('mostly:feathers-mongoose:hooks');

export {
  cascadeUpdate,
  convertId,
  depopulate,
  filter,
  filterField,
  populate,
  publishEvent,
  restrictToAcls,
  validation
};

// common hooks share all across services

export function presentEntity(entity, options = {}) {
  assert(entity && entity.parse, 'Must be a valid Entity: ' + entity);

  return function(hook) {
    options.provider = hook.params.provider;
    
    if (hook.result) {
      if (hook.result.data) {
        hook.result.data = entity.parse(hook.result.data, options);
      } else {
        hook.result = entity.parse(hook.result, options);
      }
    }
    return hook;
  };
}

export function addDelay(delay) {
  return (hook, next) => {
    setTimeout(next, delay);
  };
}

export function emptyNull(field) {
  return function(hook) {
    if (hook.type !== 'before') {
      throw new Error(`The 'emptyNull' hook should only be used as a 'before' hook.`);
    }

    if (_.isEmpty(hook.data[field]) || hook.data[field] == '') {
      hook.data[field] = null;
    }
    return hook;
  };
}

// 返回值定制
export function responder() {
  return function(hook) {
    // If it was an internal call then skip this hook
    if (!hook.params.provider) {
      return hook;
    }

    let metadata = {};
    let data = hook.result;

    if (hook.result && hook.result.data) {
      metadata = hook.result.metadata || _.omit(hook.result, 'data');
      data = hook.result.data;
    }

    hook.result = {
      status: 0,
      message: '',
      metadata: metadata,
      errors: [],
      data: data
    };
    return hook;
  };
}
