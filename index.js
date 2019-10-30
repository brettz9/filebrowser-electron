/* eslint-disable import/no-unresolved, node/no-missing-import */
import {jml, $} from 'es6://node_modules/jamilih/dist/jml-es.js';
import {fromByteArray} from 'es6://node_modules/base64-js/base64js-es.js';

const fs = require('fs');
const path = require('path');

const {
  getIconForPath,
  ICON_SIZE_EXTRA_SMALL
  // ICON_SIZE_MEDIUM // ICON_SIZE_EXTRA_SMALL (16),
  // ICON_SIZE_SMALL (32), ICON_SIZE_MEDIUM (64),
  // ICON_SIZE_LARGE (256), ICON_SIZE_EXTRA_LARGE (512; only 256 on Windows)
} = require('system-icon');

/**
 *
 * @returns {string}
 */
function getBasePath () {
  const params = new URLSearchParams(window.location.hash.slice(1));
  return path.normalize(
    params.has('path') ? params.get('path') + '/' : '/'
  );
}

const isWebAppFind = false;

/**
 *
 * @returns {Promise<void>}
 */
async function changePath () {
  // console.log('change path');
  const basePath = getBasePath();
  if (!basePath.match(/^[\w./ -]*$/u)) {
    // Todo: Refactor to allow non-ASCII and just escape single quotes, etc.
    console.log('Non-ASCII path provided'); // eslint-disable-line no-console
    return;
  }
  if (isWebAppFind) {
    window.postMessage({
      webappfind: {
        method: 'nodeEval',
        string: `
  const fs = require('fs');
  fs.readdirSync('${basePath}').map((fileOrDir) => {
    const stat = fs.lstatSync('${basePath}' + fileOrDir);
    return [stat.isDirectory() || stat.isSymbolicLink(), fileOrDir];
  });`
      }
    }, '*');
    return;
  }

  // console.log('basePath', basePath);
  // Todo: Switch to promise form when ready
  // eslint-disable-next-line no-sync
  const result = fs.readdirSync(basePath).map((fileOrDir) => {
    // eslint-disable-next-line no-sync
    const stat = fs.lstatSync(basePath + fileOrDir);
    return [stat.isDirectory() || stat.isSymbolicLink(), fileOrDir];
  });
  // console.log('result', result);
  await addItems(result);
}

/**
 *
 * @param {string} filePath
 * @param {Integer} [size=ICON_SIZE_EXTRA_SMALL]
 * @returns {Promise<ByteArray>}
 */
function getIconForFile (filePath, size = ICON_SIZE_EXTRA_SMALL) {
  // eslint-disable-next-line promise/avoid-new
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line promise/prefer-await-to-callbacks
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
* @typedef {GenericArray} Result
* @property {boolean} 0 isDir
* @property {string} 1 title
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
  // Todo: Do for WebAppFind
  jml(ul, [
    (!isWebAppFind && basePath !== '/'
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
      return ['li', {
        style: 'list-style-image: url("' + await (getIconDataURLForFile(
          path.join(basePath, title)
        ).catch((err) => {
          // eslint-disable-next-line no-console
          console.error(err);
        })) + '")'
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

window.addEventListener('hashchange', changePath);
window.addEventListener('message', async ({data: {webappfind}}) => {
  if (webappfind.method) { // Don't echo items just posted below
    return;
  }
  if (webappfind.evalReady) {
    await changePath();
    return;
  }
  await addItems(webappfind.result);
});

changePath();
