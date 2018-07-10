module.exports = function findUserEntries (service, ids, user, select = '*') {
  return service.find({
    query: {
      _id: { $in: ids },
      user: user,
      $select: select
    },
    paginate: false
  });
};