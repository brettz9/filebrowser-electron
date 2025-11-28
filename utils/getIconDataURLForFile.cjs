'use strict';

const {fromByteArray} = require('base64-js');
const {
  getIconForPath,
  ICON_SIZE_EXTRA_SMALL
  // ICON_SIZE_MEDIUM // ICON_SIZE_EXTRA_SMALL (16),
  // ICON_SIZE_SMALL (32), ICON_SIZE_MEDIUM (64),
  // ICON_SIZE_LARGE (256), ICON_SIZE_EXTRA_LARGE (512; only 256 on Windows)
} = require('system-icon2');

/**
 * @typedef {number} Integer
 */
/**
 *
 * @param {string} filePath
 * @param {Integer} [size]
 * @returns {Promise<string>}
 */
async function getIconDataURLForFile (filePath, size = ICON_SIZE_EXTRA_SMALL) {
  const result = await getIconForPath(filePath, size);
  const encoded = fromByteArray(result);
  return 'data:image/png;base64,' + encoded;
}

module.exports = getIconDataURLForFile;
