import assert from 'assert';
import errors from 'feathers-errors';
import fp from 'mostly-func';
import { getItems, replaceItems } from 'feathers-hooks-common';

export default function mapItems (func) {
  if (!func || typeof func !== 'function') {
    throw new errors.BadRequest('Function required. (alter)');
  }

  return context => {
    let items = getItems(context);
    if (Array.isArray(items)) {
      items = fp.mapIndexed((item, index) => func(item, context));
    } else {
      items = func(items, context);
    }
    replaceItems(context, items);
    return context;
  };
}