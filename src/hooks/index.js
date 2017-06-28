import _ from 'lodash';
import assert from 'assert';
import makeDebug from 'debug';
import Entity from 'mostly-entity';
import { filter, filterField } from './filter';
import { convertId } from './convertId';
import { cascadeUpdate } from './cascadeUpdate';
import populate from './populate';
import validation from './validation';
import { restrictToAcls } from './restrict';

const debug = makeDebug('mostly:feathers-mongoose:hooks');

export {
  convertId,
  cascadeUpdate,
  filter,
  populate,
  validation,
  filterField,
  restrictToAcls
};

// common hooks share all across services

export function presentEntity(entity) {
  return function(hook) {
    assert(entity && entity.parse, 'Must be a valid Entity: ' + entity);
    // debug('presentEntity', entity._name, hook.result);
    if (hook.result) {
      if (hook.result.data) {
        hook.result.data = entity.parse(hook.result.data);
      } else {
        hook.result = entity.parse(hook.result);
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
      metadata = _.omit(hook.result, 'data');
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
