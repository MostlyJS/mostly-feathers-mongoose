module.exports = function findEntries (service, ids, select = '*') {
  return service.find({
    query: {
      _id: { $in: ids },
      $select: select
    },
    paginate: false
  });
};