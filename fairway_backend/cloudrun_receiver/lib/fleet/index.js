'use strict';

/*
 * Barrel module for the WP2 Fleet Administration data
 * foundation. Not required by the live Cloud Function (index.js); provided
 * for future WP3/WP4/WP5 backend code to import.
 */

module.exports = {
  ...require('./schema'),
  ...require('./ids'),
  ...require('./credentials'),
  ...require('./customers'),
  ...require('./courses'),
  ...require('./hierarchy'),
  ...require('./devices'),
  ...require('./provisioning'),
};
