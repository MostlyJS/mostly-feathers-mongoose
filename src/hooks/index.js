const addDelay = require('./add-delay');
const addParams = require('./add-params');
const addQuery = require('./add-query');
const addRouteObject = require('./add-route-object');
const asUpsert = require('./as-upsert');
const assoc = require('./assoc');
const authenticate = require('./authenticate');
const cascadeUpdate = require('./cascade-update');
const convertId = require('./convert-id');
const defaultAcls = require('./default-acls');
const depopulate = require('./depopulate');
const discardFields = require('./discard-fields');
const filter = require('./filter');
const filterField = require('./filter-field');
const idAsCurrentUser = require('./id-as-current-user');
const isAction = require('./is-action');
const isHeader = require('./is-header');
const flatMerge = require('./flat-merge');
const mapHookData = require('./map-hook-data');
const populate = require('./populate');
const prefixSelect = require('./prefix-select');
const presentEntity = require('./present-entity');
const publishEvent = require('./publish-event');
const responder = require('./responder');
const restrictToAcls = require('./restrict-to-acls');

module.exports = {
  addDelay,
  addParams,
  addQuery,
  addRouteObject,
  asUpsert,
  assoc,
  authenticate,
  cascadeUpdate,
  convertId,
  defaultAcls,
  depopulate,
  discardFields,
  filter,
  filterField,
  flatMerge,
  idAsCurrentUser,
  isAction,
  isHeader,
  mapHookData,
  populate,
  prefixSelect,
  presentEntity,
  publishEvent,
  responder,
  restrictToAcls
};
