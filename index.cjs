/* eslint-disable n/no-sync,
  promise/prefer-await-to-then,
  promise/catch-or-return -- Needed for performance */
/* eslint-disable sonarjs/no-os-command-from-path -- Needed */
'use strict';

const {readdirSync, lstatSync} = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

// eslint-disable-next-line @stylistic/max-len -- Long
// eslint-disable-next-line n/no-unpublished-require -- electron-forge requires electron as devDep.
const {shell} = require('electron');

const {StickyNote} = require('stickynote');
const {jml} = require('jamilih');
const jQuery = require('jquery');
const addMillerColumnPlugin = require('miller-columns');
const {getOpenWithApps, getAppIcons} = require('open-with-me');

const getIconDataURLForFile = require('./src/renderer/utils/getIconDataURLForFile.cjs');

const stickyNotes = new StickyNote({
  colors: ['#fff740', '#ff7eb9', '#7afcff', '#feff9c', '#a7ffeb', '#c7ceea'],
  onDelete (note) {
    const notes = stickyNotes.getAllNotes(({metadata}) => {
      return metadata.type === 'local' &&
        metadata.path === note.metadata.path;
    });
    if (note.metadata.type === 'local') {
      localStorage.setItem(
        `stickyNotes-${note.metadata.path}`, JSON.stringify(notes)
      );
    } else {
      localStorage.setItem(
        `stickyNotes-global`, JSON.stringify(notes)
      );
    }
  }
});

/**
 * @param {import('stickynote').NoteData} note
 * @param {string} pth
 */
const addStickyInputListeners = (note, pth) => {
  const saveNotes = () => {
    const notes = stickyNotes.getAllNotes(({metadata}) => {
      return metadata.type === 'local' &&
        metadata.path === note.metadata.path;
    });
    localStorage.setItem(
      `stickyNotes-${pth}`, JSON.stringify(notes)
    );
  };
  note.content.addEventListener('input', () => {
    saveNotes();
  });

  const noteElement = note.element;
  const noteObserver = new MutationObserver(function (mutationsList) {
    for (const mutation of mutationsList) {
      if (mutation.attributeName === 'class' ||
        mutation.attributeName === 'data-color-index'
      ) {
        // mutation.target.classList.contains('collapsed')
        saveNotes();
      }
    }
  });
  if (noteElement) {
    const config = {
      attributes: true, attributeFilter: ['class', 'data-color-index']
    };
    noteObserver.observe(noteElement, config);
  }

  const titleObserver = new MutationObserver(function (mutationsList) {
    for (const mutation of mutationsList) {
      if (mutation.attributeName === 'class') {
        // mutation.target.classList.contains('collapsed')
        saveNotes();
      }
    }
  });
  const titleElement = note.title;
  if (titleElement) {
    const config = {attributes: true, attributeFilter: ['class']};
    titleObserver.observe(titleElement, config);
  }

  // To stop observing later:
  // noteObserver.disconnect();
};

/**
 * @param {import('stickynote').NoteData} note
 */
const addStickyInputListenersGlobal = (note) => {
  const saveNotes = () => {
    const notes = stickyNotes.getAllNotes(({metadata}) => {
      return metadata.type === 'global';
    });
    localStorage.setItem(
      `stickyNotes-global`, JSON.stringify(notes)
    );
  };
  note.content.addEventListener('input', () => {
    saveNotes();
  });

  const noteElement = note.element;
  const noteObserver = new MutationObserver(function (mutationsList) {
    for (const mutation of mutationsList) {
      if (mutation.attributeName === 'class' ||
        mutation.attributeName === 'data-color-index'
      ) {
        // mutation.target.classList.contains('collapsed')
        saveNotes();
      }
    }
  });
  if (noteElement) {
    const config = {
      attributes: true, attributeFilter: ['class', 'data-color-index']
    };
    noteObserver.observe(noteElement, config);
  }

  const titleObserver = new MutationObserver(function (mutationsList) {
    for (const mutation of mutationsList) {
      if (mutation.attributeName === 'class') {
        // mutation.target.classList.contains('collapsed')
        saveNotes();
      }
    }
  });
  const titleElement = note.title;
  if (titleElement) {
    const config = {attributes: true, attributeFilter: ['class']};
    titleObserver.observe(titleElement, config);
  }

  // To stop observing later:
  // noteObserver.disconnect();
};

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

  /**
   * @param {Event} e
   */
  const contextmenu = async (e) => {
    e.preventDefault();
    const {path: pth} = /** @type {HTMLElement} */ (e.target).dataset;
    if (!pth) {
      return;
    }
    /** @type {import('open-with-me').OpenWithApp & {image?: string}} */
    let defaultApp = {name: '', path: '', rank: '', image: ''};
    const appsOrig = await getOpenWithApps(pth, {
      maxResults: 10
    });
    const icons = await getAppIcons(appsOrig);

    // Add icons to apps before filtering
    const appsWithIcons = appsOrig.map((app, idx) => {
      // @ts-expect-error Add it ourselves
      app.image = icons[idx];
      return app;
    });

    // Find default app and filter
    const apps = appsWithIcons.filter((app) => {
      if (app.isSystemDefault) {
        defaultApp = app;
      }
      return !app.isSystemDefault;
    }).toSorted((a, b) => {
      return a.name.localeCompare(b.name);
    });

    const customContextMenu = jml('ul', {
      class: 'context-menu',
      style: {
        left: /** @type {MouseEvent} */ (e).pageX + 'px',
        top: /** @type {MouseEvent} */ (e).pageY + 'px'
      }
    }, [
      ['li', {
        class: 'context-menu-item',
        $on: {
          click () {
            shell.openPath(pth);
          }
        }
      }, [
        'Open'
      ]],
      ['li', {
        class: 'context-menu-item has-submenu'
      }, [
        'Open with...',
        ['ul', {class: 'context-submenu'}, [
          ['li', {
            class: 'context-menu-item', dataset: {
              apppath: defaultApp.path
            }}, [
            defaultApp.name + ' (default)'
          ]],
          ['li', {class: 'context-menu-separator'}],
          ...apps.map((app) => {
            return /** @type {import('jamilih').JamilihArray} */ (['li', {
              class: 'context-menu-item', dataset: {
                apppath: app.path
              }}, [
              app.name
            ]]);
          })
        ]]
      ]]
    ], document.body);

    // Ensure main context menu is visible within viewport
    requestAnimationFrame(() => {
      const menuRect = customContextMenu.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Adjust horizontal position if needed
      if (menuRect.right > viewportWidth) {
        customContextMenu.style.left = (viewportWidth - menuRect.width - 10) + 'px';
      }
      if (menuRect.left < 0) {
        customContextMenu.style.left = '10px';
      }

      // Adjust vertical position if needed
      if (menuRect.bottom > viewportHeight) {
        customContextMenu.style.top = (viewportHeight - menuRect.height - 10) + 'px';
      }
      if (menuRect.top < 0) {
        customContextMenu.style.top = '10px';
      }
    });

    // const targetElement = e.target;

    // Hide the custom context menu when clicking anywhere else
    const hideCustomContextMenu = () => {
      // eslint-disable-next-line @stylistic/max-len -- Long
      // if (!customContextMenu.contains(/** @type {MouseEvent & {target: Node}} */ (ev).target) &&
      //   ev.target !== targetElement
      // ) {
      customContextMenu.style.display = 'none';
      document.removeEventListener('click', hideCustomContextMenu);
      document.removeEventListener('contextmenu', hideCustomContextMenu);
      // }
    };
    document.addEventListener('click', hideCustomContextMenu, {
      capture: true
    });
    document.addEventListener('contextmenu', hideCustomContextMenu, {
      capture: true
    });

    // Add functionality to submenu items
    const submenu = /** @type {HTMLElement|null} */ (
      customContextMenu.querySelector('.context-submenu')
    );
    if (submenu) {
      submenu.querySelectorAll('.context-menu-item').forEach((
        item, idx
      ) => {
        /** @type {HTMLElement} */
        const htmlItem = /** @type {HTMLElement} */ (item);
        const iconUrl = idx === 0
          ? defaultApp.image
          // @ts-expect-error We added it above
          : apps[idx - 1]?.image;

        // Only set background if we have a valid icon URL
        if (iconUrl && iconUrl.trim()) {
          htmlItem.style.setProperty(
            '--background',
            `url("${iconUrl}")`
          );
        }

        item.addEventListener('click', (ev) => {
          ev.stopPropagation();
          customContextMenu.style.display = 'none';
          const {apppath} = /** @type {HTMLElement} */ (item).dataset;
          if (!apppath) {
            return;
          }
          spawnSync('open', [
            '-a',
            apppath,
            pth
          ]);
        });
      });

      // Ensure submenu is visible horizontally by adjusting its position
      // Use mouseenter to check when submenu becomes visible
      const parentLi = submenu.parentElement;
      if (parentLi) {
        parentLi.addEventListener('mouseenter', () => {
          requestAnimationFrame(() => {
            // Get measurements BEFORE any adjustments
            const submenuRect = submenu.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            // Check if submenu actually overflows (is already visible but cut off)
            const actuallyOverflowsRight = submenuRect.right > viewportWidth;
            const actuallyOverflowsBottom = submenuRect.bottom > viewportHeight;

            // Handle horizontal overflow - only reposition submenu, never main menu
            if (actuallyOverflowsRight) {
              const parentRect = parentLi.getBoundingClientRect();
              const wouldFitOnLeft = parentRect.left - submenuRect.width >= 0;

              if (wouldFitOnLeft) {
                // Open to the left instead
                submenu.style.left = 'auto';
                submenu.style.right = '100%';
              } else {
                // Can't fit on left either, pin to right edge of viewport
                submenu.style.left = 'auto';
                submenu.style.right = '10px';
              }
            }

            // Handle vertical overflow - only reposition submenu, never main menu
            if (actuallyOverflowsBottom) {
              const parentRect = parentLi.getBoundingClientRect();
              const wouldFitOnTop = parentRect.top - submenuRect.height >= 0;

              if (wouldFitOnTop) {
                // Align to bottom of parent instead
                submenu.style.top = 'auto';
                submenu.style.bottom = '0';
              } else {
                // Can't fit on top either, pin to bottom edge of viewport
                submenu.style.top = 'auto';
                submenu.style.bottom = '10px';
              }
            }
          });
        });
      }
    }
  };

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
            dataset: {
              path: basePath + encodeURIComponent(title)
            },
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
            $on: {
              contextmenu
            },
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
    // preview () {
    //   return 'preview placeholder';
    // },
    animation () {
      // No-op to avoid need for timeouts and jarring redraws
    },
    // @ts-ignore Sometime bugginess
    current ($item /* , $cols */) {
      /**
       * @param {string} pth
       */
      const updateHistoryAndStickies = (pth) => {
        history.replaceState(
          null,
          '',
          location.pathname + '#path=' + encodeURIComponent(
            pth
          )
        );
        const saved = localStorage.getItem(`stickyNotes-${pth}`);
        stickyNotes.clear(({metadata}) => {
          return metadata.type === 'local';
        });
        if (saved) {
          stickyNotes.loadNotes(JSON.parse(saved));
          stickyNotes.notes.forEach((note) => {
            if (note.metadata.type === 'local') {
              addStickyInputListeners(note, pth);
            }
          });
        }
      };
      if (parentMap.has($item[0])) {
        updateHistoryAndStickies(parentMap.get($item[0]));
        const childElement = childMap.get($item[0]);
        if (childElement) {
          // Scroll the child item's parent column into view
          const column = childElement.closest('.miller-column');
          if (column) {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                column.scrollIntoView({
                  block: 'nearest',
                  inline: 'start'
                });
              });
            });
          }
        }
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

      updateHistoryAndStickies(currentPath);

      const childResult = readDirectory(currentPath);
      // console.log('childResult', childResult);

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
                encodeURIComponent(title),
              dataset: {
                path: childDirectory + '/' +
                  encodeURIComponent(title)
              }
              // href: '#path=' + childDirectory + '/' +
              //  encodeURIComponent(title)
            }, [
              title
            ]]
            : ['span', {
              $on: {
                contextmenu
              },
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
              item[0].scrollIntoView({
                block: 'start', inline: 'start'
              });
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
            anchors[0]?.scrollIntoView({
              block: 'start',
              inline: 'start'
            });
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

$('#create-sticky').addEventListener('click', () => {
  const pth = $columns.find(
    'li.miller-selected a, li.miller-selected span'
  ).last()[0]?.dataset?.path ?? '/';
  const note = stickyNotes.createNote({
    metadata: {type: 'local', path: pth},
    html: `Welcome to Sticky Notes!<br /><br />

This sticky will only appear when the currently selected file or folder is
chosen.<br /><br />

Click "Create sticky for current path" to create more notes.`,
    x: 100,
    y: 150
  });

  addStickyInputListeners(note, pth);
});

$('#create-global-sticky').addEventListener('click', () => {
  const note = stickyNotes.createNote({
    metadata: {type: 'global'},
    html: `Welcome to Sticky Notes!<br /><br />

This sticky will show regardless of whatever file or folder is selected.
<br /><br />

Click "Create global sticky" to create more notes.`,
    x: 150,
    y: 170
  });

  note.content.addEventListener('input', () => {
    const notes = stickyNotes.getAllNotes(({metadata}) => {
      return metadata.type === 'global';
    });
    localStorage.setItem(
      `stickyNotes-global`, JSON.stringify(notes)
    );
  });
});

// eslint-disable-next-line unicorn/prefer-top-level-await -- Not ESM
(async () => {
await addMillerColumnPlugin.default(jQuery, {stylesheets: ['@default']});
changePath();

const saved = localStorage.getItem('stickyNotes-global');
if (saved) {
  stickyNotes.clear(({metadata}) => {
    return metadata.type === 'global';
  });
  stickyNotes.loadNotes(JSON.parse(saved));
  stickyNotes.notes.forEach((note) => {
    if (note.metadata.type === 'global') {
      addStickyInputListenersGlobal(note);
    }
  });
}
})();
