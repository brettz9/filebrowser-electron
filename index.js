'use strict';

const {readdir, lstat} = require('fs/promises');
const path = require('path');

const {jml, $} = require('jamilih');
const {fromByteArray} = require('base64-js');

const {
  getIconForPath,
  ICON_SIZE_EXTRA_SMALL
  // ICON_SIZE_MEDIUM // ICON_SIZE_EXTRA_SMALL (16),
  // ICON_SIZE_SMALL (32), ICON_SIZE_MEDIUM (64),
  // ICON_SIZE_LARGE (256), ICON_SIZE_EXTRA_LARGE (512; only 256 on Windows)
} = require('system-icon2');

// Ensure jamilih uses the browser's DOM instead of jsdom
jml.setWindow(globalThis);

/**
 *
 * @returns {string}
 */
function getBasePath () {
  const params = new URLSearchParams(globalThis.location.hash.slice(1));
  return path.normalize(
    params.has('path') ? params.get('path') + '/' : '/'
  );
}

/**
 *
 * @returns {Promise<void>}
 */
async function changePath () {
  // console.log('change path');
  const basePath = getBasePath();
  if (!(/^[\w.\/ \-]*$/v).test(basePath)) {
    // Todo: Refactor to allow non-ASCII and just escape single quotes, etc.
    // eslint-disable-next-line no-console -- Debugging
    console.log('Non-ASCII path provided');
    return;
  }

  const result = await Promise.all(
    (await readdir(basePath)).map(async (fileOrDir) => {
      const stat = await lstat(basePath + fileOrDir);
      return [stat.isDirectory() || stat.isSymbolicLink(), fileOrDir];
    })
  );
  await addItems(result);
}

/**
 *
 * @param {string} filePath
 * @param {Integer} [size]
 * @returns {Promise<ByteArray>}
 */
function getIconForFile (filePath, size = ICON_SIZE_EXTRA_SMALL) {
  // eslint-disable-next-line promise/avoid-new -- API
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line promise/prefer-await-to-callbacks -- API
    getIconForPath(filePath, size, (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
}

/**
 *
 * @param {string} filePath
 * @param {Integer} size
 * @returns {Promise<string>}
 */
async function getIconDataURLForFile (filePath, size) {
  const result = await getIconForFile(filePath, size);
  const encoded = fromByteArray(result);
  return 'data:image/png;base64,' + encoded;
}

/**
 * @typedef {[isDir: boolean, title: string]} Result
 */

/**
 *
 * @param {Result[]} result
 * @returns {Promise<void>}
 */
async function addItems (result) {
  const basePath = getBasePath();
  $('i').hidden = true;
  const ul = $('ul');
  while (ul.firstChild) {
    ul.firstChild.remove();
  }

  jml(ul, [
    (basePath !== '/'
      ? [
        'li', [
          ['a', {
            href: '#path=' + path.normalize(path.join(basePath, '..'))
          }, [
            '..'
          ]]
        ]
      ]
      : ''),
    ...(await Promise.all(result.map(async ([isDir, title]) => {
      let url;
      try {
        url = await (getIconDataURLForFile(
          path.join(basePath, title)
        ));
      } catch (err) {
        // eslint-disable-next-line no-console -- Debugging
        console.error(err);
      }
      return ['li', {
        style: url ? 'list-style-image: url("' + url + '")' : undefined
      }, [
        isDir
          ? ['a', {
            href: '#path=' + basePath + encodeURIComponent(title)
          }, [
            title
          ]]
          : title
      ]];
    })))
  ]);
}

globalThis.addEventListener('hashchange', changePath);
$('#version').textContent = process.versions.node;
$('#chromium').textContent = process.versions.chrome;
$('#electron').textContent = process.versions.electron;

// eslint-disable-next-line unicorn/prefer-top-level-await -- Not ESM
changePath();
