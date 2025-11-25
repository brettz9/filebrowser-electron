/* eslint-disable n/no-sync,
  promise/prefer-await-to-then,
  promise/catch-or-return -- Needed for performance */
'use strict';

const {readdirSync, lstatSync} = require('node:fs');
const path = require('node:path');
// eslint-disable-next-line @stylistic/max-len -- Long
// eslint-disable-next-line n/no-unpublished-require -- electron-forge requires electron as devDep.
const {shell} = require('electron');

const {jml} = require('jamilih');
const jQuery = require('jquery');
const addMillerColumnPlugin = require('miller-columns');

const getIconDataURLForFile = require('./utils/getIconDataURLForFile.js');

/* eslint-disable jsdoc/reject-any-type -- Generic */
/**
 * @param {any[]} arr
 * @param {number} n
 */
const chunk = (arr, n) => Array.from({
  length: Math.ceil(arr.length / n)
}, (_, i) => arr.slice(n * i, n + (n * i)));
/* eslint-enable jsdoc/reject-any-type -- Generic */

/**
 * @param {string} sel
 */
const $ = (sel) => {
  return /** @type {HTMLElement} */ (document.querySelector(sel));
};

/**
 * @param {string} sel
 */
const $$ = (sel) => {
  return /** @type {HTMLElement[]} */ ([...document.querySelectorAll(sel)]);
};

// Ensure jamilih uses the browser's DOM instead of jsdom
jml.setWindow(globalThis);

/**
 *
 * @returns {string}
 */
function getBasePath () {
  if (!location.hash.length && process.argv.length) {
    const idx = process.argv.findIndex((arg) => {
      return arg === '--path' || arg === 'p';
    });
    return idx === -1 ? '/' : process.argv[idx + 1];
  }

  const params = new URLSearchParams(location.hash.slice(1));
  return path.normalize(
    params.has('path') ? params.get('path') + '/' : '/'
  );
}

/**
 * @param {string} basePath
 * @returns {Result[]}
 */
function readDirectory (basePath) {
  return readdirSync(basePath).map((fileOrDir) => {
    const stat = lstatSync(path.join(basePath, fileOrDir));
    return /** @type {Result} */ (
      [stat.isDirectory() || stat.isSymbolicLink(), basePath, fileOrDir]
    );
  }).toSorted(([, , a], [, , b]) => {
    return a.localeCompare(b, undefined, {sensitivity: 'base'});
  });
}

/**
 *
 * @returns {void}
 */
function changePath () {
  // console.log('change path');
  const view = localStorage.getItem('view') ?? 'icon-view';
  const currentBasePath = getBasePath();
  const basePath = view === 'icon-view' ? currentBasePath : '/';
  if (!(/^[\w.\/ \-]*$/v).test(basePath)) {
    // Todo: Refactor to allow non-ASCII and just escape single quotes, etc.
    // eslint-disable-next-line no-console -- Debugging
    console.log('Non-ASCII path provided');
    return;
  }

  const result = readDirectory(basePath);
  addItems(result, basePath, currentBasePath);
}

/**
 * @typedef {[isDir: boolean, childDir: string, title: string]} Result
 */

/** @type {JQuery} */
let $columns;
/**
 *
 * @param {Result[]} result
 * @param {string} basePath
 * @param {string} currentBasePath
 * @returns {void}
 */
function addItems (result, basePath, currentBasePath) {
  const view = localStorage.getItem('view') ?? 'icon-view';

  $('i').hidden = true;
  const ul = $('ul');
  while (ul.firstChild) {
    ul.firstChild.remove();
  }

  const listItems = result.map(([
    isDir,
    // eslint-disable-next-line no-unused-vars -- Not in use
    _childDir,
    title
  ]) => {
    const li = jml(
      view === 'icon-view' ? 'td' : 'li',
      {
        class: 'list-item'
        // style: url ? 'list-style-image: url("' + url + '")' : undefined
      }, [
        isDir
          ? ['a', {
            title: basePath + encodeURIComponent(title),
            ...(view === 'icon-view'
              ? {
                href: '#path=' + basePath + encodeURIComponent(title)
              }
              : {})
          }, [
            title
          ]]
          : ['span', {
            title: basePath + encodeURIComponent(title),
            dataset: {
              path: basePath + encodeURIComponent(title)
            }
          }, [title]]
      ]
    );

    getIconDataURLForFile(
      path.join(basePath, title)
    ).then((url) => {
      const width = '25px';
      const paddingTopBottom = '5px';
      const paddingRightLeft = '30px';
      const marginTopBottom = '18px';
      li.setAttribute(
        'style',
        url
          ? `margin-top: ${
            marginTopBottom
          }; margin-bottom: ${
            marginTopBottom
          }; padding: ${paddingTopBottom} ${
            paddingRightLeft
          } ${paddingTopBottom} ${
            paddingRightLeft
          }; background-image: url(${
            url
          }); background-size: ${width};`
          : ''
      );
      return undefined;
    });

    return li;
  });

  const numIconColumns = 4;

  jml(ul, [
    (view === 'icon-view' && basePath !== '/'
      ? [
        'li', [
          ['a', {
            title: path.normalize(path.join(basePath, '..')),
            href: '#path=' + path.normalize(path.join(basePath, '..'))
          }, [
            '..'
          ]]
        ]
      ]
      : ''),
    ...(view === 'icon-view'
      ? /** @type {import('jamilih').JamilihArray[]} */ ([[
        'table',
        chunk(listItems, numIconColumns).map((innerArr) => {
          return ['tr', innerArr];
        })
      ]])
      : listItems)
  ]);

  if ($columns?.destroy) {
    $columns.destroy();
    if (view === 'icon-view') {
      changePath();
    }
  }

  if (view === 'icon-view') {
    return;
  }

  const millerColumns = jQuery('div.miller-columns');
  const parentMap = new WeakMap();
  const childMap = new WeakMap();
  $columns = millerColumns.millerColumns({
    // Options:
    // The animation delay necessitates our 250ms `setTimeout` later
    // delay: 200, // Reduce animation delay from default 500ms
    // preview () {
    //   return 'preview placeholder';
    // },
    animation () {
      // No-op to avoid need for timeouts
    },
    // @ts-ignore Bugginess
    current ($item /* , $cols */) {
      if (parentMap.has($item[0])) {
        history.replaceState(
          null,
          '',
          location.pathname + '#path=' + encodeURIComponent(
            parentMap.get($item[0])
          )
        );
        // setTimeout(() => {
        childMap.get($item[0])?.scrollIntoView({
          block: 'start',
          container: 'nearest',
          inline: 'start'
        });
        // }, 250);
        return;
      }

      const a = $item.children('a[title]');
      if (!a.length) {
        return;
      }

      const parent = $item.parent();
      const prev = parent.prevAll(
        'ul.miller-column:not(.miller-collapse)'
      ).first();
      const parentLi = prev.children('li.miller-selected')[0];

      const parentText = parentMap.get(parentLi) ?? '';
      const currentPath = parentText + '/' + a.text();

      parentMap.set($item[0], currentPath);

      history.replaceState(
        null,
        '',
        location.pathname + '#path=' + encodeURIComponent(currentPath)
      );

      const childResult = readDirectory(currentPath);
      console.log('childResult', childResult);

      const childItems = childResult.map(([
        isDir, childDirectory, title
      ]) => {
        const width = '25px';
        const paddingRightLeft = '30px';
        const marginTopBottom = '18px';
        const li = jml('li', [
          isDir
            ? ['a', {
              title: childDirectory + '/' +
                encodeURIComponent(title)
              // href: '#path=' + childDirectory + '/' +
              //  encodeURIComponent(title)
            }, [
              title
            ]]
            : ['span', {
              title: childDirectory + '/' +
                encodeURIComponent(title),
              dataset: {
                path: childDirectory + '/' +
                  encodeURIComponent(title)
              }
            }, [title]]
        ]);
        getIconDataURLForFile(
          path.join(childDirectory, title)
        ).then((url) => {
          li.setAttribute(
            'style',
            url
              ? `margin-top: ${
                marginTopBottom
              }; margin-bottom: ${
                marginTopBottom
              }; padding: 0 ${
                paddingRightLeft
              } 0 ${
                paddingRightLeft
              }; list-style: none; background-image: url(${
                url
              }); background-repeat: no-repeat; ` +
              `background-position: left center; background-size: ${width};`
              : ''
          );
          return undefined;
        });

        return li;
      });

      childItems.forEach((childItem, idx) => {
        if (!$columns.addItem) {
          return;
        }
        const item = $columns.addItem(jQuery(childItem), $item);
        if (idx === 0) {
          childMap.set($item[0], item[0]);
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              setTimeout(() => {
                item[0].scrollIntoView({
                  block: 'start', inline: 'start'
                });
              }, 250); // Slightly longer than delay setting (200ms)
            });
          });
        }
      });
    }
  });

  $columns.on('dblclick', (e) => {
    if (e.target.dataset.path) {
      shell.openPath(e.target.dataset.path);
    }
  });
  $columns.on('keydown', (e) => {
    const pth = $columns.find('li.miller-selected span')[0]?.dataset?.path;
    if (e.metaKey && e.key === 'o' && pth) {
      shell.openPath(pth);
    }
  });

  if (currentBasePath !== '/') {
    currentBasePath.split('/').slice(1).forEach(
      (pathSegment, idx) => {
        if (pathSegment === '/') {
          return undefined;
        }

        const ulNth = jQuery(`ul.miller-column:nth-of-type(${
          idx + 1
        }):not(.miller-collapse)`);
        // eslint-disable-next-line @stylistic/max-len -- Long
        // console.log('ul idx:', idx + ', length:', ulNth.length, '::', pathSegment);
        const anchors = ulNth.find('a[title]').filter(
          function () {
            return jQuery(this).text() === pathSegment;
          }
        );
        // console.log('anchors', anchors.length);
        anchors.trigger('click');
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            // setTimeout(() => {
            anchors[0]?.scrollIntoView({
              block: 'start',
              inline: 'start'
            });
            // }, 250);
          });
        });
        return undefined;
      }
    );
  }
}

globalThis.addEventListener('hashchange', changePath);

$('#icon-view').addEventListener('click', function () {
  $$('nav button').forEach((button) => {
    button.classList.remove('selected');
  });
  this.classList.add('selected');
  localStorage.setItem('view', 'icon-view');
  $('.miller-breadcrumbs').style.display = 'none';
  changePath();
});
$('#three-columns').addEventListener('click', function () {
  $$('nav button').forEach((button) => {
    button.classList.remove('selected');
  });
  this.classList.add('selected');
  localStorage.setItem('view', 'three-columns');
  $('.miller-breadcrumbs').style.display = 'block';
  changePath();
});

const view = localStorage.getItem('view') ?? 'icon-view';
switch (view) {
case 'three-columns':
case 'icon-view':
  $('#' + view).classList.add('selected');
  break;
default:
  throw new Error('Unrecognized view');
}

$('#filebrowser').title = `
    We are using Node.js ${process.versions.node},
    Chromium ${process.versions.chrome},
    and Electron ${process.versions.electron}.
`;

// eslint-disable-next-line unicorn/prefer-top-level-await -- Not ESM
(async () => {
await addMillerColumnPlugin.default(jQuery, {stylesheets: ['@default']});
changePath();
})();
