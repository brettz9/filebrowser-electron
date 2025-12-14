/* eslint-disable promise/prefer-await-to-then,
  n/no-sync,
  promise/catch-or-return -- Needed for performance */
import {jml} from 'jamilih';
import jQuery from 'jquery';
import addMillerColumnPlugin from 'miller-columns';
import {filesize} from 'filesize';
import {chunk} from './utils/array.js';
import {$, $$, middleEllipsis} from './utils/dom.js';
// eslint-disable-next-line no-shadow -- Importing storage as `localStorage`
import {localStorage} from './utils/storage.js';
import {getBasePath, readDirectory} from './utils/path.js';
import {getCurrentView} from './utils/view.js';
import {getFormattedDate} from './utils/date.js';
import {
  stickyNotes,
  addLocalStickyInputListeners,
  addGlobalStickyInputListeners
} from './stickyNotes/manager.js';
import {getMacAppCategory, isMacApp} from './macApp/macApp.js';
import {getClipboard, setClipboard} from './state/clipboard.js';
import {
  $columns,
  set$columns,
  isCreating,
  getIsCopyingOrMoving
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
import {showInfoWindow} from './ui/infoWindow.js';
import {openNewTerminalWithCommand} from './terminal/terminal.js';

// Expose stickyNotes globally for testing
globalThis.stickyNotes = stickyNotes;

// Get Node APIs from the preload script
const {
  fs: {
    mkdirSync, writeFileSync, existsSync, renameSync, lstatSync, readFileSync
  },
  path,
  // eslint-disable-next-line no-shadow -- Different process
  process,
  spawnSync,
  shell,
  getOpenWithApps,
  getAppIcons,
  getIconDataURLForFile,
  getFileKind,
  getFileMetadata
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

// Track if a drag is in progress and the dragged element
let isDragging = false;
let currentDraggedElement = null;
let escapeUsedForDragCancel = false;
let mouseIsDown = false;
let hoverOpenTimer = null;
let currentHoverTarget = null;

// Track mouse button state globally
document.addEventListener('mousedown', () => {
  mouseIsDown = true;
}, true);

document.addEventListener('mouseup', () => {
  mouseIsDown = false;
  // Reset escape flag when mouse is released
  escapeUsedForDragCancel = false;
}, true);

// Set up escape key handler EARLY to ensure it runs before miller-columns
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isDragging) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    escapeUsedForDragCancel = true;
    // Setting dropEffect to 'none' cancels the drag
    if (currentDraggedElement) {
      // Trigger dragend by removing draggable temporarily
      currentDraggedElement.setAttribute('draggable', 'false');
      /* c8 ignore next 5 -- setTimeout executes after null assignment */
      setTimeout(() => {
        if (currentDraggedElement) {
          currentDraggedElement.setAttribute('draggable', 'true');
        }
      }, 0);
    }
    isDragging = false;
    currentDraggedElement = null;
    // Clean up any drag-over highlights
    document.querySelectorAll('.drag-over').forEach((elem) => {
      elem.classList.remove('drag-over');
    });
    return;
  }

  // Block Escape if used for drag cancel OR if mouse is still down
  if (e.key === 'Escape' && (escapeUsedForDragCancel || mouseIsDown)) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }
}, true); // Use capture phase to run before other handlers

// Reset escape flag when key released (but keep blocking if mouse down)
document.addEventListener('keyup', (e) => {
  if (e.key === 'Escape' && !mouseIsDown) {
    escapeUsedForDragCancel = false;
  }
}, true);

/**
 * Add drag-and-drop support to an element.
 * @param {HTMLElement} element - The element to make draggable
 * @param {string} itemPath - The path of the item
 * @param {boolean} isFolder - Whether the item is a folder
 * @returns {void}
 */
function addDragAndDropSupport (element, itemPath, isFolder) {
  // Prevent duplicate listener registration
  if (element.dataset.dragEnabled) {
    return;
  }
  element.dataset.dragEnabled = 'true';

  // Make the entire list item draggable (so icon area is draggable too)
  element.setAttribute('draggable', 'true');

  element.addEventListener('dragstart', (e) => {
    isDragging = true;
    currentDraggedElement = element;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'copyMove';
      e.dataTransfer.setData('text/plain', itemPath);
    }
  });

  element.addEventListener('dragend', () => {
    isDragging = false;
    currentDraggedElement = null;
    // Clean up any lingering drag-over classes
    document.querySelectorAll('.drag-over').forEach((el) => {
      el.classList.remove('drag-over');
    });
    // Clear hover-to-open timer
    /* c8 ignore next 4 -- Cleanup on drag end, difficult to test reliably */
    if (hoverOpenTimer) {
      clearTimeout(hoverOpenTimer);
      hoverOpenTimer = null;
    }
    currentHoverTarget = null;
  });

  // Determine if this is an executable file (bash or JavaScript)
  const decodedPath = decodeURIComponent(itemPath);
  const ext = path.extname(decodedPath).toLowerCase();
  const isExecutableFile = !isFolder &&
    (ext === '.sh' || ext === '.js' || ext === '.cjs' || ext === '.mjs');

  // Allow drop on folders or executable files
  if (isFolder || isExecutableFile) {
    const dropTarget = element;
    dropTarget.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropTarget.classList.add('drag-over');
      // For executable files, show copy effect to indicate execution
      e.dataTransfer.dropEffect = isExecutableFile
        ? 'copy'
        : (e.altKey ? 'copy' : 'move');

      // Set up hover-to-open timer only for folders
      if (isFolder && currentHoverTarget !== dropTarget) {
        // Clear any existing timer
        /* c8 ignore next 3 -- Defensive cleanup */
        if (hoverOpenTimer) {
          clearTimeout(hoverOpenTimer);
        }

        currentHoverTarget = dropTarget;

        /* c8 ignore next 6 -- Hover-to-open requires 1s delay,
           impractical to test */
        // Set timer to open folder after 1 second of hovering
        hoverOpenTimer = setTimeout(() => {
          // Navigate into the folder
          const navPath = decodeURIComponent(itemPath);
          globalThis.location.hash = `#path=${encodeURIComponent(
            navPath
          )}`;
        }, 1000);
      }
    });

    dropTarget.addEventListener('dragleave', (e) => {
      // Only remove if actually leaving the element (not entering a child)
      const rect = dropTarget.getBoundingClientRect();
      const x = e.clientX;
      const y = e.clientY;
      /* c8 ignore next 2 -- Not covering >= rect.right/bottom */
      if (x < rect.left || x >= rect.right ||
          y < rect.top || y >= rect.bottom) {
        dropTarget.classList.remove('drag-over');

        // Clear hover-to-open timer when leaving
        if (currentHoverTarget === dropTarget) {
          if (hoverOpenTimer) {
            clearTimeout(hoverOpenTimer);
            hoverOpenTimer = null;
          }
          currentHoverTarget = null;
        }
      }
    });

    dropTarget.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation(); // Prevent bubbling to parent drop handlers
      dropTarget.classList.remove('drag-over');

      // Clear hover-to-open timer on drop
      if (hoverOpenTimer) {
        clearTimeout(hoverOpenTimer);
        hoverOpenTimer = null;
      }
      currentHoverTarget = null;

      const sourcePath = e.dataTransfer?.getData('text/plain');

      if (isExecutableFile && sourcePath) {
        // Execute the file with the dropped file/folder as argument
        const targetScriptPath = decodeURIComponent(itemPath);
        const sourcePathDecoded = decodeURIComponent(sourcePath);

        try {
          if (ext === '.sh') {
            // Execute bash script
            openNewTerminalWithCommand(
              'bash', targetScriptPath, sourcePathDecoded
            );
          } else {
            // Execute JavaScript file with node
            openNewTerminalWithCommand(
              'node', targetScriptPath, sourcePathDecoded
            );
          }
        /* c8 ignore next 8 -- Error handling for script execution failures */
        } catch (err) {
          // eslint-disable-next-line no-console -- User feedback
          console.error('Failed to execute script:', err);
          // eslint-disable-next-line no-alert -- User feedback
          alert(`Failed to execute script: ${
            (/** @type {Error} */ (err)).message
          }`);
        }
      } else if (isFolder) {
        // Folder drop: copy or move
        const targetPath = itemPath;
        if (sourcePath && targetPath && !getIsCopyingOrMoving()) {
          copyOrMoveItemOp(sourcePath, targetPath, e.altKey);
        }
      }
    });
  }
}

/**
 * Update breadcrumbs for navigation.
 * @param {string} currentPath - The current path to display
 * @returns {void}
 */
function updateBreadcrumbs (currentPath) {
  const breadcrumbsDiv = $('.miller-breadcrumbs');
  /* c8 ignore next 3 -- Defensive: breadcrumbs div always exists */
  if (!breadcrumbsDiv) {
    return;
  }

  // Clear existing breadcrumbs
  breadcrumbsDiv.innerHTML = '';

  // Split path into segments
  const segments = currentPath === '/'
    ? []
    : currentPath.split('/').filter(Boolean);

  // Create root breadcrumb
  jml('span', {
    class: 'miller-breadcrumb miller-breadcrumb-root',
    $on: {
      click () {
        globalThis.location.hash = '#path=/';
      }
    }
  }, ['/'], breadcrumbsDiv);

  // Create breadcrumb for each segment
  let accumulatedPath = '';
  segments.forEach((segment) => {
    accumulatedPath += '/' + segment;
    const segmentPath = accumulatedPath;
    jml('span', {
      class: 'miller-breadcrumb',
      $on: {
        click () {
          globalThis.location.hash =
            `#path=${encodeURIComponent(segmentPath)}`;
        }
      }
    }, [decodeURIComponent(segment)], breadcrumbsDiv);
  });
}


/**
 *
 * @returns {void}
 */
function changePath () {
  const view = getCurrentView();

  const currentBasePath = getBasePath();

  // Todo: Column view should, if clicked on breadcrumbs or such, be able to
  //         start from a non-root path as with other views
  const basePath = view === 'column-view' ? '/' : currentBasePath;

  // Save scroll positions of selected items before refresh
  const scrollPositions = new Map();
  if (view === 'three-columns') {
    const selectedItems = $$('.miller-columns li.miller-selected');
    selectedItems.forEach((item) => {
      const link = item.querySelector('a[data-path], span[data-path]');
      if (link) {
        const dataPath = link.dataset.path;
        const column = item.closest('ul.miller-column');
        if (column && dataPath) {
          // Get the column index to identify it after refresh
          const allColumns = $$('.miller-column');
          const columnIndex = [...allColumns].indexOf(column);

          // Calculate position within the scrollable area
          // offsetTop is relative to the column's content
          // scrollTop is how much we've scrolled
          // The item's position in the viewport is: offsetTop - scrollTop
          const viewportPosition = item.offsetTop - column.scrollTop;

          scrollPositions.set(dataPath, {
            columnIndex,
            viewportPosition,
            columnScrollTop: column.scrollTop
          });
        }
      }
    });
  }

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

  // Restore scroll positions after refresh
  if (view === 'three-columns' && scrollPositions.size > 0) {
    // Use triple requestAnimationFrame to run after the path navigation
    // scrollIntoView calls (which use double requestAnimationFrame)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const allLinks = $$('a[data-path], span[data-path]');

          scrollPositions.forEach((savedPosition, dataPath) => {
            // Find by direct comparison since CSS.escape breaks on paths
            const link = allLinks.find((l) => l.dataset.path === dataPath);

            if (link) {
              const item = link.closest('li');
              const column = link.closest('ul.miller-column');

              // Verify we're in the same column by index
              const allColumns = $$('.miller-column');
              const columnIndex = [...allColumns].indexOf(column);

              if (item && column &&
                  columnIndex === savedPosition.columnIndex) {
                // To maintain the same viewport position:
                // We want: newOffsetTop - newScrollTop = viewportPosition
                // So: newScrollTop = newOffsetTop - viewportPosition
                const targetScrollTop =
                  item.offsetTop - savedPosition.viewportPosition;

                // Clamp to valid scroll range
                // (can't scroll negative or beyond content)
                const maxScroll = column.scrollHeight - column.clientHeight;
                const newScrollTop =
                  Math.max(0, Math.min(targetScrollTop, maxScroll));

                // Adjust scroll to maintain the same visual position
                column.scrollTop = newScrollTop;
              }
            }
          });
        });
      });
    });
  }

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

let allowHistoryUpdates = true;
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
  /* c8 ignore next 6 -- Test helper */
  if (typeof globalThis !== 'undefined') {
    /** @type {unknown} */ (globalThis).startRenameForTesting = startRename;
    /** @type {unknown} */ (globalThis).createNewFolderForTesting =
      createNewFolder;
    /** @type {unknown} */ (globalThis).copyOrMoveItemForTesting =
      copyOrMoveItem;
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
        deleteItem,
        getClipboard,
        setClipboard,
        copyOrMoveItem,
        showInfoWindow
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
        deleteItem,
        getClipboard,
        setClipboard,
        copyOrMoveItem,
        path,
        showInfoWindow
      },
      e
    );
  };

  const listItems = result.map(([
    isDir,
    childDir,
    title
  ]) => {
    const fileOrFolder = isDir
      ? jml('a', {
        title: basePath + encodeURIComponent(title),
        $on: {
          contextmenu: folderContextmenu
        },
        dataset: {
          path: basePath + encodeURIComponent(title)
        },
        ...(view === 'icon-view' || view === 'gallery-view'
          ? {
            href: '#path=' + basePath + encodeURIComponent(title)
          }
          : {})
      }, [
        title
      ])
      : jml(view === 'icon-view' || view === 'gallery-view' ? 'p' : 'span', {
        title: basePath + encodeURIComponent(title),
        $on: {
          contextmenu
        },
        dataset: {
          path: basePath + encodeURIComponent(title)
        }
      }, [title]);

    const li = jml(
      view === 'icon-view' || view === 'gallery-view' ? 'td' : 'li',
      {
        class: 'list-item' + (view === 'icon-view' || view === 'gallery-view'
          ? ' icon-container'
          : ''),
        $on: {
          ...(view === 'icon-view' || view === 'gallery-view'
            ? {
              click: [function (e) {
                e.preventDefault();
                // Remove previous selection
                const prevSelected =
                  this.parentElement.parentElement.querySelector(
                    'td.list-item.selected'
                  );
                if (prevSelected) {
                  prevSelected.classList.remove('selected');
                }
                this.classList.add('selected');
              }, true],
              dblclick: [function () {
                location.href = this.querySelector('a').href;
              }, true]
            }
            : {}
          )
        }
      }, [
        view === 'icon-view' || view === 'gallery-view'
          ? [
            'img', {
              class: 'icon',
              dataset: {
                path: basePath + encodeURIComponent(title)
              }
            }
          ]
          : '',
        fileOrFolder
      ]
    );

    // Store the path for later icon loading (after plugin init)
    const dataPath = basePath + encodeURIComponent(title);
    li.dataset.iconPath = dataPath;

    const method = view === 'icon-view' || view === 'gallery-view'
      ? async () => {
        if (isDir) {
          return await getIconDataURLForFile(
            path.join(childDir, title)
          );
        }

        return await globalThis.electronAPI.getFileThumbnail(
          path.join(childDir, title), 256
        ) || await getIconDataURLForFile(
          path.join(childDir, title)
        );
      }
      : async () => {
        return await getIconDataURLForFile(
          path.join(childDir, title)
        );
      };

    method().then((url) => {
      // Find the actual element in the DOM (plugin may have cloned it)
      if (view === 'three-columns') {
        const actualElement = document.querySelector(
          `a[data-path="${CSS.escape(dataPath)}"], span[data-path="${
            CSS.escape(dataPath)
          }"]`
        )?.parentElement;

        if (actualElement) {
          actualElement.setAttribute(
            'style',
            url
              ? `background-image: url(${
                url
              })`
              /* c8 ignore next -- url should be present */
              : ''
          );
        }
      } else if (view === 'icon-view' || view === 'gallery-view') {
        const actualElement = document.querySelector(
          `img[data-path="${CSS.escape(dataPath)}"]`
        );
        actualElement.src = url;
        middleEllipsis([fileOrFolder]);
      }
      return undefined;
    });

    return li;
  });

  const numIconColumns = 4;

  jml(ul, [
    ((view === 'icon-view' || view === 'gallery-view') && basePath !== '/'
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
    ...(view === 'icon-view' || view === 'gallery-view'
      ? /** @type {import('jamilih').JamilihArray[]} */ ([[
        'table', {dataset: {basePath}},
        view === 'gallery-view'
          ? [
            ['tr', listItems]
          ]
          : chunk(listItems, numIconColumns).map((innerArr) => {
            return ['tr', innerArr];
          })
      ]])
      : listItems)
  ]);

  if ($columns?.destroy) {
    $columns.destroy();
    if (view === 'icon-view' || view === 'gallery-view') {
      changePath();
    }
  }

  if (view === 'icon-view' || view === 'gallery-view') {
    // Update breadcrumbs for icon view
    updateBreadcrumbs(currentBasePath);

    // Add keyboard support for icon-view and gallery-view
    const iconViewTable = $('table[data-base-path]');
    /* c8 ignore next 3 -- Unreachable: always returns above */
    if (!iconViewTable) {
      return;
    }

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
          const isFolder = linkEl.tagName === 'A';
          addDragAndDropSupport(cellEl, itemPath, isFolder);
        }
      }

      // Remove old click handler if it exists
      const oldClickHandler = cellEl._clickHandler;
      if (oldClickHandler) {
        cellEl.removeEventListener('click', oldClickHandler);
      }

      // Add click handler for selection
      const clickHandler = (e) => {
        // Don't interfere with link navigation
        /* c8 ignore next 4 -- Defensive guard, event on cell */
        if (e.target !== cellEl &&
            !cellEl.contains(/** @type {Node} */ (e.target))) {
          return;
        }

        // Remove previous selection
        const prevSelected = iconViewTable.querySelector(
          'td.list-item.selected'
        );
        if (prevSelected) {
          prevSelected.classList.remove('selected');
        }

        // Add selection to clicked cell
        cellEl.classList.add('selected');
      };
      cellEl.addEventListener('click', clickHandler);
      // @ts-expect-error Custom property
      cellEl._clickHandler = clickHandler;

      // Remove old dblclick handler if it exists
      const oldDblclickHandler = cellEl._dblclickHandler;
      if (oldDblclickHandler) {
        cellEl.removeEventListener('dblclick', oldDblclickHandler);
      }

      // Add double-click handler to open folders/files
      const dblclickHandler = (e) => {
        e.preventDefault();
        const anchor = cellEl.querySelector('a');
        const span = cellEl.querySelector('p,span');

        if (anchor) {
          // It's a folder - navigate into it
          anchor.click();
        } else if (span) {
          // It's a file - open with default application
          const itemPath = span.dataset?.path;
          if (itemPath) {
            const decodedPath = decodeURIComponent(itemPath);
            // @ts-expect-error - Test hook
            if (globalThis.testShellOpenPath) {
              // @ts-expect-error - Test hook
              globalThis.testShellOpenPath(decodedPath);
            /* c8 ignore next 3 -- Test hook bypasses this path */
            } else {
              globalThis.electronAPI.shell.openPath(decodedPath);
            }
          }
        }
      };
      cellEl.addEventListener('dblclick', dblclickHandler);
      // @ts-expect-error Custom property
      cellEl._dblclickHandler = dblclickHandler;
    });

    // Add new keydown listener
    let typeaheadBuffer = '';
    let typeaheadTimeout = null;

    const keydownListener = (e) => {
      // Handle arrow key navigation
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(
        e.key
      )) {
        e.preventDefault();
        const selectedCell = iconViewTable.querySelector(
          'td.list-item.selected'
        );
        const allCells = [...iconViewTable.querySelectorAll('td.list-item')];

        /* c8 ignore next 3 -- Icon view always has cells */
        if (allCells.length === 0) {
          return;
        }

        const currentIndex = selectedCell
          ? allCells.indexOf(selectedCell)
          : -1;
        let newIndex = currentIndex;

        // Calculate number of columns
        const firstRow = iconViewTable.querySelector('tr');
        const numColumns = firstRow
          ? firstRow.querySelectorAll('td.list-item').length
          /* c8 ignore next -- Defensive: table always has rows */
          : numIconColumns;

        switch (e.key) {
        case 'ArrowRight':
          newIndex = currentIndex + 1;
          break;
        case 'ArrowLeft':
          newIndex = currentIndex - 1;
          break;
        case 'ArrowDown':
          newIndex = currentIndex + numColumns;
          break;
        case 'ArrowUp':
          newIndex = currentIndex - numColumns;
          break;
        /* c8 ignore next 2 -- Already filtered by if statement */
        default:
          break;
        }

        // Clamp to valid range
        if (newIndex >= 0 && newIndex < allCells.length) {
          if (selectedCell) {
            selectedCell.classList.remove('selected');
          }
          const newCell = allCells[newIndex];
          newCell.classList.add('selected');
          newCell.scrollIntoView({block: 'nearest', inline: 'nearest'});
        }
        return;
      }

      // Handle typeahead search
      if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();

        // Clear existing timeout
        if (typeaheadTimeout) {
          clearTimeout(typeaheadTimeout);
        }

        // Add character to buffer
        typeaheadBuffer += e.key.toLowerCase();

        // Find matching item
        const allCells = [...iconViewTable.querySelectorAll('td.list-item')];
        const matchingCell = allCells.find((cell) => {
          const link = cell.querySelector('a, span');
          /* c8 ignore next -- Guard */
          const text = link?.textContent?.toLowerCase() || '';
          return text.startsWith(typeaheadBuffer);
        });

        if (matchingCell) {
          // Remove previous selection
          const selectedCell = iconViewTable.querySelector(
            'td.list-item.selected'
          );
          if (selectedCell) {
            selectedCell.classList.remove('selected');
          }

          // Select matching cell
          matchingCell.classList.add('selected');
          matchingCell.scrollIntoView({block: 'nearest', inline: 'nearest'});
        }

        // Clear buffer after 1 second of inactivity
        typeaheadTimeout = setTimeout(() => {
          typeaheadBuffer = '';
        }, 1000);
        return;
      }

      // Cmd+Shift+N to create new folder
      if (e.metaKey && e.shiftKey && e.key === 'n') {
        e.preventDefault();
        /* c8 ignore next -- TS */
        const folderPath = iconViewTable.dataset.basePath || '/';
        createNewFolder(folderPath);

      // Cmd+I to show info window
      } else if (e.metaKey && e.key === 'i') {
        const selectedCell = iconViewTable.querySelector(
          'td.list-item.selected'
        );
        if (selectedCell) {
          e.preventDefault();
          const link = selectedCell.querySelector('a, span');
          const itemPath = link?.dataset?.path;
          if (itemPath) {
            showInfoWindow({jml, itemPath});
          }
        }

      // Cmd+O to open/navigate into selected folder or open file
      } else if (e.metaKey && e.key === 'o') {
        const selectedCell = iconViewTable.querySelector(
          'td.list-item.selected'
        );

        if (selectedCell) {
          e.preventDefault();
          const link = selectedCell.querySelector('a');
          const span = selectedCell.querySelector('p,span');

          if (link) {
            // It's a folder - navigate into it
            if (view === 'icon-view' || view === 'gallery-view') {
              selectedCell.dispatchEvent(new Event('dblclick'));
            } else {
              link.click();
            }
          } else if (span) {
            // It's a file - open with default application
            const itemPath = span.dataset?.path;
            if (itemPath) {
              const decodedPath = decodeURIComponent(itemPath);
              // @ts-expect-error - Test hook
              if (globalThis.testShellOpenPath) {
                // @ts-expect-error - Test hook
                globalThis.testShellOpenPath(decodedPath);
              /* c8 ignore next 3 -- Test hook bypasses this path */
              } else {
                globalThis.electronAPI.shell.openPath(decodedPath);
              }
            }
          }
        }

      // Cmd+C to copy selected item
      } else if (e.metaKey && e.key === 'c') {
        const selectedCell = iconViewTable.querySelector(
          'td.list-item.selected'
        );
        if (selectedCell) {
          e.preventDefault();
          const link = selectedCell.querySelector('a, span');
          const itemPath = link?.dataset?.path;
          if (itemPath) {
            setClipboard({path: itemPath, isCopy: true});
          }
        }

      // Cmd+X to cut selected item
      } else if (e.metaKey && e.key === 'x') {
        const selectedCell = iconViewTable.querySelector(
          'td.list-item.selected'
        );
        if (selectedCell) {
          e.preventDefault();
          const link = selectedCell.querySelector('a, span');
          const itemPath = link?.dataset?.path;
          if (itemPath) {
            setClipboard({path: itemPath, isCopy: false});
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

      // Cmd+Backspace to delete selected item
      } else if (e.metaKey && e.key === 'Backspace') {
        const selectedCell = iconViewTable.querySelector(
          'td.list-item.selected'
        );
        if (selectedCell) {
          e.preventDefault();
          const link = selectedCell.querySelector('a, span');
          const itemPath = link?.dataset?.path;
          if (itemPath) {
            deleteItem(itemPath);
          }
        }

      // Enter key to rename selected item
      } else if (e.key === 'Enter') {
        const selectedCell = iconViewTable.querySelector(
          'td.list-item.selected'
        );
        if (selectedCell) {
          e.preventDefault();
          const textElement = selectedCell.querySelector('a, span');
          if (textElement) {
            startRename(textElement);
          }
        }

      // Shift+Cmd+H to navigate to Home directory
      } else if (e.metaKey && e.shiftKey && e.key === 'h') {
        e.preventDefault();
        globalThis.location.hash = '#path=' +
          encodeURIComponent(globalThis.electronAPI.os.homedir());

      // Shift+Cmd+D to navigate to Desktop
      } else if (e.metaKey && e.shiftKey && e.key === 'd') {
        e.preventDefault();
        const desktopDir = path.join(
          globalThis.electronAPI.os.homedir(),
          'Desktop'
        );
        globalThis.location.hash = `#path=${encodeURIComponent(desktopDir)}`;

      // Shift+Cmd+A to navigate to Applications
      } else if (e.metaKey && e.shiftKey && e.key === 'a') {
        e.preventDefault();
        globalThis.location.hash = '#path=/Applications';

      // Shift+Cmd+U to navigate to Utilities
      } else if (e.metaKey && e.shiftKey && e.key === 'u') {
        e.preventDefault();
        globalThis.location.hash = '#path=/Applications/Utilities';

      // Cmd+[ to go back in history
      } else if (e.metaKey && e.key === '[') {
        e.preventDefault();
        history.back();

      // Cmd+] to go forward in history
      } else if (e.metaKey && e.key === ']') {
        e.preventDefault();
        history.forward();
      }
    };

    iconViewTable.addEventListener('keydown', keydownListener);
    // Store reference for cleanup
    // @ts-expect-error Custom property
    iconViewTable._keydownListener = keydownListener;

    // Remove old drag handlers if they exist
    const oldDragoverHandler = iconViewTable._dragoverHandler;
    if (oldDragoverHandler) {
      iconViewTable.removeEventListener('dragover', oldDragoverHandler);
    }
    const oldDropHandler = iconViewTable._dropHandler;
    if (oldDropHandler) {
      iconViewTable.removeEventListener('drop', oldDropHandler);
    }

    // Add drop support for table background (empty space)
    const dragoverHandler = (e) => {
      // Only handle drops on the table itself or empty cells, not on items
      const {target} = e;
      const targetEl = /** @type {HTMLElement} */ (target);
      if (targetEl === iconViewTable || targetEl.tagName === 'TR' ||
          (targetEl.tagName === 'TD' &&
            !targetEl.classList.contains('list-item'))) {
        e.preventDefault();
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = e.altKey ? 'copy' : 'move';
        }
      }
    };
    iconViewTable.addEventListener('dragover', dragoverHandler);
    // @ts-expect-error Custom property
    iconViewTable._dragoverHandler = dragoverHandler;

    const dropHandler = (e) => {
      const {target} = e;
      const targetEl = /** @type {HTMLElement} */ (target);
      // Only handle drops on the table itself or empty cells, not on items
      if (targetEl === iconViewTable || targetEl.tagName === 'TR' ||
          (targetEl.tagName === 'TD' &&
            !targetEl.classList.contains('list-item'))) {
        e.preventDefault();
        e.stopPropagation();
        const sourcePath = e.dataTransfer?.getData('text/plain');
        /* c8 ignore next -- TS */
        const targetDir = iconViewTable.dataset.basePath || '/';
        if (sourcePath && targetDir && !getIsCopyingOrMoving()) {
          copyOrMoveItem(sourcePath, targetDir, e.altKey);
        }
      }
    };
    iconViewTable.addEventListener('drop', dropHandler);
    // @ts-expect-error Custom property
    iconViewTable._dropHandler = dropHandler;

    // Focus the table for keyboard navigation
    requestAnimationFrame(() => {
      iconViewTable.focus();
    });
    return;
  }

  const millerColumns = jQuery('div.miller-columns');
  const parentMap = new WeakMap();
  const childMap = new WeakMap();
  const columnsInstance = millerColumns.millerColumns({
    // Options:
    breadcrumbRoot: '/',
    preview ($item) {
      try {
        const elem = $item.find('[data-path]')[0];
        /* c8 ignore next 4 -- Defensive check; all list items
           are created with data-path attributes */
        if (!elem || !elem.dataset || !elem.dataset.path) {
          return '<div>No preview available</div>';
        }

        const pth = decodeURIComponent(elem.dataset.path);

        // Check if path exists before calling lstatSync
        let lstat;
        try {
          lstat = lstatSync(pth);
        /* c8 ignore next 3 -- Error handling for missing/inaccessible files */
        } catch {
          return '<div>File not found</div>';
        }

        const kind = getFileKind(pth);
        const metadata = getFileMetadata(pth);
        const category = isMacApp(pth)
          ? getMacAppCategory(pth)
          : null;

        // Generate preview content based on file type (only for files)
        let previewContent = '';

        if (lstat.isFile()) {
          // Get UTI for content preview
          const utiResult = spawnSync(
            'mdls',
            ['-name', 'kMDItemContentType', '-raw', pth],
            {encoding: 'utf8'}
          );
          /* c8 ignore next -- Inconsistent results */
          const uti = utiResult.stdout?.trim() || '';

          // Get file extension for fallback detection
          const ext = path.extname(pth).toLowerCase();

          // Image types (check UTI first, then fallback to extension)
          if ((/image|png|jpeg|gif|svg|webp|bmp|tiff/v).test(uti) ||
              /* c8 ignore next -- Inconsistent results */
              (/\.(?:png|jpe?g|gif|svg|webp|bmp|tiff?)$/iv).test(ext)) {
            previewContent = `
<div class="miller-preview-content">
  <img src="file://${pth}" style="max-width: 100%; max-height: 200px; object-fit: contain;" />
</div>`;
          } else if ((/pdf/v).test(uti) ||
                     (/\.pdf$/iv).test(ext)) {
            // PDF (check UTI first, then fallback to extension)
            previewContent = `
<div class="miller-preview-content">
  <embed src="file://${pth}" type="application/pdf" style="width: 100%; height: 200px;" />
</div>`;
          /* c8 ignore next 2 -- Inconsistent results */
          } else if ((/text|json|xml|javascript|source/v).test(uti) ||
            (/\.(?:txt|md|js|ts|html|css|json|xml|sh|py|rb)$/iv).test(pth)) {
            // Text-based files
            try {
              const content = readFileSync(pth, 'utf8');
              const preview = content.length > 1000
                ? content.slice(0, 1000) + '\n\n[... truncated]'
                : content;
              const escaped = preview.
                replaceAll('&', '&amp;').
                replaceAll('<', '&lt;').
                replaceAll('>', '&gt;');
              const preStyle = 'margin: 0; white-space: pre-wrap; ' +
                'word-break: break-word; font-size: 10px; ' +
                'font-family: monospace; max-height: 200px; overflow: auto;';
              previewContent = `
<div class="miller-preview-content">
  <pre style="${preStyle}">${escaped}</pre>
</div>`;
            /* c8 ignore next 6 -- Defensive error for text processing */
            } catch (err) {
              const errMsg = err && typeof err === 'object' && 'message' in err
                ? String(err.message)
                : 'Unknown error';
              previewContent = `<div>Cannot preview file: ${errMsg}</div>`;
            }
          }
        }

        const escapedName = elem.textContent.
          replaceAll('&', '&amp;').
          replaceAll('<', '&lt;').
          replaceAll('>', '&gt;');

        return `<div><b>${escapedName}</b></div>
<div>${kind} - ${filesize(lstat.size)}</div>
${previewContent}
<div><b>Information</b></div>
<table>
  <tr><td>Created</td><td>${getFormattedDate(lstat.birthtimeMs)}</td></tr>
  <tr><td>Modified</td><td>${getFormattedDate(lstat.mtimeMs)}</td></tr>
  <tr><td>Last opened</td><td>${
    getFormattedDate(metadata.ItemLastUsedDate)
  }</td></tr>${
    metadata.ItemVersion
      ? `<tr><td>Version</td><td>${metadata.ItemVersion}</td></tr>`
      : ''
  }${
    category
      ? `<tr><td>Category</td><td>${category}</td></tr>`
      : ''
  }</table>
`;
      } catch (err) {
        // If preview fails, return a basic error message
        const errMsg = err && typeof err === 'object' && 'message' in err
          ? String(err.message)
          /* c8 ignore next -- Guard */
          : 'Unknown error';
        return `<div>Preview error: ${errMsg}</div>`;
      }
      // <div><b>Tags</b></div>
    },
    animation () {
      // No-op to avoid need for timeouts and jarring redraws
    },
    reset (_$columns, resetByUser) {
      if (!resetByUser) {
        return;
      }

      // Update URL to root when escape key resets to root
      const rootPath = '/';
      history.pushState(
        null,
        '',
        location.pathname + '#path=' + encodeURIComponent(rootPath)
      );

      // Load sticky notes for root path
      const saved = localStorage.getItem(`stickyNotes-local-${rootPath}`);
      stickyNotes.clear(({metadata}) => {
        return metadata.type === 'local';
      });
      if (saved) {
        stickyNotes.loadNotes(JSON.parse(saved));
        stickyNotes.notes.forEach((note) => {
          if (note.metadata.type === 'local') {
            addLocalStickyInputListeners(note, rootPath);
          }
        });
      }
    },
    // @ts-ignore Sometime bugginess
    current ($item /* , $cols */) {
      /**
       * @param {string} pth
       */
      const updateHistoryAndStickies = (pth) => {
        if (allowHistoryUpdates) {
          history.pushState(
            null,
            '',
            location.pathname + '#path=' + encodeURIComponent(
              pth
            )
          );
        }
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

        // Add drag-and-drop support immediately after creating the item
        const itemPath = childDirectory + '/' + encodeURIComponent(title);
        addDragAndDropSupport(li, itemPath, isDir);

        getIconDataURLForFile(
          path.join(childDirectory, title)
        ).then((url) => {
          li.setAttribute(
            'style',
            url
              ? `background-image: url(${
                url
              });`
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

  // Remove old event handlers before adding new ones
  $columns.off('dblclick');
  $columns.off('keydown');
  $columns.off('contextmenu');

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
    // Cmd+I to show info window
    } else if (e.metaKey && e.key === 'i' && pth) {
      e.preventDefault();
      showInfoWindow({jml, itemPath: pth});
    // Cmd+Delete to delete selected item
    } else if (e.metaKey && e.key === 'Backspace' && pth) {
      e.preventDefault();
      deleteItem(pth);
    // Cmd+C to copy selected item
    } else if (e.metaKey && e.key === 'c' && pth) {
      e.preventDefault();
      setClipboard({path: pth, isCopy: true});
    // Cmd+X to cut selected item
    } else if (e.metaKey && e.key === 'x' && pth) {
      e.preventDefault();
      setClipboard({path: pth, isCopy: false});
    // Cmd+V to paste into selected folder
    } else if (e.metaKey && e.key === 'v' && getClipboard()) {
      e.preventDefault();
      // Paste into the selected folder, or current base path if file selected
      /* c8 ignore next 3 -- Difficult to cover */
      const targetPath = pth && selectedLi.find('a[data-path]').length
        ? pth
        : getBasePath();
      const clip = getClipboard();
      copyOrMoveItem(clip.path, targetPath, clip.isCopy);
      setClipboard(null);
    // Cmd+Shift+N to create new folder
    } else if (e.metaKey && e.shiftKey && e.key === 'n') {
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
    // Enter key to rename
    } else if (e.key === 'Enter' && selectedLi.length) {
      e.preventDefault();
      const textElement = selectedLi.find('span, a')[0];
      if (textElement) {
        startRename(textElement);
      }

    // Shift+Cmd+H to navigate to Home directory
    } else if (e.metaKey && e.shiftKey && e.key === 'h') {
      e.preventDefault();
      globalThis.location.hash = '#path=' +
        encodeURIComponent(globalThis.electronAPI.os.homedir());

    // Shift+Cmd+D to navigate to Desktop
    } else if (e.metaKey && e.shiftKey && e.key === 'd') {
      e.preventDefault();
      const desktopDir = path.join(
        globalThis.electronAPI.os.homedir(),
        'Desktop'
      );
      globalThis.location.hash = `#path=${encodeURIComponent(desktopDir)}`;

    // Shift+Cmd+A to navigate to Applications
    } else if (e.metaKey && e.shiftKey && e.key === 'a') {
      e.preventDefault();
      globalThis.location.hash = '#path=/Applications';

    // Shift+Cmd+U to navigate to Utilities
    } else if (e.metaKey && e.shiftKey && e.key === 'u') {
      e.preventDefault();
      globalThis.location.hash = '#path=/Applications/Utilities';

    // Cmd+[ to go back in history
    } else if (e.metaKey && e.key === '[') {
      e.preventDefault();
      history.back();

    // Cmd+] to go forward in history
    } else if (e.metaKey && e.key === ']') {
      e.preventDefault();
      history.forward();
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
    const clickedColumn = jQuery(columnElement).closest('ul.miller-column');
    const prevColumn = clickedColumn.prevAll(
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
      ]],
      ...(getClipboard()
        ? [['li', {
          class: 'context-menu-item',
          $on: {
            click () {
              customContextMenu.remove();
              const clip = getClipboard();
              if (clip) {
                copyOrMoveItem(clip.path, folderPath, clip.isCopy);
              }
            }
          }
        }, [
          'Paste'
        ]]]
        : [])
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
      (pathSegment, idx, arr) => {
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
        allowHistoryUpdates = false;
        anchors.trigger('click');
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            // Not sure why timeout is now needed, but using with shortcuts like
            //    shift-cmd-A, it has become necessary
            setTimeout(() => {
              anchors[0]?.scrollIntoView({
                block: 'start',
                inline: 'start'
              });
              if (idx === arr.length - 1) {
                allowHistoryUpdates = true;
              }
            }, 200);
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

        // Add drop support only if not already added
        if (!millerColumnsDiv.dataset.dropHandlerAdded) {
          millerColumnsDiv.dataset.dropHandlerAdded = 'true';

          // Add drop support for miller-columns background (empty space)
          millerColumnsDiv.addEventListener('dragover', (e) => {
            const {target} = e;
            const targetEl = /** @type {HTMLElement} */ (target);
            // Only handle drops on columns or empty space, not on list items
            /* c8 ignore next 2 -- Dropping on millerColumnsDiv background */
            if (targetEl.classList.contains('miller-column') ||
                targetEl === millerColumnsDiv) {
              e.preventDefault();
              if (e.dataTransfer) {
                e.dataTransfer.dropEffect = e.altKey ? 'copy' : 'move';
              }
            }
          });

          millerColumnsDiv.addEventListener('drop', (e) => {
            const {target} = e;
            const targetEl = /** @type {HTMLElement} */ (target);
            // Only handle drops on columns or empty space, not on list items
            /* c8 ignore next 2 -- Dropping on millerColumnsDiv background */
            if (targetEl.classList.contains('miller-column') ||
                targetEl === millerColumnsDiv) {
              e.preventDefault();
              e.stopPropagation();
              const sourcePath = e.dataTransfer?.getData('text/plain');

              // Determine target directory based on which column was clicked
              let targetDir = getBasePath();
              if (targetEl.classList.contains('miller-column')) {
                // Find the selected item in the previous visible column
                const columns = [
                  ...millerColumnsDiv.querySelectorAll('ul.miller-column')
                ];
                const visibleColumns = columns.filter(
                  (col) => !col.classList.contains('miller-collapse')
                );
                const columnIndex = visibleColumns.indexOf(targetEl);
                if (columnIndex > 0) {
                  const prevColumn = visibleColumns[columnIndex - 1];
                  const selectedItem = prevColumn.querySelector(
                    'li.miller-selected a'
                  );
                  if (selectedItem) {
                    const selectedEl =
                      /** @type {HTMLElement} */ (selectedItem);
                    targetDir = selectedEl.dataset.path
                      ? decodeURIComponent(selectedEl.dataset.path)
                      /* c8 ignore next -- Guard */
                      : targetDir;
                  }
                }
              }

              if (sourcePath && targetDir && !getIsCopyingOrMoving()) {
                copyOrMoveItem(sourcePath, targetDir, e.altKey);
              }
            }
          });
        } // Close the dropHandlerAdded check

        // Add keyboard shortcuts for miller columns
        const keydownListener = (e) => {
          // Cmd+Shift+N to create new folder
          if (e.metaKey && e.shiftKey && e.key === 'n') {
            e.preventDefault();
            const selected = millerColumnsDiv.querySelector(
              '.list-item.selected a'
            );
            /* c8 ignore next 7 -- jQuery handler takes precedence */
            if (selected) {
              const selectedEl = /** @type {HTMLElement} */ (selected);
              const folderPath = selectedEl.dataset.path;
              if (folderPath) {
                createNewFolder(decodeURIComponent(folderPath));
              }
            }
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
              const isFolder = linkEl.tagName === 'A';
              addDragAndDropSupport(itemEl, itemPath, isFolder);
            }
          }
        });
      }
    });
  }
}

globalThis.addEventListener('hashchange', () => {
  // console.log('hash change');
  changePath();
});

// globalThis.addEventListener('popstate', (e) => {
//   if (!e.state) { // As for hashchange which we handle above
//     console.log('no state popstate');
//     return;
//   }
//   console.log('popstatechange');
//   changePath();
// });


// Add global keyboard handler for undo/redo
document.addEventListener('keydown', (e) => {
  // Only handle if not typing in an input field
  /* c8 ignore next 5 - Defensive: keyboard shortcuts disabled in inputs */
  const {target} = e;
  const el = /** @type {Element} */ (target);
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
    return;
  }

  // Cmd+1 to switch to icon view
  if (e.metaKey && e.key === '1') {
    e.preventDefault();
    $('#icon-view').click();
  } else if (e.metaKey && e.key === '3') {
    // Cmd+3 to switch to three-columns view
    e.preventDefault();
    $('#three-columns').click();
  } else if (e.metaKey && e.key === '4') {
    // Cmd+4 to switch to gallery-view
    e.preventDefault();
    $('#gallery-view').click();
  } else if (e.metaKey && e.key === 'z' && !e.shiftKey) {
    // Cmd+Z for undo
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
  changePath();
});
$('#gallery-view').addEventListener('click', function () {
  $$('nav button').forEach((button) => {
    button.classList.remove('selected');
  });
  this.classList.add('selected');
  localStorage.setItem('view', 'gallery-view');
  changePath();
});
$('#three-columns').addEventListener('click', function () {
  $$('nav button').forEach((button) => {
    button.classList.remove('selected');
  });
  this.classList.add('selected');
  localStorage.setItem('view', 'three-columns');
  changePath();
});

const view = getCurrentView();
switch (view) {
case 'gallery-view':
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
  const pth = currentView === 'icon-view' || currentView === 'gallery-view'
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
