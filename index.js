require = require("esm")(module/*, options*/);
console.time('mostly-feathers-mongoose import');
module.exports = require('./src/index').default;
console.timeEnd('mostly-feathers-mongoose import');
