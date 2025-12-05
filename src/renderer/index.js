/* eslint-disable promise/prefer-await-to-then,
  promise/catch-or-return -- Needed for performance */
import {jml} from 'jamilih';
import jQuery from 'jquery';
import addMillerColumnPlugin from 'miller-columns';
import {chunk} from './utils/array.js';
import {$, $$} from './utils/dom.js';
// eslint-disable-next-line no-shadow -- Importing storage as `localStorage`
import {localStorage} from './utils/storage.js';
import {getBasePath, readDirectory} from './utils/path.js';
import {getCurrentView} from './utils/view.js';
import {
  stickyNotes,
  addLocalStickyInputListeners,
  addGlobalStickyInputListeners
} from './stickyNotes/manager.js';
import {getClipboard, setClipboard} from './state/clipboard.js';
import {
  $columns,
  set$columns,
  isCreating
} from './state/flags.js';
import {
  pushUndo,
  performUndo as performUndoOp,
  performRedo as performRedoOp
} from './history/undoRedo.js';
import {
  deleteItem as deleteItemOp,
  copyOrMoveItem as copyOrMoveItemOp
} from './fileSystem/operations.js';
import {
  foldersWithPendingChanges as watcherFoldersWithPendingChanges,
  setupFileWatcher
} from './fileSystem/watcher.js';
import {on} from './events/eventBus.js';
import {startRename as startRenameOp} from './ui/rename.js';
import {
  createNewFolder as createNewFolderOp
} from './ui/folderCreation.js';
import {
  showFolderContextMenu as showFolderContextMenuOp,
  showFileContextMenu as showFileContextMenuOp
} from './ui/contextMenus.js';

// Get Node APIs from the preload script
const {
  fs: {
    mkdirSync, writeFileSync, existsSync, renameSync
  },
  path,
  // eslint-disable-next-line no-shadow -- Different process
  process,
  spawnSync,
  shell,
  getOpenWithApps,
  getAppIcons,
  getIconDataURLForFile
} = globalThis.electronAPI;

// Ensure jamilih uses the browser's DOM instead of jsdom
jml.setWindow(globalThis);

// Set up event bus listeners for decoupled module communication
on('pushUndo', (action) => {
  pushUndo(action);
});
on('refreshView', () => {
  changePath();
});


/**
 *
 * @returns {void}
 */
function changePath () {
  const view = getCurrentView();

  const currentBasePath = getBasePath();
  const basePath = view === 'icon-view' ? currentBasePath : '/';

  const localSaved = localStorage.getItem(`stickyNotes-local-${basePath}`);
  stickyNotes.clear(({metadata}) => {
    return metadata.type === 'local';
  });
  if (localSaved) {
    stickyNotes.loadNotes(JSON.parse(localSaved));
    stickyNotes.notes.forEach((note) => {
      if (note.metadata.type === 'local') {
        addLocalStickyInputListeners(note, basePath);
      }
    });
  }

  const result = readDirectory(basePath);
  addItems(result, basePath, currentBasePath);

  // Setup watcher for the current directory being viewed
  // (not basePath which could be / in list view)
  // During folder creation, skip entirely - the watcher stays alive
  // and will detect changes after isCreating becomes false
  if (isCreating) {
    return;
  }

  setupFileWatcher(currentBasePath);

  // In three-columns view, also set up watchers for all ancestor directories
  // to detect sibling changes
  if (view === 'three-columns') {
    let ancestorPath = path.dirname(currentBasePath);
    while (ancestorPath && ancestorPath !== '/' && ancestorPath !== '.') {
      setupFileWatcher(ancestorPath);
      const nextAncestor = path.dirname(ancestorPath);
      /* c8 ignore next 4 - Defensive break, unreachable because
         while condition exits when ancestorPath === '/' */
      if (nextAncestor === ancestorPath) {
        break;
      }
      ancestorPath = nextAncestor;
    }
  }
}

/**
 * @typedef {[isDir: boolean, childDir: string, title: string]} Result
 */

// Create wrapper functions that pass changePath
const performUndo = () => performUndoOp(changePath);
const performRedo = () => performRedoOp(changePath);

// Use imported references from watcher module
const foldersWithPendingChanges = watcherFoldersWithPendingChanges;

/**
 *
 * @param {Result[]} result
 * @param {string} basePath
 * @param {string} currentBasePath
 * @returns {void}
 */
function addItems (result, basePath, currentBasePath) {
  const view = getCurrentView();

  $('i').hidden = true;
  const ul = $('ul');
  while (ul.firstChild) {
    ul.firstChild.remove();
  }

  /**
   * @param {string} itemPath
   */
  const deleteItem = (itemPath) => {
    deleteItemOp(itemPath);
  };

  /**
   * @param {string} sourcePath
   * @param {string} targetDir
   * @param {boolean} isCopy
   */
  const copyOrMoveItem = (sourcePath, targetDir, isCopy) => {
    copyOrMoveItemOp(sourcePath, targetDir, isCopy);
  };

  /**
   * @param {string} folderPath
   */
  const createNewFolder = (folderPath) => {
    createNewFolderOp(
      {
        path,
        existsSync,
        mkdirSync,
        encodeURIComponentFn: encodeURIComponent,
        changePath,
        startRename
      },
      folderPath
    );
  };

  /**
   * @param {HTMLElement} [textElement]
   * @param {(() => void)} [onComplete] - Callback when rename completes
   */
  const startRename = (textElement, onComplete) => {
    startRenameOp(
      {
        path,
        jQuery,
        renameSync,
        decodeURIComponentFn: decodeURIComponent,
        changePath
      },
      textElement,
      onComplete
    );
  };

  // Expose for testing
  /* c8 ignore next 4 -- Test helper */
  if (typeof globalThis !== 'undefined') {
    /** @type {unknown} */ (globalThis).startRenameForTesting = startRename;
    /** @type {unknown} */ (globalThis).createNewFolderForTesting =
      createNewFolder;
  }

  /**
   * @param {Event} e
   */
  const folderContextmenu = (e) => {
    showFolderContextMenuOp(
      {
        jml,
        jQuery,
        path,
        shell,
        existsSync,
        writeFileSync,
        decodeURIComponentFn: decodeURIComponent,
        encodeURIComponentFn: encodeURIComponent,
        changePath,
        startRename,
        deleteItem
      },
      e
    );
  };

  /**
   * @param {Event} e
   */
  const contextmenu = async (e) => {
    await showFileContextMenuOp(
      {
        jml,
        shell,
        spawnSync,
        getOpenWithApps,
        getAppIcons,
        startRename,
        deleteItem
      },
      e
    );
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
            $on: {
              contextmenu: folderContextmenu
            },
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
          /* c8 ignore next -- url should be present */
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
            class: 'go-up-path',
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
        'table', {dataset: {basePath}},
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
    // Add keyboard support for icon-view
    const iconViewTable = $('table[data-base-path]');
    if (iconViewTable) {
      // Make table focusable
      iconViewTable.setAttribute('tabindex', '0');

      // Remove any existing keydown listeners to avoid duplicates
      const oldListener = iconViewTable._keydownListener;
      if (oldListener) {
        iconViewTable.removeEventListener('keydown', oldListener);
      }

      // Add drag-and-drop support to all cells
      const cells = iconViewTable.querySelectorAll('td.list-item');
      cells.forEach((cell) => {
        const cellEl = /** @type {HTMLElement} */ (cell);
        const link = cellEl.querySelector('a, span');
        if (link) {
          const linkEl = /** @type {HTMLElement} */ (link);
          const itemPath = linkEl.dataset.path;
          if (itemPath) {
            cellEl.setAttribute('draggable', 'true');

            cellEl.addEventListener('dragstart', (e) => {
              if (e.dataTransfer) {
                e.dataTransfer.effectAllowed = 'copyMove';
                e.dataTransfer.setData('text/plain', itemPath);
              }
            });

            // Only allow drop on folders
            if (linkEl.tagName === 'A') {
              cellEl.addEventListener('dragover', (e) => {
                e.preventDefault();
                if (e.dataTransfer) {
                  e.dataTransfer.dropEffect = e.altKey ? 'copy' : 'move';
                }
              });

              cellEl.addEventListener('drop', (e) => {
                e.preventDefault();
                const sourcePath = e.dataTransfer?.getData('text/plain');
                const targetPath = linkEl.dataset.path;
                if (sourcePath && targetPath) {
                  const targetDir = decodeURIComponent(targetPath);
                  copyOrMoveItem(sourcePath, targetDir, e.altKey);
                }
              });
            }
          }
        }
      });

      // Add new keydown listener
      const keydownListener = (e) => {
        // Cmd+Shift+N to create new folder
        if (e.metaKey && e.shiftKey && e.key === 'n') {
          e.preventDefault();
          /* c8 ignore next -- TS */
          const folderPath = iconViewTable.dataset.basePath || '/';
          createNewFolder(folderPath);

        // Cmd+C to copy selected item
        } else if (e.metaKey && e.key === 'c') {
          const selectedRow = iconViewTable.querySelector('tr.selected');
          if (selectedRow) {
            e.preventDefault();
            const selectedEl = /** @type {HTMLElement} */ (selectedRow);
            const itemPath = selectedEl.dataset.path;
            if (itemPath) {
              setClipboard({path: itemPath, isCopy: true});
            }
          }

        // Cmd+V to paste (copy) to current directory
        } else if (e.metaKey && e.key === 'v' && getClipboard()) {
          e.preventDefault();
          /* c8 ignore next -- TS */
          const targetDir = iconViewTable.dataset.basePath || '/';
          const clip = getClipboard();
          copyOrMoveItem(clip.path, targetDir, clip.isCopy);
          setClipboard(null);
        }
      };

      iconViewTable.addEventListener('keydown', keydownListener);
      // Store reference for cleanup
      // @ts-expect-error Custom property
      iconViewTable._keydownListener = keydownListener;

      // Focus the table for keyboard navigation
      requestAnimationFrame(() => {
        iconViewTable.focus();
      });
    }
    return;
  }

  const millerColumns = jQuery('div.miller-columns');
  const parentMap = new WeakMap();
  const childMap = new WeakMap();
  const columnsInstance = millerColumns.millerColumns({
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
        const saved = localStorage.getItem(`stickyNotes-local-${pth}`);
        stickyNotes.clear(({metadata}) => {
          return metadata.type === 'local';
        });
        if (saved) {
          stickyNotes.loadNotes(JSON.parse(saved));
          stickyNotes.notes.forEach((note) => {
            if (note.metadata.type === 'local') {
              addLocalStickyInputListeners(note, pth);
            }
          });
        }
      };
      // Minimal logging: diagnostics removed
      let needsRefresh = false;

      if (parentMap.has($item[0])) {
        const itemPath = parentMap.get($item[0]);

        // Check if this folder has pending changes
        const hasPendingChanges =
          itemPath && foldersWithPendingChanges.has(itemPath);

        if (hasPendingChanges) {
          // Pending changes detected; rebuild next

          // Clear the pending changes flag
          foldersWithPendingChanges.delete(itemPath);

          // Mark that we need to do a full refresh rebuild
          needsRefresh = true;

          // Clear plugin data from this item
          // (DOM cleanup will happen before addItem)
          const anchorEl = $item.children('a[title]')[0];
          if (anchorEl) {
            jQuery(anchorEl).removeData('miller-columns-child');
          }
          $item.removeData('miller-columns-ancestor');
          $item.removeClass('miller-columns-parent');

          // Clear caches for this specific item
          parentMap.delete($item[0]);
          childMap.delete($item[0]);

          // Fall through to force reload
        } else {
          // No pending changes - use normal cached behavior
          updateHistoryAndStickies(itemPath);

          const childElement = childMap.get($item[0]);
          if (childElement) {
            // Scroll the child item's parent column into view
            const column = childElement.closest('.miller-column');
            if (column) {
              // Skip scrollIntoView during rename to preserve scroll
              if (!isCreating) {
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
          }
          return;
        }
      }

      // If we reach here, either:
      // 1. Item wasn't in parentMap (fresh load)
      // 2. Item had pending changes (need to reload)

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

      // Minimal logging

      updateHistoryAndStickies(currentPath);

      // Check if this folder has pending changes and remove from tracking
      const hasPendingChanges2 =
        foldersWithPendingChanges.has(currentPath);
      /* c8 ignore next 3 -- Just cleanup */
      if (hasPendingChanges2) {
        foldersWithPendingChanges.delete(currentPath);
      }

      const childResult = readDirectory(currentPath);
      // Minimal logging

      const childItems = childResult.map(([
        isDir, childDirectory, title
      ]) => {
        const width = '25px';
        const paddingRightLeft = '30px';
        const marginTopBottom = '18px';
        const li = jml('li', {class: 'list-item'}, [
          isDir
            ? ['a', {
              title: childDirectory + '/' +
                encodeURIComponent(title),
              $on: {
                contextmenu: folderContextmenu
              },
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
              /* c8 ignore next -- Should be found */
              : ''
          );
          return undefined;
        });

        return li;
      });

      // Build children - use refreshChildren for refresh, addItem for fresh
      if (needsRefresh && $columns.refreshChildren &&
          typeof $columns.refreshChildren === 'function') {
        // For refresh: use refreshChildren to replace children properly
        $columns.refreshChildren(
          $item,
          childItems.map((item) => jQuery(item))
        );

        if (childItems.length > 0) {
          childMap.set($item[0], childItems[0]);
          // Skip scrollIntoView during rename to preserve scroll restoration
          if (!isCreating) {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                childItems[0].scrollIntoView({
                  block: 'start', inline: 'start'
                });
              });
            });
          }
        }
      } else if ($columns.addItem && typeof $columns.addItem === 'function') {
        // Normal addItem path for first-time navigation
        const addItemFn = $columns.addItem;

        childItems.forEach((childItem, idx) => {
          const item = addItemFn.call($columns, jQuery(childItem), $item);

          if (idx === 0) {
            childMap.set($item[0], item[0]);
            // Skip scrollIntoView during rename to preserve scroll restoration
            if (!isCreating) {
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  item[0].scrollIntoView({
                    block: 'start', inline: 'start'
                  });
                });
              });
            }
          }
        });
      }

      // CRITICAL: Update parentMap after building children
      // This ensures subsequent navigation will hit the cache path
      parentMap.set($item[0], currentPath);

      // Set up watcher for this expanded folder in miller columns view
      const currentView = getCurrentView();
      if (currentView === 'three-columns') {
        setupFileWatcher(currentPath);

        // Also set up watchers for all ancestor directories to detect
        // sibling changes
        let ancestorPath = path.dirname(currentPath);
        while (ancestorPath && ancestorPath !== '/' && ancestorPath !== '.') {
          setupFileWatcher(ancestorPath);
          const nextAncestor = path.dirname(ancestorPath);
          /* c8 ignore next 3 -- Defensive */
          if (nextAncestor === ancestorPath) {
            break;
          }
          ancestorPath = nextAncestor;
        }
      }
    }
  });

  set$columns(columnsInstance);

  $columns.on('dblclick', (e) => {
    if (e.target.dataset.path) {
      shell.openPath(e.target.dataset.path);
    }
  });
  $columns.on('keydown', (e) => {
    const selectedLi = $columns.find('li.miller-selected').last();
    const pth = selectedLi.find('span, a')[0]?.dataset?.path;

    if (e.metaKey && e.key === 'o' && pth) {
      shell.openPath(pth);
    }

    // Cmd+Delete to delete selected item
    if (e.metaKey && e.key === 'Backspace' && pth) {
      e.preventDefault();
      deleteItem(pth);
    }

    // Cmd+Shift+N to create new folder
    if (e.metaKey && e.shiftKey && e.key === 'n') {
      e.preventDefault();

      // Determine the folder path based on current selection
      let folderPath = '/';
      if (selectedLi.length) {
        const anchor = selectedLi.find('a[title]');
        if (anchor.length && anchor[0].dataset.path) {
          // If selected item is a folder, create inside it
          folderPath = decodeURIComponent(anchor[0].dataset.path);
        } else {
          // If selected item is a file, create in its parent folder
          const span = selectedLi.find('span[title]');
          if (span.length && span[0].dataset.path) {
            folderPath = path.dirname(decodeURIComponent(span[0].dataset.path));
          }
        }
      }

      createNewFolder(folderPath);
    }

    // Enter key to rename
    if (e.key === 'Enter' && selectedLi.length) {
      e.preventDefault();
      const textElement = selectedLi.find('span, a')[0];
      if (textElement) {
        startRename(textElement);
      }
    }
  });

  // Context menu for empty areas in column panes
  $columns.on('contextmenu', (e) => {
    e.preventDefault();

    // Remove any existing context menus
    /* c8 ignore next 4 -- Defensive cleanup; event listeners
       should remove menus before this runs */
    for (const menu of $$('.context-menu')) {
      menu.remove();
    }

    // Find which column was clicked and get its path
    const columnElement = /** @type {HTMLElement} */ (e.target);
    const prevColumn = jQuery(columnElement).prevAll(
      'ul.miller-column:not(.miller-collapse)'
    ).first();
    const selectedInPrev = prevColumn.find('li.miller-selected');

    let folderPath = '/';
    if (selectedInPrev.length) {
      const anchor = selectedInPrev.find('a[title]');
      if (anchor.length && anchor[0].dataset.path) {
        folderPath = decodeURIComponent(anchor[0].dataset.path);
      }
    }

    const customContextMenu = jml('ul', {
      class: 'context-menu',
      style: {
        left: e.pageX + 'px',
        top: e.pageY + 'px'
      }
    }, [
      ['li', {
        class: 'context-menu-item',
        $on: {
          click () {
            customContextMenu.remove();
            createNewFolder(folderPath);
          }
        }
      }, [
        'Create new folder'
      ]]
    ], document.body);

    // Ensure main context menu is visible within viewport
    requestAnimationFrame(() => {
      const menuRect = customContextMenu.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Adjust horizontal position if needed
      if (menuRect.right > viewportWidth) {
        customContextMenu.style.left =
          (viewportWidth - menuRect.width - 10) + 'px';
      }

      /* c8 ignore next 4 -- Defensive as context menus should
         be at positive pageX/pageY coordinates */
      if (menuRect.left < 0) {
        customContextMenu.style.left = '10px';
      }

      // Adjust vertical position if needed
      if (menuRect.bottom > viewportHeight) {
        customContextMenu.style.top =
          (viewportHeight - menuRect.height - 10) + 'px';
      }
      /* c8 ignore next 4 -- Defensive as context menus should
         be at positive pageX/pageY coordinates */
      if (menuRect.top < 0) {
        customContextMenu.style.top = '10px';
      }
    });

    // Hide the custom context menu when clicking anywhere else
    const hideCustomContextMenu = () => {
      customContextMenu.remove();
      document.removeEventListener('click', hideCustomContextMenu);
      document.removeEventListener('contextmenu', hideCustomContextMenu);
    };
    document.addEventListener('click', hideCustomContextMenu, {
      capture: true
    });
    document.addEventListener('contextmenu', hideCustomContextMenu, {
      capture: true
    });
  });

  if (currentBasePath !== '/') {
    currentBasePath.split('/').slice(1).forEach(
      (pathSegment, idx) => {
        /* c8 ignore next 3 -- Guard for poorly formed paths */
        if (pathSegment === '/') {
          return;
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
      }
    );
  }

  // Ensure the miller-columns container is focusable and
  //   focused for keyboard navigation
  if (view === 'three-columns') {
    requestAnimationFrame(() => {
      const millerColumnsDiv = $('div.miller-columns');
      if (millerColumnsDiv) {
        millerColumnsDiv.setAttribute('tabindex', '0');
        millerColumnsDiv.focus();

        // Add keyboard shortcuts for miller columns
        const keydownListener = (e) => {
          // Cmd+Shift+N to create new folder
          if (e.metaKey && e.shiftKey && e.key === 'n') {
            e.preventDefault();
            const selected = millerColumnsDiv.querySelector(
              '.list-item.selected a'
            );
            if (selected) {
              const selectedEl = /** @type {HTMLElement} */ (selected);
              const folderPath = selectedEl.dataset.path;
              if (folderPath) {
                createNewFolder(decodeURIComponent(folderPath));
              }
            }
          // Cmd+C to copy selected item
          } else if (e.metaKey && e.key === 'c') {
            const selected = millerColumnsDiv.querySelector(
              '.list-item.selected a, .list-item.selected span'
            );
            if (selected) {
              e.preventDefault();
              const selectedEl = /** @type {HTMLElement} */ (selected);
              const itemPath = selectedEl.dataset.path;
              if (itemPath) {
                setClipboard({path: itemPath, isCopy: true});
              }
            }
          // Cmd+V to paste to the currently displayed folder
          } else if (e.metaKey && e.key === 'v' && getClipboard()) {
            e.preventDefault();
            const currentPath = getBasePath();
            const clip = getClipboard();
            copyOrMoveItem(clip.path, currentPath, clip.isCopy);
            setClipboard(null);
          }
        };

        // Remove any existing keydown listeners to avoid duplicates
        const oldListener = millerColumnsDiv._keydownListener;
        if (oldListener) {
          millerColumnsDiv.removeEventListener('keydown', oldListener);
        }
        millerColumnsDiv.addEventListener('keydown', keydownListener);
        // @ts-expect-error Custom property
        millerColumnsDiv._keydownListener = keydownListener;

        // Add drag-and-drop support to all list items
        const columnListItems = millerColumnsDiv.querySelectorAll(
          '.list-item'
        );
        columnListItems.forEach((item) => {
          const itemEl = /** @type {HTMLElement} */ (item);
          const link = itemEl.querySelector('a, span');
          if (link) {
            const linkEl = /** @type {HTMLElement} */ (link);
            const itemPath = linkEl.dataset.path;
            if (itemPath) {
              itemEl.setAttribute('draggable', 'true');

              itemEl.addEventListener('dragstart', (e) => {
                if (e.dataTransfer) {
                  e.dataTransfer.effectAllowed = 'copyMove';
                  e.dataTransfer.setData('text/plain', itemPath);
                }
              });

              // Only allow drop on folders (a elements)
              if (linkEl.tagName === 'A') {
                itemEl.addEventListener('dragover', (e) => {
                  e.preventDefault();
                  if (e.dataTransfer) {
                    e.dataTransfer.dropEffect = e.altKey ? 'copy' : 'move';
                  }
                });

                itemEl.addEventListener('drop', (e) => {
                  e.preventDefault();
                  const sourcePath = e.dataTransfer?.getData('text/plain');
                  const targetPath = linkEl.dataset.path;
                  if (sourcePath && targetPath) {
                    const targetDir = decodeURIComponent(targetPath);
                    copyOrMoveItem(sourcePath, targetDir, e.altKey);
                  }
                });
              }
            }
          }
        });
      }
    });
  }
}

globalThis.addEventListener('hashchange', changePath);

// Add global keyboard handler for undo/redo
document.addEventListener('keydown', (e) => {
  // Only handle if not typing in an input field
  const {target} = e;
  const el = /** @type {Element} */ (target);
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
    return;
  }

  // Cmd+Z for undo
  if (e.metaKey && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    performUndo();
  } else if (e.metaKey && e.shiftKey && e.key === 'z') {
    // Cmd+Shift+Z for redo
    e.preventDefault();
    performRedo();
  }
});

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

const view = getCurrentView();
switch (view) {
case 'three-columns':
case 'icon-view':
  $('#' + view).classList.add('selected');
  break;
/* c8 ignore next 3 -- Guard */
default:
  throw new Error('Unrecognized view');
}

$('#filebrowser').title = `
    We are using Node.js ${process.versions.node},
    Chromium ${process.versions.chrome},
    and Electron ${process.versions.electron}.
`;

$('#create-sticky').addEventListener('click', () => {
  const currentView = getCurrentView();
  const pth = currentView === 'icon-view'
    ? jQuery('table[data-base-path]').attr('data-base-path')
    : ($columns && $columns.find(
      'li.miller-selected a, li.miller-selected span'
    /* c8 ignore next 2 -- When tested alone, appears to be
       covered by test that checks 2403, but not when testing together */
    ).last()[0]?.dataset?.path) ?? '/';
  const note = stickyNotes.createNote({
    metadata: {type: 'local', path: pth},
    html: `Welcome to Sticky Notes!<br /><br />

This sticky will only appear when the currently selected file or folder is
chosen.<br /><br />

Click "Create sticky for current path" to create more notes.`,
    x: 100,
    y: 150
  });

  addLocalStickyInputListeners(note, pth);
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

  addGlobalStickyInputListeners(note);
});

// eslint-disable-next-line @stylistic/max-len -- Long
// eslint-disable-next-line unicorn/prefer-top-level-await -- Will be IIFE-exported
(async () => {
// We can't use `@default` for CSS path, so we've copied it out
await addMillerColumnPlugin(jQuery, {stylesheets: ['miller-columns.css']});
changePath();

const saved = localStorage.getItem('stickyNotes-global');
if (saved) {
  stickyNotes.clear(({metadata}) => {
    /* c8 ignore next -- Just a guard as stickies shouldn't exist on load */
    return metadata.type === 'global';
  });
  stickyNotes.loadNotes(JSON.parse(saved));
  stickyNotes.notes.forEach((note) => {
    if (note.metadata.type === 'global') {
      addGlobalStickyInputListeners(note);
    }
  });
}
})();
