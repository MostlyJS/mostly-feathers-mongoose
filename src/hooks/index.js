import _ from 'lodash';
import assert from 'assert';
import Entity from 'mostly-entity';
import { filter, filterField } from './filter';
import { convertId } from './convertId';
import { cascadeUpdate } from './cascadeUpdate';
import populate from './populate';
import validation from './validation';
import { restrictToAcls } from './restrict';

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
    assert(hook.result, 'Must be a valid id, hook.result is null');
    // debug('presentEntity', entity._name, hook.result);
    if (hook.result.data) {
      hook.result.data = entity.parse(hook.result.data);
    } else {
      hook.result = entity.parse(hook.result);
    }
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
    if (hook.result.data) {
      metadata = _.omit(hook.result, 'data');
    }

    let data = hook.result.data || hook.result || '';
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

export function assertAction() {
  return function(hook) {
    var error = 'Please provide valid action or target id';
    switch (hook.method) {
      case 'find':
      case 'create':
        if (hook.params.action) {
          assert(hook.params.action === hook.method, error);
        }
        break;
      case 'get':
      case 'update':
        if (hook.params.action) {
          assert(hook.id, error);
        }
        break;
      case 'patch':
      case 'remove':
        if (hook.params.action) {
          assert(hook.params.action === hook.method, error);
        }
        break;
    }
  };
}
