const assert = require('assert');
const fp = require('mostly-func');

module.exports = async function reorderPosition (Model, item, newPos, options) {
  const items = fp.asArray(item);
  assert(items.length, 'At least one item must be provided');
  const idField = options.idField || '_id';
  const prevPos = fp.reduce((acc, item) => Math.max(acc, item.position), 0, items); // last position
  newPos = parseInt(newPos || 0);

  const whichWay = (newPos > prevPos? -1 : 1); // down : up
  const start = (newPos > prevPos)? prevPos + 1 : newPos;
  const end = (newPos > prevPos)? newPos : prevPos - 1;

  // sort item reverse (desc) for moving down and asc for moving up
  const sortedItems = fp.sort((a, b) => whichWay * (a.position - b.position), items);

  const others = {
    position: { '$gte': start, '$lte': end }
  };
  if (options.classify) {
    others[options.classify] = sortedItems[0][options.classify];
  }
  // update others position one way down
  await Model.update(others, {
    $inc: { position: sortedItems.length * whichWay }
  }, {
    multi: true
  });

  const updatePosition = function (item, index) {
    const cond = {
      [idField]: item._id || item.id
    };
    const update = {
      position: newPos + index * whichWay,
    };
    if (options.classify) {
      assert(item[options.classify], 'item classify is not exists');
      cond[options.classify] = item[options.classify];
      update[options.classify] = item[options.classify]; // must provided with position
    }
    // update position of the item
    return Model.findOneAndUpdate(cond, update, { new : true });
  };

  return Promise.all(fp.mapIndexed(updatePosition, sortedItems));
};