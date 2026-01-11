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
  getIsCopyingOrMoving,
  getListViewTreeMode
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
  getXLargeIconDataURLForFile,
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
let clickTimer = null;
let lastSelectedItemPath = null;

// Expose setter for lastSelectedItemPath for use by rename operation
/* c8 ignore next 6 -- Test/operation helper */
if (typeof globalThis !== 'undefined') {
  /** @type {unknown} */ (globalThis).setLastSelectedItemPath = (pth) => {
    lastSelectedItemPath = pth;
  };
}

// Track batch metadata loading callback handle for cancellation
let batchMetadataCallbackHandle = null;

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
  const basePath = view === 'three-columns' ? '/' : currentBasePath;

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

  // Cancel any pending batch metadata loading from previous view
  if (batchMetadataCallbackHandle !== null) {
    if ('cancelIdleCallback' in globalThis) {
      cancelIdleCallback(batchMetadataCallbackHandle);
    /* c8 ignore next 3 -- Fallback only */
    } else {
      clearTimeout(batchMetadataCallbackHandle);
    }
    batchMetadataCallbackHandle = null;
  }

  $('i').hidden = true;

  // Show/hide view containers based on current view
  const iconOrGalleryView = $('.icon-or-gallery-view');
  const millerColumnsContainer = $('.miller-columns-container');
  const listView = $('.list-view');

  switch (view) {
  case 'icon-view':
  case 'gallery-view':
    iconOrGalleryView.style.display = 'block';
    millerColumnsContainer.style.display = 'none';
    listView.style.display = 'none';
    break;
  case 'three-columns':
    iconOrGalleryView.style.display = 'none';
    millerColumnsContainer.style.display = 'block';
    listView.style.display = 'none';
    break;
  case 'list-view':
    iconOrGalleryView.style.display = 'none';
    millerColumnsContainer.style.display = 'none';
    listView.style.display = 'block';
    break;
  default:
    break;
  }

  const ulMiller = $('.miller-columns ul');
  while (ulMiller.firstChild) {
    ulMiller.firstChild.remove();
  }

  const ulIconOrGallery = $('.icon-or-gallery-view ul');
  while (ulIconOrGallery.firstChild) {
    ulIconOrGallery.firstChild.remove();
  }

  // Apply icon-view sorting logic (for gallery-view and icon-view)
  if (view === 'icon-view' || view === 'gallery-view') {
    const iconSortMode = localStorage.getItem('icon-view-sort-mode') ||
      'name';

    if (iconSortMode === 'none' || iconSortMode === 'snap') {
      // Use custom positions if available
      const customPositionsKey = `icon-positions-${currentBasePath}`;
      const storedPositions = localStorage.getItem(customPositionsKey);

      if (storedPositions) {
        try {
          const positions = JSON.parse(storedPositions);
          // Sort by stored position (row, col)
          result.sort((a, b) => {
            const [, , titleA] = a;
            const [, , titleB] = b;
            const posA = positions[titleA];
            const posB = positions[titleB];

            // Items without positions go to the end
            if (!posA && !posB) {
              return 0;
            }
            if (!posA) {
              return 1;
            }
            if (!posB) {
              return -1;
            }

            // Compare by row first, then column
            if (posA.row !== posB.row) {
              return posA.row - posB.row;
            }
            return posA.col - posB.col;
          });
        /* c8 ignore next 3 -- JSON parse error handling */
        } catch {
          // Invalid JSON, fall back to name sort
        }
      }
    } else {
      // Apply metadata-based sorting
      result.sort((a, b) => {
        const [isDirA, , titleA] = a;
        const [isDirB, , titleB] = b;

        // Folders always come first
        if (isDirA && !isDirB) {
          return -1;
        }
        if (!isDirA && isDirB) {
          return 1;
        }

        // Sort by selected metadata field
        // For now, all modes sort by name (metadata sorting TODO)
        return titleA.localeCompare(titleB, undefined, {
          sensitivity: 'base'
        });
      });
    }
  }

  const ul = view === 'three-columns'
    ? ulMiller
    : ulIconOrGallery;

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
    // Only show folder context menu if clicking on actual content
    const targetEl = /** @type {HTMLElement} */ (e.target);
    const isContentClick = targetEl.tagName === 'A' ||
      targetEl.tagName === 'P' ||
      targetEl.tagName === 'IMG' ||
      targetEl.closest('a, p, img');

    if (!isContentClick) {
      // Let it bubble to parent for empty-space menu
      return;
    }

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
    // Only show file context menu if clicking on actual content
    const targetEl = /** @type {HTMLElement} */ (e.target);
    const isContentClick = targetEl.tagName === 'A' ||
      targetEl.tagName === 'P' ||
      targetEl.tagName === 'SPAN' ||
      targetEl.tagName === 'IMG' ||
      targetEl.closest('a, p, span, img');

    if (!isContentClick) {
      // Let it bubble to parent for empty-space menu
      return;
    }

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
        ...(view === 'icon-view' || view === 'gallery-view'
          ? {
            dataset: {
              path: basePath + encodeURIComponent(title)
            }
          }
          : {}
        ),
        $on: {
          ...(view === 'icon-view' || view === 'gallery-view'
            ? {
              click: [function (e) {
                /**
                 * @returns {Promise<string>}
                 */
                async function getThumbnail () {
                  if (isDir) {
                    return await getXLargeIconDataURLForFile(
                      path.join(childDir, title)
                    );
                  }

                  return await globalThis.electronAPI.getFileThumbnail(
                    path.join(childDir, title), 512
                  ) || await getXLargeIconDataURLForFile(
                    path.join(childDir, title)
                  );
                }
                e.preventDefault();

                // Save the selected item path for restoration after refresh
                lastSelectedItemPath = basePath + encodeURIComponent(title);

                // Apply highlighting immediately
                const prevSelected =
                  this.parentElement.parentElement.querySelector(
                    'td.list-item.selected'
                  );
                if (prevSelected) {
                  prevSelected.classList.remove('selected');
                }
                this.classList.add('selected');

                // Clear any existing click timer
                if (clickTimer) {
                  clearTimeout(clickTimer);
                  clickTimer = null;
                }

                // Only delay the gallery thumbnail update
                if (view === 'gallery-view') {
                  clickTimer = setTimeout(async () => {
                    const tableContainer =
                      this.parentElement.parentElement.parentElement;
                    const imgElement = tableContainer.
                      previousElementSibling.querySelector('img');
                    const url = await getThumbnail();
                    imgElement.src = url;
                    clickTimer = null;
                  }, 250);
                }
              }, true],
              dblclick: [function () {
                // Clear the click timer to prevent thumbnail
                //   update on double-click
                if (clickTimer) {
                  clearTimeout(clickTimer);
                  clickTimer = null;
                }
                location.href = this.querySelector('a').href;
              }, true],
              contextmenu: isDir ? folderContextmenu : contextmenu
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
              },
              $on: isDir
                ? {contextmenu: folderContextmenu}
                : {contextmenu}
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
      ? /** @type {import('jamilih').JamilihArray[]} */ ([
        ...(view === 'gallery-view'
          ? [
            ['div', {
              class: 'gallery-container'
            }, [
              ['div', {
                class: 'gallery-main'
              }, [
                ['div', {
                  class: 'gallery-preview-image'
                }, [
                  ['img', {
                    class: 'gallery-icon-preview'
                  }]
                ]],
                ['div', {
                  class: 'gallery'
                }, [
                  ['table', {
                    dataset: {basePath}
                  }, [
                    ['tr', listItems]
                  ]]
                ]]
              ]],
              ['div', {
                class: 'gallery-preview-panel'
              }, [
                ['div', {
                  class: 'gallery-preview-metadata'
                }]
              ]]
            ]]
          ]
          : [
            ['div', [
              (() => {
                const sortMode = localStorage.getItem('icon-view-sort-mode') ||
                  'name';

                if (sortMode === 'none') {
                  // Free-form positioning mode - use absolute positioning
                  const customPositionsKey = `icon-positions-${basePath}`;
                  const storedPositions =
                    localStorage.getItem(customPositionsKey);
                  const positions = storedPositions
                    ? JSON.parse(storedPositions)
                    : {};

                  // Calculate default grid for items without positions
                  const itemsPerRow = 4;
                  const itemWidth = 140;
                  const itemHeight = 120;
                  let nextX = 20;
                  let nextY = 20;
                  let itemsInRow = 0;

                  const positionedItems = listItems.map((item) => {
                    // Get path from the td element's link or p tag
                    const link = item.querySelector('a, p');
                    const itemPath = link ? link.dataset.path : '';
                    const pos = positions[itemPath];

                    let x, y;
                    if (pos && typeof pos.x === 'number') {
                      // Use stored free-form position
                      ({x, y} = pos);
                    } else {
                      // Auto-layout in grid for new items
                      x = nextX;
                      y = nextY;
                      nextX += itemWidth;
                      itemsInRow++;
                      if (itemsInRow >= itemsPerRow) {
                        nextX = 20;
                        nextY += itemHeight;
                        itemsInRow = 0;
                      }
                    }

                    // Clone the item and modify it for absolute positioning
                    const clonedItem = item.cloneNode(true);

                    // Wrap td content in positioned div
                    return ['div', {
                      class: 'icon-freeform-item list-item',
                      style: {
                        left: `${x}px`,
                        top: `${y}px`
                      },
                      dataset: {
                        path: item.dataset.path
                      }
                    }, [...clonedItem.childNodes]];
                  });

                  return ['div', {
                    class: 'icon-freeform-container',
                    dataset: {basePath}
                  }, positionedItems];
                }

                // Grid-based modes (snap or metadata sorting)
                return ['table', {
                  dataset: {basePath}
                }, (() => {
                  if (sortMode === 'snap') {
                    // Grid with custom positions for snap mode
                    const customPositionsKey = `icon-positions-${basePath}`;
                    const storedPositions =
                      localStorage.getItem(customPositionsKey);
                    const positions = storedPositions
                      ? JSON.parse(storedPositions)
                      : {};

                    // Clean up positions for items that no longer exist
                    const currentItemPaths = new Set(
                      listItems.map((item) => {
                        const link = item.querySelector('a, p');
                        return link ? link.dataset.path : '';
                      }).filter(Boolean)
                    );

                    // Remove stale positions
                    for (const itemPath of Object.keys(positions)) {
                      if (!currentItemPaths.has(itemPath)) {
                        delete positions[itemPath];
                      }
                    }

                    // Save cleaned positions
                    localStorage.setItem(
                      customPositionsKey,
                      JSON.stringify(positions)
                    );

                    // Calculate required grid size based on current items only
                    const maxRow = Math.max(...Object.values(positions).
                      map((/** @type {{row: number}} */ p) => {
                        return p.row || 0;
                      }), -1);
                    const maxCol = Math.max(...Object.values(positions).
                      map((/** @type {{col: number}} */ p) => {
                        return p.col || 0;
                      }), -1);

                    // Add buffer rows and columns for easier dragging
                    // Grid should extend a bit beyond positioned items
                    const numRows = maxRow + 3;
                    const numCols = Math.max(maxCol + 3, numIconColumns);

                    // Create position map for quick lookup
                    const positionMap =
                      /**
                       * @type {Map<
                       *   string,
                       *   import('jamilih').JamilihArray
                       * >}
                       */ (
                        new Map()
                      );
                    listItems.forEach((item) => {
                      const link = item.querySelector('a, p');
                      const itemPath = link ? link.dataset.path : '';
                      const pos = positions[itemPath];
                      if (pos && typeof pos.row === 'number') {
                        const key = `${pos.row}-${pos.col}`;
                        positionMap.set(key, item);
                      }
                    });

                    // Place items without positions in empty cells
                    const unpositionedItems = listItems.filter((item) => {
                      const link = item.querySelector('a, p');
                      const itemPath = link ? link.dataset.path : '';
                      const itemPos = positions[itemPath];
                      return !itemPos || typeof itemPos.row !== 'number';
                    });

                    // Fill empty cells with unpositioned items
                    let unposIndex = 0;
                    for (let r = 0;
                      r <= maxRow + 2 && unposIndex < unpositionedItems.length;
                      r++) {
                      for (let c = 0;
                        c < numCols && unposIndex < unpositionedItems.length;
                        c++) {
                        const key = `${r}-${c}`;
                        if (!positionMap.has(key)) {
                          positionMap.set(key, unpositionedItems[unposIndex++]);
                        }
                      }
                    }

                    // If there are still unpositioned items, add rows
                    let nextAvailableRow = maxRow + 3;
                    let nextAvailableCol = 0;
                    while (unposIndex < unpositionedItems.length) {
                      const key = `${nextAvailableRow}-${nextAvailableCol}`;
                      positionMap.set(key, unpositionedItems[unposIndex++]);
                      nextAvailableCol++;
                      if (nextAvailableCol >= numCols) {
                        nextAvailableCol = 0;
                        nextAvailableRow++;
                      }
                    }

                    // Update grid size if needed for unpositioned items
                    const finalNumRows = unposIndex > 0
                      ? Math.max(numRows, nextAvailableRow)
                      : numRows;

                    const rows = [];
                    for (let r = 0; r < finalNumRows; r++) {
                      const rowCells = [];
                      for (let c = 0; c < numCols; c++) {
                        const key = `${r}-${c}`;
                        const item = positionMap.get(key);

                        if (item) {
                          rowCells.push(item);
                        } else {
                          // Empty cell
                          rowCells.push(['td', {}]);
                        }
                      }
                      rows.push(['tr', rowCells]);
                    }

                    return rows;
                  }

                  // Default grid layout for other modes
                  return chunk(listItems, numIconColumns).map((innerArr) => {
                    return ['tr', innerArr];
                  });
                })()];
              })()
            ]]
          ])
      ])
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
    const iconViewContainer = $('table[data-base-path]') ||
      $('.icon-freeform-container');
    /* c8 ignore next 3 -- Unreachable: always returns above */
    if (!iconViewContainer) {
      return;
    }

    // Make container focusable
    iconViewContainer.setAttribute('tabindex', '0');

    // Remove any existing keydown listeners to avoid duplicates
    const oldListener = iconViewContainer._keydownListener;
    if (oldListener) {
      iconViewContainer.removeEventListener('keydown', oldListener);
    }

    // Add drag-and-drop support to all cells
    const cells = iconViewContainer.querySelectorAll('td.list-item');
    cells.forEach((cell) => {
      const cellEl = /** @type {HTMLElement} */ (cell);
      const link = cellEl.querySelector('a, p');
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
        const prevSelected = iconViewContainer.querySelector(
          'td.list-item.selected'
        );
        if (prevSelected) {
          prevSelected.classList.remove('selected');
        }

        // Add selection to clicked cell
        cellEl.classList.add('selected');

        // Update gallery preview if in gallery view
        if (view === 'gallery-view') {
          updateGalleryPreview(cellEl);
        }
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

    // Add icon repositioning support for 'none' and 'snap' modes
    const iconSortMode = localStorage.getItem('icon-view-sort-mode') ||
      'name';
    if (iconSortMode === 'none' || iconSortMode === 'snap') {
      if (iconSortMode === 'none') {
        // Free-form positioning using absolute coordinates
        const freeformContainer = $('.icon-freeform-container');
        if (freeformContainer) {
          const freeformItems =
            freeformContainer.querySelectorAll('.icon-freeform-item');
          let draggedItem = /** @type {HTMLElement | null} */ (null);
          let dragOffsetX = 0;
          let dragOffsetY = 0;

          freeformItems.forEach((item) => {
            const itemEl = /** @type {HTMLElement} */ (item);
            itemEl.setAttribute('draggable', 'true');

            // Add click handler for selection
            const clickHandler = (e) => {
              // Don't interfere with link navigation
              if (e.target !== itemEl &&
                  !itemEl.contains(/** @type {Node} */ (e.target))) {
                return;
              }

              // Remove previous selection
              const prevSelected = freeformContainer.querySelector(
                '.icon-freeform-item.selected'
              );
              if (prevSelected) {
                prevSelected.classList.remove('selected');
              }

              // Add selection to clicked item
              itemEl.classList.add('selected');
            };
            itemEl.addEventListener('click', clickHandler);

            // Add double-click handler to open folders/files
            const dblclickHandler = (e) => {
              e.preventDefault();
              const anchor = itemEl.querySelector('a');
              const span = itemEl.querySelector('p,span');

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
            itemEl.addEventListener('dblclick', dblclickHandler);

            itemEl.addEventListener('dragstart', (e) => {
              if (e.dataTransfer) {
                const link = itemEl.querySelector('a, p');
                if (link) {
                  const linkEl = /** @type {HTMLElement} */ (link);
                  const itemPath = linkEl.dataset.path;
                  if (itemPath) {
                    draggedItem = itemEl;
                    const rect = itemEl.getBoundingClientRect();
                    dragOffsetX = e.clientX - rect.left;
                    dragOffsetY = e.clientY - rect.top;
                    e.dataTransfer.setData('icon-freeform', itemPath);
                    e.dataTransfer.effectAllowed = 'move';

                    // Create custom drag image with icon and text
                    const dragImage = itemEl.cloneNode(true);
                    const dragImageEl = /** @type {HTMLElement} */ (
                      dragImage
                    );
                    dragImageEl.style.position = 'absolute';
                    dragImageEl.style.top = '-1000px';
                    dragImageEl.style.opacity = '0.8';
                    dragImageEl.style.pointerEvents = 'none';
                    document.body.append(dragImageEl);
                    e.dataTransfer.setDragImage(
                      dragImageEl,
                      dragOffsetX,
                      dragOffsetY
                    );

                    // Clean up drag image after a short delay
                    setTimeout(() => {
                      dragImageEl.remove();
                    }, 0);

                    itemEl.classList.add('dragging-icon');
                  }
                }
              }
            });

            itemEl.addEventListener('dragend', () => {
              itemEl.classList.remove('dragging-icon');
              draggedItem = null;
            });
          });

          freeformContainer.addEventListener('dragover', (e) => {
            if (e.dataTransfer?.types.includes('icon-freeform')) {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
            }
          });

          freeformContainer.addEventListener('drop', (e) => {
            if (e.dataTransfer?.types.includes('icon-freeform') &&
                draggedItem) {
              e.preventDefault();
              e.stopPropagation();

              const itemPath = e.dataTransfer.getData('icon-freeform');
              if (itemPath) {
                // Calculate new position relative to container
                const containerRect =
                  freeformContainer.getBoundingClientRect();
                const newX = e.clientX - containerRect.left - dragOffsetX;
                const newY = e.clientY - containerRect.top - dragOffsetY;

                // Clamp position to container bounds
                const maxX = containerRect.width - 120; // icon width
                const maxY = containerRect.height - 140; // icon height
                const clampedX = Math.max(0, Math.min(newX, maxX));
                const clampedY = Math.max(0, Math.min(newY, maxY));

                // Update position in storage
                const customPositionsKey =
                  `icon-positions-${currentBasePath}`;
                const storedPositions =
                  localStorage.getItem(customPositionsKey);
                const positions = storedPositions
                  ? /** @type {Record<string, {x: number, y: number}>} */ (
                    JSON.parse(storedPositions)
                  )
                  : /** @type {Record<string, {x: number, y: number}>} */ ({});

                positions[itemPath] = {x: clampedX, y: clampedY};
                localStorage.setItem(
                  customPositionsKey,
                  JSON.stringify(positions)
                );

                // Store the item path to restore selection
                const pathToSelect = itemPath;

                // Refresh view
                changePath();

                // Restore selection after a short delay to allow DOM update
                setTimeout(() => {
                  const items = [
                    ...freeformContainer.querySelectorAll(
                      '.icon-freeform-item'
                    )
                  ];
                  for (const item of items) {
                    const link = item.querySelector('a, p');
                    if (link && link.dataset.path === pathToSelect) {
                      item.classList.add('selected');
                      break;
                    }
                  }
                }, 10);
              }
            }
          });
        }
      } else {
        // Grid-based positioning for 'snap' mode
        cells.forEach((cell) => {
          const cellEl = /** @type {HTMLElement} */ (cell);
          cellEl.setAttribute('draggable', 'true');

          // Store drag data
          cellEl.addEventListener('dragstart', (e) => {
            if (e.dataTransfer) {
              const link = cellEl.querySelector('a, p');
              if (link) {
                const linkEl = /** @type {HTMLElement} */ (link);
                const itemPath = linkEl.dataset.path;
                if (itemPath) {
                  e.dataTransfer.setData('icon-reposition', itemPath);
                  e.dataTransfer.effectAllowed = 'move';
                  cellEl.classList.add('dragging-icon');
                }
              }
            }
          });

          cellEl.addEventListener('dragend', () => {
            cellEl.classList.remove('dragging-icon');
          });
        });

        // Allow dropping anywhere on the table to snap to grid
        iconViewContainer.addEventListener('dragover', (e) => {
          if (e.dataTransfer?.types.includes('icon-reposition')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
          }
        });

        iconViewContainer.addEventListener('drop', (e) => {
          if (e.dataTransfer?.types.includes('icon-reposition')) {
            e.preventDefault();
            e.stopPropagation();

            const draggedItemPath =
              e.dataTransfer.getData('icon-reposition');

            if (draggedItemPath) {
              // Calculate which grid cell the mouse is over
              const allRows = [
                ...iconViewContainer.querySelectorAll('tr')
              ];
              const firstRow = allRows[0];
              const allCellsInFirstRow = firstRow
                ? [...firstRow.querySelectorAll('td')]
                : [];

              // Get the first cell to determine cell dimensions
              const firstCell =
                allCellsInFirstRow[0];

              if (!firstCell) {
                return;
              }

              const firstCellRect = firstCell.getBoundingClientRect();
              const cellWidth = firstCellRect.width;
              const cellHeight = firstCellRect.height;

              // Get container position
              const containerRect =
                iconViewContainer.getBoundingClientRect();

              // Calculate row and column based on mouse position
              // Allow positions beyond current grid
              const relativeY = e.clientY - containerRect.top;
              const relativeX = e.clientX - containerRect.left;

              const targetRowIndex = Math.max(0,
                Math.floor(relativeY / cellHeight));
              const targetColIndex = Math.max(0,
                Math.floor(relativeX / cellWidth));

              // Get current positions
              const customPositionsKey =
                `icon-positions-${currentBasePath}`;
              const storedPositions =
                localStorage.getItem(customPositionsKey);
              const positions = storedPositions
                ? /** @type {Record<string, {row: number, col: number}>} */ (
                  JSON.parse(storedPositions)
                )
                : /** @type {Record<string, {row: number, col: number}>} */ (
                  {}
                );

              // Set new position for dragged item
              positions[draggedItemPath] = {
                row: targetRowIndex,
                col: targetColIndex
              };

              // Save positions
              localStorage.setItem(
                customPositionsKey,
                JSON.stringify(positions)
              );

              // Store the dragged item path to restore selection
              const pathToSelect = draggedItemPath;

              // Refresh view to show new positions
              changePath();

              // Restore selection after a short delay to allow DOM update
              setTimeout(() => {
                const allCells = [
                  ...iconViewContainer.querySelectorAll('td.list-item')
                ];
                for (const cell of allCells) {
                  const link = cell.querySelector('a, p');
                  if (link && link.dataset.path === pathToSelect) {
                    cell.classList.add('selected');
                    break;
                  }
                }
              }, 10);
            }
          }
        });
      }
    }

    /**
     * Generate metadata HTML for gallery preview panel.
     * @param {string} itemPath - The path to the file/folder
     * @returns {string} HTML string with metadata
     */
    const generateGalleryMetadata = (itemPath) => {
      try {
        const decodedPath = decodeURIComponent(itemPath);
        const lstat = lstatSync(decodedPath);
        const kind = getFileKind(decodedPath);
        const metadata = getFileMetadata(decodedPath);
        const category = isMacApp(decodedPath)
          ? getMacAppCategory(decodedPath)
          : null;

        const fileName = path.basename(decodedPath);
        const escapedName = fileName.
          replaceAll('&', '&amp;').
          replaceAll('<', '&lt;').
          replaceAll('>', '&gt;');

        // Generate preview content for files
        let previewContent = '';
        if (lstat.isFile()) {
          const utiResult = spawnSync(
            'mdls',
            ['-name', 'kMDItemContentType', '-raw', decodedPath],
            {encoding: 'utf8'}
          );
          /* c8 ignore next -- Guard */
          const uti = utiResult.stdout?.trim() || '';

          // Text-based files preview
          if ((/text|json|xml|javascript|source/v).test(uti) ||
            (/\.(?:txt|md|js|ts|html|css|json|xml|sh|py|rb)$/iv).
              test(decodedPath)) {
            try {
              const content = readFileSync(decodedPath, 'utf8');
              const preview = content.length > 500
                ? content.slice(0, 500) + '\n\n[... truncated]'
                : content;
              const escaped = preview.
                replaceAll('&', '&amp;').
                replaceAll('<', '&lt;').
                replaceAll('>', '&gt;');
              previewContent =
                `<div class="gallery-text-preview">${escaped}</div>`;
            /* c8 ignore next 3 -- Error handling */
            } catch {
              previewContent = '';
            }
          }
        }

        const versionRow = metadata.ItemVersion
          ? `<tr><td>Version</td><td>${metadata.ItemVersion}</td></tr>`
          : '';
        const categoryRow = category
          ? `<tr><td>Category</td><td>${category}</td></tr>`
          : '';

        return `<div class="gallery-metadata-content">
  <div class="gallery-metadata-title">${escapedName}</div>
  <div class="gallery-metadata-subtitle">${kind} - ${
    filesize(lstat.size)
  }</div>
  ${previewContent}
  <div class="gallery-metadata-section-title">Information</div>
  <table class="gallery-metadata-table">
    <tr><td>Created</td><td>${
      getFormattedDate(lstat.birthtimeMs)
    }</td></tr>
    <tr><td>Modified</td><td>${
      getFormattedDate(lstat.mtimeMs)
    }</td></tr>
    <tr><td>Last opened</td><td>${
      getFormattedDate(metadata.ItemLastUsedDate)
    }</td></tr>
    ${versionRow}
    ${categoryRow}
  </table>
</div>`;
      /* c8 ignore next 8 -- Error handling */
      } catch (err) {
        const errMsg = err && typeof err === 'object' && 'message' in err
          ? String(err.message)
          : 'Unknown error';
        return `<div class="gallery-metadata-error">Preview error: ${
          errMsg
        }</div>`;
      }
    };

    // Helper function to update gallery preview for selected item
    /**
     * @param {HTMLElement} cellEl - The selected cell element
     * @returns {void}
     */
    const updateGalleryPreview = (cellEl) => {
      if (view !== 'gallery-view') {
        return;
      }

      const link = cellEl.querySelector('a, p');
      /* c8 ignore next 3 -- Guard */
      if (!link) {
        return;
      }

      const linkEl = /** @type {HTMLElement} */ (link);
      const itemPath = linkEl.dataset.path;
      /* c8 ignore next 3 -- Guard */
      if (!itemPath) {
        return;
      }

      const decodedPath = decodeURIComponent(itemPath);
      const isFolder = linkEl.tagName === 'A';

      // Get appropriate thumbnail and update immediately
      (async () => {
        const url = isFolder
          ? await getXLargeIconDataURLForFile(decodedPath)
          : await globalThis.electronAPI.getFileThumbnail(
            decodedPath, 512
          ) || await getXLargeIconDataURLForFile(decodedPath);

        // Find the gallery container and update both image and metadata
        const table = cellEl.parentElement.parentElement;
        const galleryDiv = table.parentElement;
        const galleryMain = galleryDiv.parentElement;
        const galleryContainer = galleryMain.parentElement;

        // Update image (in gallery-main)
        const imgElement = galleryMain.querySelector('.gallery-icon-preview');
        if (imgElement && url) {
          imgElement.src = url;
        }

        // Update metadata (in side panel)
        const metadataDiv = galleryContainer.querySelector(
          '.gallery-preview-metadata'
        );
        if (metadataDiv) {
          // eslint-disable-next-line @stylistic/max-len -- Long
          // eslint-disable-next-line no-unsanitized/property -- Should be trusted
          metadataDiv.innerHTML = generateGalleryMetadata(itemPath);
        }
      /* c8 ignore next 8 -- Error handler */
      })().catch(
        // eslint-disable-next-line @stylistic/max-len -- Long
        // eslint-disable-next-line promise/prefer-await-to-callbacks -- Catch block
        (err) => {
          // eslint-disable-next-line no-console -- Error logging
          console.error('Failed to load gallery preview:', err);
        }
      );
    };

    // Restore previously selected item after refresh
    // Skip auto-selection if creating/renaming (it will handle selection)
    if (!isCreating) {
      let cellToSelect = null;
      if (lastSelectedItemPath) {
        cellToSelect = [...cells].find((cell) => {
          const cellEl = /** @type {HTMLElement} */ (cell);
          const link = cellEl.querySelector('a, p');
          /* c8 ignore next 3 -- Guard */
          if (!link) {
            return false;
          }

          const linkEl = /** @type {HTMLElement} */ (link);
          return linkEl.dataset.path === lastSelectedItemPath;
        });
      }

      // If we found the previously selected item, restore it
      // Otherwise, select the first item
      if (cellToSelect) {
        const cellEl = /** @type {HTMLElement} */ (cellToSelect);
        // Remove any other selections first
        const prevSelected = iconViewContainer.querySelector(
          'td.list-item.selected, .icon-freeform-item.selected'
        );
        /* c8 ignore next 3 -- Guard */
        if (prevSelected) {
          prevSelected.classList.remove('selected');
        }
        // Apply selection
        cellEl.classList.add('selected');

        // Update gallery preview if needed
        updateGalleryPreview(cellEl);
      } else if (cells.length > 0) {
        // No previously selected item found, select the first item
        const firstCell = /** @type {HTMLElement} */ (cells[0]);
        firstCell.classList.add('selected');
        updateGalleryPreview(firstCell);
      }
    }

    // Add new keydown listener
    let typeaheadBuffer = '';
    let typeaheadTimeout = null;

    const keydownListener = (e) => {
      // Determine if we're in free-form mode or table mode
      const isFreeform = iconViewContainer.classList.contains(
        'icon-freeform-container'
      );
      const itemSelector = isFreeform
        ? '.icon-freeform-item'
        : 'td.list-item';
      const selectedItemSelector = isFreeform
        ? '.icon-freeform-item.selected'
        : 'td.list-item.selected';

      // Handle arrow key navigation
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(
        e.key
      )) {
        e.preventDefault();
        const selectedCell = iconViewContainer.querySelector(
          selectedItemSelector
        );
        const allCells = [
          ...iconViewContainer.querySelectorAll(itemSelector)
        ];

        /* c8 ignore next 3 -- Icon view always has cells */
        if (allCells.length === 0) {
          return;
        }

        const currentIndex = selectedCell
          ? allCells.indexOf(selectedCell)
          : -1;
        let newIndex = currentIndex;

        // Calculate number of columns
        const firstRow = iconViewContainer.querySelector('tr');
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
          updateGalleryPreview(newCell);
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
        const allCells = [
          ...iconViewContainer.querySelectorAll(itemSelector)
        ];
        const matchingCell = allCells.find((cell) => {
          const link = cell.querySelector('a, p');
          /* c8 ignore next -- Guard */
          const text = link?.textContent?.toLowerCase() || '';
          return text.startsWith(typeaheadBuffer);
        });

        if (matchingCell) {
          // Remove previous selection
          const selectedCell = iconViewContainer.querySelector(
            selectedItemSelector
          );
          if (selectedCell) {
            selectedCell.classList.remove('selected');
          }

          // Select matching cell
          matchingCell.classList.add('selected');
          matchingCell.scrollIntoView({block: 'nearest', inline: 'nearest'});
          updateGalleryPreview(matchingCell);
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
        const folderPath = iconViewContainer.dataset.basePath || '/';
        createNewFolder(folderPath);

      // Cmd+I to show info window
      } else if (e.metaKey && e.key === 'i') {
        const selectedCell = iconViewContainer.querySelector(
          selectedItemSelector
        );
        if (selectedCell) {
          e.preventDefault();
          const link = selectedCell.querySelector('a, p');
          const itemPath = link?.dataset?.path;
          if (itemPath) {
            showInfoWindow({jml, itemPath});
          }
        }

      // Cmd+O to open/navigate into selected folder or open file
      } else if (e.metaKey && e.key === 'o') {
        const selectedCell = iconViewContainer.querySelector(
          selectedItemSelector
        );

        if (selectedCell) {
          e.preventDefault();
          const link = selectedCell.querySelector('a');
          const span = selectedCell.querySelector('p,span');

          if (link) {
            // It's a folder - navigate into it
            selectedCell.dispatchEvent(new Event('dblclick'));
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
        const selectedCell = iconViewContainer.querySelector(
          selectedItemSelector
        );
        if (selectedCell) {
          e.preventDefault();
          const link = selectedCell.querySelector('a, p');
          const itemPath = link?.dataset?.path;
          if (itemPath) {
            setClipboard({path: itemPath, isCopy: true});
          }
        }

      // Cmd+X to cut selected item
      } else if (e.metaKey && e.key === 'x') {
        const selectedCell = iconViewContainer.querySelector(
          selectedItemSelector
        );
        if (selectedCell) {
          e.preventDefault();
          const link = selectedCell.querySelector('a, p');
          const itemPath = link?.dataset?.path;
          if (itemPath) {
            setClipboard({path: itemPath, isCopy: false});
          }
        }

      // Cmd+V to paste (copy) to current directory
      } else if (e.metaKey && e.key === 'v' && getClipboard()) {
        e.preventDefault();
        /* c8 ignore next -- TS */
        const targetDir = iconViewContainer.dataset.basePath || '/';
        const clip = getClipboard();
        copyOrMoveItem(clip.path, targetDir, clip.isCopy);
        setClipboard(null);

      // Cmd+Backspace to delete selected item
      } else if (e.metaKey && e.key === 'Backspace') {
        const selectedCell = iconViewContainer.querySelector(
          selectedItemSelector
        );
        if (selectedCell) {
          e.preventDefault();
          const link = selectedCell.querySelector('a, p');
          const itemPath = link?.dataset?.path;
          if (itemPath) {
            deleteItem(itemPath);
          }
        }

      // Enter key to rename selected item
      } else if (e.key === 'Enter') {
        const selectedCell = iconViewContainer.querySelector(
          selectedItemSelector
        );
        if (selectedCell) {
          e.preventDefault();
          const textElement = selectedCell.querySelector('a, p');
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

    iconViewContainer.addEventListener('keydown', keydownListener);
    // Store reference for cleanup
    // @ts-expect-error Custom property
    iconViewContainer._keydownListener = keydownListener;

    // Remove old drag handlers if they exist
    const oldDragoverHandler = iconViewContainer._dragoverHandler;
    if (oldDragoverHandler) {
      iconViewContainer.removeEventListener('dragover', oldDragoverHandler);
    }
    const oldDropHandler = iconViewContainer._dropHandler;
    if (oldDropHandler) {
      iconViewContainer.removeEventListener('drop', oldDropHandler);
    }

    // Add drop support for table background (empty space)
    const dragoverHandler = (e) => {
      // Only handle drops on the table itself or empty cells, not on items
      const {target} = e;
      const targetEl = /** @type {HTMLElement} */ (target);
      if (targetEl === iconViewContainer || targetEl.tagName === 'TR' ||
          (targetEl.tagName === 'TD' &&
            !targetEl.classList.contains('list-item'))) {
        e.preventDefault();
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = e.altKey ? 'copy' : 'move';
        }
      }
    };
    iconViewContainer.addEventListener('dragover', dragoverHandler);
    // @ts-expect-error Custom property
    iconViewContainer._dragoverHandler = dragoverHandler;

    const dropHandler = (e) => {
      const {target} = e;
      const targetEl = /** @type {HTMLElement} */ (target);
      // Only handle drops on the table itself or empty cells, not on items
      if (targetEl === iconViewContainer || targetEl.tagName === 'TR' ||
          (targetEl.tagName === 'TD' &&
            !targetEl.classList.contains('list-item'))) {
        e.preventDefault();
        e.stopPropagation();
        const sourcePath = e.dataTransfer?.getData('text/plain');
        /* c8 ignore next -- TS */
        const targetDir = iconViewContainer.dataset.basePath || '/';
        if (sourcePath && targetDir && !getIsCopyingOrMoving()) {
          copyOrMoveItem(sourcePath, targetDir, e.altKey);
        }
      }
    };
    iconViewContainer.addEventListener('drop', dropHandler);
    // @ts-expect-error Custom property
    iconViewContainer._dropHandler = dropHandler;

    // Add context menu for empty space in icon-view
    const contextmenuHandler = (e) => {
      const {target} = e;
      const targetEl = /** @type {HTMLElement} */ (target);

      // Check if clicking on actual content (link, icon, or text)
      // But allow if the parent is a valid empty space target
      const isContentClick = (targetEl.tagName === 'A' ||
        targetEl.tagName === 'P' ||
        targetEl.tagName === 'IMG') &&
        !targetEl.closest('tr, table[data-base-path]');

      // Show context menu on empty space (container, table, rows, cells,
      // or free-form items when not clicking content)
      if (!isContentClick && (
        targetEl === iconViewContainer ||
        targetEl.tagName === 'TABLE' ||
        targetEl.tagName === 'TR' ||
        targetEl.closest('table[data-base-path], tr') ||
        (targetEl.tagName === 'TD' &&
          !targetEl.classList.contains('list-item')) ||
        targetEl.classList.contains('icon-freeform-container') ||
        targetEl.classList.contains('icon-freeform-item')
      )) {
        e.preventDefault();
        e.stopPropagation();

        // Remove any existing context menus
        for (const menu of $$('.context-menu')) {
          menu.remove();
        }

        // Get current sort mode for icon-view
        const currentIconSortMode =
          localStorage.getItem('icon-view-sort-mode') || 'name';

        // Define cleanup function first so menu items can reference it
        const hideCustomContextMenu = (() => {
          let fn;
          return {
            set (f) {
              fn = f;
            },
            get () {
              return fn;
            }
          };
        })();

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
                createNewFolder(currentBasePath);
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
                    copyOrMoveItem(clip.path, currentBasePath, clip.isCopy);
                  }
                }
              }
            }, [
              'Paste'
            ]]]
            : []),
          ['li', {class: 'context-menu-separator'}],
          ['li', {
            class: 'context-menu-item has-submenu'
          }, [
            'Sort by',
            ['ul', {
              class: 'context-submenu'
            }, [
              ['li', {
                class: 'context-menu-item',
                $on: {
                  click () {
                    customContextMenu.remove();
                    const fn = hideCustomContextMenu.get();
                    if (fn) {
                      document.removeEventListener(
                        'click', fn, {capture: true}
                      );
                      document.removeEventListener(
                        'contextmenu', fn, {capture: true}
                      );
                    }
                    localStorage.setItem('icon-view-sort-mode', 'none');
                    changePath();
                  }
                }
              }, [
                currentIconSortMode === 'none' ? '✓ None' : 'None'
              ]],
              ['li', {
                class: 'context-menu-item',
                $on: {
                  click () {
                    customContextMenu.remove();
                    const fn = hideCustomContextMenu.get();
                    if (fn) {
                      document.removeEventListener(
                        'click', fn, {capture: true}
                      );
                      document.removeEventListener(
                        'contextmenu', fn, {capture: true}
                      );
                    }
                    localStorage.setItem('icon-view-sort-mode', 'snap');
                    changePath();
                  }
                }
              }, [
                currentIconSortMode === 'snap'
                  ? '✓ Snap to Grid'
                  : 'Snap to Grid'
              ]],
              ['li', {class: 'context-menu-separator'}],
              ['li', {
                class: 'context-menu-item',
                $on: {
                  click () {
                    customContextMenu.remove();
                    const fn = hideCustomContextMenu.get();
                    if (fn) {
                      document.removeEventListener(
                        'click', fn, {capture: true}
                      );
                      document.removeEventListener(
                        'contextmenu', fn, {capture: true}
                      );
                    }
                    localStorage.setItem('icon-view-sort-mode', 'name');
                    changePath();
                  }
                }
              }, [
                currentIconSortMode === 'name' ? '✓ Name' : 'Name'
              ]],
              ['li', {
                class: 'context-menu-item',
                $on: {
                  click () {
                    customContextMenu.remove();
                    const fn = hideCustomContextMenu.get();
                    if (fn) {
                      document.removeEventListener(
                        'click', fn, {capture: true}
                      );
                      document.removeEventListener(
                        'contextmenu', fn, {capture: true}
                      );
                    }
                    localStorage.setItem('icon-view-sort-mode', 'kind');
                    changePath();
                  }
                }
              }, [
                currentIconSortMode === 'kind' ? '✓ Kind' : 'Kind'
              ]],
              ['li', {
                class: 'context-menu-item',
                $on: {
                  click () {
                    customContextMenu.remove();
                    const fn = hideCustomContextMenu.get();
                    if (fn) {
                      document.removeEventListener(
                        'click', fn, {capture: true}
                      );
                      document.removeEventListener(
                        'contextmenu', fn, {capture: true}
                      );
                    }
                    localStorage.setItem(
                      'icon-view-sort-mode', 'dateOpened'
                    );
                    changePath();
                  }
                }
              }, [
                currentIconSortMode === 'dateOpened'
                  ? '✓ Date Last Opened'
                  : 'Date Last Opened'
              ]],
              ['li', {
                class: 'context-menu-item',
                $on: {
                  click () {
                    customContextMenu.remove();
                    const fn = hideCustomContextMenu.get();
                    if (fn) {
                      document.removeEventListener(
                        'click', fn, {capture: true}
                      );
                      document.removeEventListener(
                        'contextmenu', fn, {capture: true}
                      );
                    }
                    localStorage.setItem(
                      'icon-view-sort-mode', 'dateAdded'
                    );
                    changePath();
                  }
                }
              }, [
                currentIconSortMode === 'dateAdded'
                  ? '✓ Date Added'
                  : 'Date Added'
              ]],
              ['li', {
                class: 'context-menu-item',
                $on: {
                  click () {
                    customContextMenu.remove();
                    const fn = hideCustomContextMenu.get();
                    if (fn) {
                      document.removeEventListener(
                        'click', fn, {capture: true}
                      );
                      document.removeEventListener(
                        'contextmenu', fn, {capture: true}
                      );
                    }
                    localStorage.setItem(
                      'icon-view-sort-mode',
                      'dateModified'
                    );
                    changePath();
                  }
                }
              }, [
                currentIconSortMode === 'dateModified'
                  ? '✓ Date Modified'
                  : 'Date Modified'
              ]],
              ['li', {
                class: 'context-menu-item',
                $on: {
                  click () {
                    customContextMenu.remove();
                    const fn = hideCustomContextMenu.get();
                    if (fn) {
                      document.removeEventListener(
                        'click', fn, {capture: true}
                      );
                      document.removeEventListener(
                        'contextmenu', fn, {capture: true}
                      );
                    }
                    localStorage.setItem(
                      'icon-view-sort-mode',
                      'dateCreated'
                    );
                    changePath();
                  }
                }
              }, [
                currentIconSortMode === 'dateCreated'
                  ? '✓ Date Created'
                  : 'Date Created'
              ]],
              ['li', {
                class: 'context-menu-item',
                $on: {
                  click () {
                    customContextMenu.remove();
                    const fn = hideCustomContextMenu.get();
                    if (fn) {
                      document.removeEventListener(
                        'click', fn, {capture: true}
                      );
                      document.removeEventListener(
                        'contextmenu', fn, {capture: true}
                      );
                    }
                    localStorage.setItem('icon-view-sort-mode', 'size');
                    changePath();
                  }
                }
              }, [
                currentIconSortMode === 'size' ? '✓ Size' : 'Size'
              ]]
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
            customContextMenu.style.left =
              (viewportWidth - menuRect.width - 10) + 'px';
          }

          if (menuRect.left < 0) {
            customContextMenu.style.left = '10px';
          }

          // Adjust vertical position if needed
          if (menuRect.bottom > viewportHeight) {
            customContextMenu.style.top =
              (viewportHeight - menuRect.height - 10) + 'px';
          }

          if (menuRect.top < 0) {
            customContextMenu.style.top = '10px';
          }
        });

        // Hide the custom context menu when clicking anywhere else
        const hideMenuFn = () => {
          customContextMenu.remove();
          document.removeEventListener(
            'click', hideMenuFn, {capture: true}
          );
          document.removeEventListener(
            'contextmenu', hideMenuFn, {capture: true}
          );
        };
        hideCustomContextMenu.set(hideMenuFn);
        document.addEventListener('click', hideMenuFn, {
          capture: true
        });
        document.addEventListener('contextmenu', hideMenuFn, {
          capture: true
        });
      }
    };

    // Remove old context menu handler if it exists
    const oldContextmenuHandler = iconViewContainer._contextmenuHandler;
    if (oldContextmenuHandler) {
      iconViewContainer.removeEventListener(
        'contextmenu', oldContextmenuHandler
      );
    }
    iconViewContainer.addEventListener('contextmenu', contextmenuHandler);
    // @ts-expect-error Custom property
    iconViewContainer._contextmenuHandler = contextmenuHandler;

    // Focus the table for keyboard navigation
    requestAnimationFrame(() => {
      iconViewContainer.focus();
    });
    return;
  }

  // List view implementation
  if (view === 'list-view') {
    // Update breadcrumbs for list view
    updateBreadcrumbs(currentBasePath);

    // Tree view expansion state (persisted across refreshes)
    const expansionStateKey = 'list-view-expansion-state';
    const storedExpansionState = localStorage.getItem(expansionStateKey);
    const expandedPaths = storedExpansionState
      ? new Set(JSON.parse(storedExpansionState))
      : new Set();

    const saveExpansionState = () => {
      localStorage.setItem(
        expansionStateKey,
        JSON.stringify([...expandedPaths])
      );
    };

    // Get or initialize column configuration
    const defaultColumns = [
      {id: 'icon', label: '', width: '40px',
        visible: true, sortable: false},
      {id: 'name', label: 'Name', width: 'auto',
        visible: true, sortable: true},
      {id: 'dateModified', label: 'Date Modified', width: '180px',
        visible: true, sortable: true},
      {id: 'dateCreated', label: 'Date Created', width: '180px',
        visible: true, sortable: true},
      {id: 'size', label: 'Size', width: '100px',
        visible: true, sortable: true},
      {id: 'kind', label: 'Kind', width: '150px',
        visible: true, sortable: true},
      {id: 'dateOpened', label: 'Date Last Opened', width: '180px',
        visible: false, sortable: true},
      {id: 'version', label: 'Version', width: '100px',
        visible: false, sortable: true},
      {id: 'comments', label: 'Comments', width: '200px',
        visible: false, sortable: true}
    ];

    const storedColumns = localStorage.getItem('list-view-columns');
    let columns = storedColumns
      ? JSON.parse(storedColumns)
      : defaultColumns;

    // Update sortable property from defaults (in case defaults changed)
    if (storedColumns) {
      columns = columns.map((col) => {
        const defaultCol = defaultColumns.find((dc) => dc.id === col.id);
        if (defaultCol && defaultCol.sortable !== col.sortable) {
          return {...col, sortable: defaultCol.sortable};
        }
        return col;
      });
    }

    // Get sorting state
    const storedSort = localStorage.getItem('list-view-sort');
    let sortColumn = 'name';
    let sortDirection = 'asc';
    if (storedSort) {
      const sortState = JSON.parse(storedSort);
      sortColumn = sortState.column;
      sortDirection = sortState.direction;
    }

    // Prepare data for list view - only fetch minimal data initially
    const listViewData = result.map(([isDir, childDir, title]) => {
      const itemPath = path.join(childDir, title);
      const encodedPath = basePath + encodeURIComponent(title);

      try {
        const lstat = lstatSync(itemPath);

        return {
          isDir,
          title,
          encodedPath,
          itemPath,
          size: lstat.size,
          dateModified: lstat.mtimeMs,
          dateCreated: lstat.birthtimeMs,
          // Lazy-loaded fields - will be populated on demand
          dateOpened: null,
          version: null,
          kind: null,
          comments: null,
          // Track if metadata has been loaded
          _metadataLoaded: false
        };
      /* c8 ignore next 16 -- Guard */
      } catch (err) {
        return {
          isDir,
          title,
          encodedPath,
          itemPath,
          size: 0,
          dateModified: 0,
          dateCreated: 0,
          dateOpened: null,
          version: null,
          kind: null,
          comments: null,
          _metadataLoaded: false
        };
      }
    });

    // Sort data
    listViewData.sort((a, b) => {
      // Folders always come first
      if (a.isDir !== b.isDir) {
        return a.isDir ? -1 : 1;
      }

      let comparison = 0;
      switch (sortColumn) {
      case 'name':
        comparison = a.title.localeCompare(b.title, undefined, {
          numeric: true,
          sensitivity: 'base'
        });
        break;
      case 'size':
        comparison = a.size - b.size;
        break;
      case 'dateModified':
        comparison = a.dateModified - b.dateModified;
        break;
      case 'dateCreated':
        comparison = a.dateCreated - b.dateCreated;
        break;
      case 'dateOpened':
        comparison = a.dateOpened - b.dateOpened;
        break;
      case 'kind':
        comparison = (a.kind || '').localeCompare(b.kind || '', undefined, {
          sensitivity: 'base'
        });
        break;
      case 'version':
        comparison = (a.version || '').localeCompare(
          b.version || '', undefined, {
            numeric: true,
            sensitivity: 'base'
          }
        );
        break;
      case 'comments':
        comparison = (a.comments || '').localeCompare(
          b.comments || '', undefined, {
            sensitivity: 'base'
          }
        );
        break;
      default:
        // comparison already 0
        break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    // Build table
    const listViewTable = $('.list-view-table');
    const thead = listViewTable.querySelector('thead tr');
    const tbody = listViewTable.querySelector('tbody');

    // Clear existing content
    thead.innerHTML = '';
    tbody.innerHTML = '';

    // Build header
    columns.forEach((col) => {
      if (col.visible) {
        const th = document.createElement('th');
        th.textContent = col.label;
        th.dataset.columnId = col.id;
        if (col.sortable) {
          th.classList.add('sortable');
          if (sortColumn === col.id) {
            th.classList.add(
              sortDirection === 'asc' ? 'sort-asc' : 'sort-desc'
            );
          }
          th.addEventListener('click', () => {
            // Toggle sort
            if (sortColumn === col.id) {
              sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
              sortColumn = col.id;
              sortDirection = 'asc';
            }
            localStorage.setItem('list-view-sort', JSON.stringify({
              column: sortColumn,
              direction: sortDirection
            }));
            changePath();
          });
        }
        if (col.width !== 'auto') {
          th.style.width = col.width;
        }
        thead.append(th);
      }
    });

    // Check which columns need metadata
    const needsKind = columns.some((c) => c.id === 'kind' && c.visible);
    const needsDateOpened = columns.some(
      (c) => c.id === 'dateOpened' && c.visible
    );
    const needsVersion = columns.some(
      (c) => c.id === 'version' && c.visible
    );
    const needsComments = columns.some(
      (c) => c.id === 'comments' && c.visible
    );
    const needsMetadata = needsDateOpened || needsVersion || needsComments;

    // Track items and cells that need metadata updates
    const pendingMetadataItems = [];

    // Function to build a row with optional tree indentation
    const buildRow = (item, depth = 0) => {
      const tr = document.createElement('tr');
      tr.dataset.path = item.encodedPath;
      tr.dataset.depth = depth.toString();

      columns.forEach((col) => {
        if (col.visible) {
          const td = document.createElement('td');
          td.classList.add(`list-view-${col.id}`);

          switch (col.id) {
          case 'icon': {
            // Add expander triangle for folders in tree mode (before icon)
            if (getListViewTreeMode() && item.isDir) {
              const expander = document.createElement('span');
              expander.className = 'tree-expander';
              expander.textContent = '▶';
              expander.dataset.path = item.encodedPath;

              // Don't set expanded state here - let restoration logic handle it
              // This ensures children are properly loaded when restoring state

              expander.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                // Check visual state instead of Set for restoration
                const isCurrentlyExpanded =
                  expander.classList.contains('expanded');

                if (isCurrentlyExpanded) {
                  // Collapse: remove from expanded set
                  expandedPaths.delete(item.itemPath);
                  expander.classList.remove('expanded');

                  // Remove all child rows
                  let nextRow = tr.nextElementSibling;
                  while (nextRow &&
                    Number.parseInt(nextRow.dataset.depth) > depth) {
                    const rowToRemove = nextRow;
                    nextRow = nextRow.nextElementSibling;
                    rowToRemove.remove();
                  }
                } else {
                  // Expand: add to expanded set
                  expandedPaths.add(item.itemPath);
                  expander.classList.add('expanded');

                  // Load and display children
                  try {
                    const childResult = readDirectory(item.itemPath);
                    const childData = childResult.map(([
                      isDir, childDir, title
                    ]) => {
                      const childItemPath = path.join(childDir, title);
                      const childEncodedPath = item.encodedPath +
                        '/' + encodeURIComponent(title);

                      try {
                        const lstat = lstatSync(childItemPath);
                        return {
                          isDir,
                          title,
                          encodedPath: childEncodedPath,
                          itemPath: childItemPath,
                          size: lstat.size,
                          dateModified: lstat.mtimeMs,
                          dateCreated: lstat.birthtimeMs,
                          dateOpened: null,
                          version: null,
                          kind: null,
                          comments: null,
                          _metadataLoaded: false
                        };
                      /* c8 ignore next 16 -- Guard */
                      } catch (err) {
                        return {
                          isDir,
                          title,
                          encodedPath: childEncodedPath,
                          itemPath: childItemPath,
                          size: 0,
                          dateModified: 0,
                          dateCreated: 0,
                          dateOpened: null,
                          version: null,
                          kind: null,
                          comments: null,
                          _metadataLoaded: false
                        };
                      }
                    });

                    // Sort child data
                    childData.sort((a, b) => {
                      if (a.isDir !== b.isDir) {
                        return a.isDir ? -1 : 1;
                      }
                      let comparison = 0;
                      switch (sortColumn) {
                      case 'name':
                        comparison = a.title.localeCompare(b.title, undefined, {
                          numeric: true,
                          sensitivity: 'base'
                        });
                        break;
                      case 'size':
                        comparison = a.size - b.size;
                        break;
                      case 'dateModified':
                        comparison = a.dateModified - b.dateModified;
                        break;
                      case 'dateCreated':
                        comparison = a.dateCreated - b.dateCreated;
                        break;
                      default:
                        break;
                      }
                      return sortDirection === 'asc' ? comparison : -comparison;
                    });

                    // Insert child rows after current row
                    let insertAfter = tr;
                    childData.forEach((childItem) => {
                      try {
                        const childRow = buildRow(childItem, depth + 1);
                        insertAfter.after(childRow);
                        insertAfter = childRow;
                      /* c8 ignore next 4 -- Guard */
                      } catch (err) {
                        // eslint-disable-next-line no-console -- Error logging
                        console.error('Error building child row:', err);
                      }
                    });
                  /* c8 ignore next 4 -- Guard */
                  } catch (err) {
                    // eslint-disable-next-line no-console -- Error logging
                    console.error('Error loading child directory:', err);
                  }
                }

                saveExpansionState();
              });

              td.append(expander);
            } else if (getListViewTreeMode()) {
              // Add empty expander space for non-folders
              const expander = document.createElement('span');
              expander.className = 'tree-expander empty';
              expander.textContent = '▶';
              td.append(expander);
            }

            // Add icon (will be loaded asynchronously)
            const img = document.createElement('img');
            img.src = '';
            img.alt = '';
            td.append(img);
            getIconDataURLForFile(item.itemPath).then((url) => {
              if (img && url) {
                img.src = url;
              }
              return undefined;
            });
            break;
          }
          case 'name':
            // Add tree indentation if in tree mode
            if (getListViewTreeMode() && depth > 0) {
              for (let i = 0; i < depth; i++) {
                const indent = document.createElement('span');
                indent.className = 'tree-indent';
                td.append(indent);
              }
            }

            if (item.isDir) {
              const a = document.createElement('a');
              a.href = '#path=' + item.encodedPath;
              a.textContent = item.title;
              a.dataset.path = item.encodedPath;
              a.addEventListener('contextmenu', folderContextmenu);
              // Prevent navigation on single click
              a.addEventListener('click', (e) => {
                e.preventDefault();
                // Selection is handled by the row click handler
              });
              td.append(a);
            } else {
              const span = document.createElement('span');
              span.textContent = item.title;
              span.dataset.path = item.encodedPath;
              span.addEventListener('contextmenu', contextmenu);
              td.append(span);
            }
            break;
          case 'size':
            td.textContent = item.isDir ? '--' : filesize(item.size);
            break;
          case 'dateModified':
            td.textContent = item.dateModified
              ? getFormattedDate(item.dateModified)
              /* c8 ignore next - defensive: files always have modified dates */
              : '';
            break;
          case 'dateCreated':
            td.textContent = item.dateCreated
              ? getFormattedDate(item.dateCreated)
              : '';
            break;
          case 'dateOpened':
            if (item.dateOpened === null) {
              td.textContent = '';
              td.dataset.needsMetadata = 'dateOpened';
              pendingMetadataItems.push({item, td, field: 'dateOpened'});
            /* c8 ignore next 6 - defensive: items start
              with null, loaded async */
            } else {
              td.textContent = item.dateOpened && item.dateOpened > 0
                ? getFormattedDate(item.dateOpened)
                : '';
            }
            break;
          case 'kind':
            if (item.kind === null) {
              td.textContent = item.isDir ? 'Folder' : '';
              td.dataset.needsMetadata = 'kind';
              pendingMetadataItems.push({item, td, field: 'kind'});
            /* c8 ignore next 4 - defensive: items start
              with null, loaded async */
            } else {
              td.textContent = item.kind;
            }
            break;
          case 'version':
            if (item.version === null) {
              td.textContent = '';
              td.dataset.needsMetadata = 'version';
              pendingMetadataItems.push({item, td, field: 'version'});
            /* c8 ignore next 4 - defensive: items start with
               null, loaded async */
            } else {
              td.textContent = item.version;
            }
            break;
          case 'comments':
            if (item.comments === null) {
              td.textContent = '';
              td.dataset.needsMetadata = 'comments';
              pendingMetadataItems.push({item, td, field: 'comments'});
            /* c8 ignore next 4 - defensive: items start
               with null, loaded async */
            } else {
              td.textContent = item.comments;
            }
            break;
          /* c8 ignore next 4 - defensive: all known columns
             handled above */
          default:
            td.textContent = '';
          }

          tr.append(td);
        }
      });

      // Add click handler for row selection
      tr.addEventListener('click', (e) => {
        // Don't handle selection if clicking expander
        /* c8 ignore next 3 -- Tree mode expander clicks */
        if (e.target.classList.contains('tree-expander')) {
          return;
        }

        // Save the selected item path for restoration after refresh
        lastSelectedItemPath = item.encodedPath;

        // Remove previous selection
        const prevSelected = tbody.querySelector('tr.selected');
        if (prevSelected) {
          prevSelected.classList.remove('selected');
        }

        // Add selection to clicked row
        tr.classList.add('selected');
      });

      // Add double-click handler
      tr.addEventListener('dblclick', (e) => {
        // Don't navigate if clicking expander
        /* c8 ignore next 3 -- Tree mode expander clicks */
        if (e.target.classList.contains('tree-expander')) {
          return;
        }

        e.preventDefault();
        if (item.isDir) {
          location.href = '#path=' + item.encodedPath;
        } else {
          const decodedPath = decodeURIComponent(item.encodedPath);
          // @ts-expect-error - Test hook
          if (globalThis.testShellOpenPath) {
            // @ts-expect-error - Test hook
            globalThis.testShellOpenPath(decodedPath);
          /* c8 ignore next 3 -- Test hook bypasses this path */
          } else {
            globalThis.electronAPI.shell.openPath(decodedPath);
          }
        }
      });

      // Add drag-and-drop support
      addDragAndDropSupport(tr, item.encodedPath, item.isDir);

      return tr;
    };

    // Build rows for all items at root level
    listViewData.forEach((item) => {
      const tr = buildRow(item, 0);
      tbody.append(tr);
    });

    // Restore expanded folders in tree mode
    if (getListViewTreeMode() && expandedPaths.size > 0) {
      // Recursively expand folders that should be expanded
      // Process synchronously to ensure proper nesting
      const expandRowsRecursively = () => {
        // Get all current rows (including newly added children)
        const allRows = [...tbody.querySelectorAll('tr')];
        let expandedAny = false;

        for (const row of allRows) {
          const rowPath = row.dataset.path;
          /* c8 ignore next 3 -- Guard  */
          if (!rowPath) {
            continue;
          }

          // Decode the path to get the actual item path
          const decodedPath = decodeURIComponent(rowPath);

          // Check if this folder should be expanded
          if (expandedPaths.has(decodedPath)) {
            const expander = row.querySelector('.tree-expander');
            if (expander && !expander.classList.contains('expanded')) {
              // Trigger click to expand
              expander.click();
              expandedAny = true;
            }
          }
        }

        // If we expanded any folders, recursively check for nested folders
        // that also need to be expanded (using setTimeout to let DOM update)
        if (expandedAny) {
          setTimeout(expandRowsRecursively, 0);
        }
      };

      expandRowsRecursively();
    }

    // Restore previously selected item after refresh
    // Skip auto-selection if creating/renaming (it will handle selection)
    if (!isCreating) {
      const allRows = tbody.querySelectorAll('tr');
      let rowToSelect = null;

      if (lastSelectedItemPath) {
        rowToSelect = [...allRows].find((row) => {
          return row.dataset.path === lastSelectedItemPath;
        });
      }

      // If we found the previously selected item, restore it
      // Otherwise, select the first item
      if (rowToSelect) {
        // Remove any other selections first
        const prevSelected = tbody.querySelector('tr.selected');
        /* c8 ignore start - defensive: tbody just
          rebuilt, no selection exists yet */
        if (prevSelected) {
          prevSelected.classList.remove('selected');
        }
        /* c8 ignore stop */
        // Apply selection
        rowToSelect.classList.add('selected');
        // Scroll into view
        requestAnimationFrame(() => {
          rowToSelect.scrollIntoView({block: 'nearest'});
        });
      } else if (allRows.length > 0) {
        // No previously selected item found, select the first item
        allRows[0].classList.add('selected');
      }
    }

    // Batch load metadata for all pending items
    if (pendingMetadataItems.length > 0) {
      const loadBatchMetadata = () => {
        // eslint-disable-next-line @stylistic/max-len -- Long
        // console.log('[batch] Loading metadata for', pendingMetadataItems.length, 'items');

        // Group items by unique paths to avoid duplicate fetches
        const uniqueItems = new Map();
        for (const {item, td, field} of pendingMetadataItems) {
          if (!uniqueItems.has(item.itemPath)) {
            uniqueItems.set(item.itemPath, {item, cells: []});
          }
          uniqueItems.get(item.itemPath).cells.push({td, field});
        }

        const itemsArray = [...uniqueItems.entries()];
        const CHUNK_SIZE = 5; // Process 5 items at a time
        let currentIndex = 0;

        const processChunk = (deadline) => {
          // Process items while we have time or until chunk is done
          while (currentIndex < itemsArray.length &&
                 (deadline.timeRemaining() > 0 || deadline.didTimeout)) {
            const [/* itemPath */, {item, cells}] = itemsArray[currentIndex];
            currentIndex++;

            /* c8 ignore start -- Defensive: items start with
              _metadataLoaded false and aren't re-queued after loading */
            if (item._metadataLoaded) {
              // Already loaded, just update cells
              cells.forEach(({td, field}) => {
                // Guard: check if element is still in DOM
                if (!td.isConnected) {
                  return;
                }
                switch (field) {
                case 'kind':
                  td.textContent = item.kind || '';
                  break;
                case 'dateOpened':
                  td.textContent = item.dateOpened && item.dateOpened > 0
                    ? getFormattedDate(item.dateOpened)
                    : '';
                  break;
                case 'version':
                  td.textContent = item.version || '';
                  break;
                case 'comments':
                  td.textContent = item.comments || '';
                  break;
                /* c8 ignore next 3 -- Guard */
                default:
                  break;
                }
              });
              continue;
            }
            /* c8 ignore stop */

            item._metadataLoaded = true;

            try {
              // Load kind if needed
              if (needsKind && item.kind === null) {
                item.kind = getFileKind(item.itemPath);
              }

              // Load other metadata if needed
              if (needsMetadata) {
                const metadata = getFileMetadata(item.itemPath);

                if (needsDateOpened && item.dateOpened === null) {
                  const dateOpened = metadata.ItemLastUsedDate;
                  /* c8 ignore next 4 -- Uncommon: most test files lack
                    ItemLastUsedDate or it comes as string */
                  if (dateOpened && typeof dateOpened === 'object' &&
                    'getTime' in dateOpened) {
                    item.dateOpened = dateOpened.getTime();
                  } else if (typeof dateOpened === 'string' && dateOpened) {
                    item.dateOpened = new Date(dateOpened).getTime();
                  } else {
                    item.dateOpened = 0;
                  }
                }

                if (needsVersion && item.version === null) {
                  item.version = metadata.ItemVersion || '';
                }

                if (needsComments && item.comments === null) {
                  item.comments = metadata.ItemFinderComment || '';
                }
              }

              // Update all cells for this item
              cells.forEach(({td, field}) => {
                // Guard: check if element is still in DOM
                // (tree might have collapsed)
                /* c8 ignore next 3 -- Guard */
                if (!td.isConnected) {
                  return;
                }
                switch (field) {
                /* c8 ignore next 3 -- Covered by earlier sync kind loading */
                case 'kind':
                  td.textContent = item.kind || '';
                  break;
                case 'dateOpened':
                  td.textContent = item.dateOpened && item.dateOpened > 0
                    ? getFormattedDate(item.dateOpened)
                    : '';
                  break;
                case 'version':
                  td.textContent = item.version || '';
                  break;
                case 'comments':
                  td.textContent = item.comments || '';
                  break;
                /* c8 ignore next 3 -- Guard */
                default:
                  break;
                }
              });
            /* c8 ignore start -- Guard */
            } catch (err) {
              // eslint-disable-next-line @stylistic/max-len -- Long
              // console.error('[batch] Error loading metadata for', item.title, ':', err);
              // Set defaults on error
              if (item.kind === null) {
                item.kind = item.isDir ? 'Folder' : 'Document';
              }
              if (item.dateOpened === null) {
                item.dateOpened = 0;
              }
              if (item.version === null) {
                item.version = '';
              }
              if (item.comments === null) {
                item.comments = '';
              }

              // Update cells with defaults
              cells.forEach(({td, field}) => {
                switch (field) {
                case 'kind':
                  td.textContent = item.kind || '';
                  break;
                case 'dateOpened':
                  td.textContent = '';
                  break;
                case 'version':
                  td.textContent = '';
                  break;
                case 'comments':
                  td.textContent = '';
                  break;
                /* c8 ignore next 3 -- Guard */
                default:
                  break;
                }
              });
            }
            /* c8 ignore stop -- Guard */

            // Break after processing chunk size, even if we have time
            if (currentIndex % CHUNK_SIZE === 0) {
              break;
            }
          }

          // Schedule next chunk if there are more items
          if (currentIndex < itemsArray.length) {
            batchMetadataCallbackHandle =
              'requestIdleCallback' in globalThis
                ? requestIdleCallback(processChunk, {timeout: 100})
                /* c8 ignore next 5 -- Fallback for environments
                   without requestIdleCallback */
                : setTimeout(() => processChunk({
                  timeRemaining: () => 50, didTimeout: false
                }), 0);
          } else {
            // eslint-disable-next-line no-console -- Debugging
            console.log('[batch] Metadata loading complete');
            batchMetadataCallbackHandle = null;
          }
        };

        // Start processing
        batchMetadataCallbackHandle =
          'requestIdleCallback' in globalThis
            ? requestIdleCallback(processChunk, {timeout: 100})
            /* c8 ignore next 5 -- Fallback for environments
               without requestIdleCallback */
            : setTimeout(() => processChunk({
              timeRemaining: () => 50, didTimeout: false
            }), 0);
      };

      loadBatchMetadata();
    }

    // Tree mode toggle button
    const treeModeToggle = $('.tree-mode-toggle');
    if (treeModeToggle) {
      // Update button state
      treeModeToggle.style.opacity = getListViewTreeMode() ? '1' : '0.5';

      // Remove any existing click listener
      // @ts-expect-error Custom property
      const oldTreeToggleListener = treeModeToggle._treeToggleListener;
      if (oldTreeToggleListener) {
        treeModeToggle.removeEventListener('click', oldTreeToggleListener);
      }

      const treeToggleListener = async () => {
        const {toggleListViewTreeMode} =
          await import('./state/flags.js');
        toggleListViewTreeMode();
        changePath(); // Refresh the view
      };

      // @ts-expect-error Custom property
      treeModeToggle._treeToggleListener = treeToggleListener;
      treeModeToggle.addEventListener('click', treeToggleListener);
    }

    // Column picker
    const columnPickerButton = $('.column-picker-button');
    const existingPicker = $('.column-picker-menu');
    if (existingPicker) {
      existingPicker.remove();
    }

    // Remove any existing click listener to avoid duplicates
    // @ts-expect-error Custom property
    const oldPickerListener = columnPickerButton._pickerClickListener;
    if (oldPickerListener) {
      columnPickerButton.removeEventListener('click', oldPickerListener);
    }

    const pickerClickListener = (e) => {
      e.stopPropagation();

      // Remove existing picker if present
      const existing = $('.column-picker-menu');
      if (existing) {
        existing.remove();
        return;
      }

      // Create column picker menu
      const pickerMenu = document.createElement('div');
      pickerMenu.className = 'column-picker-menu';

      // Define closePickerFn first so checkboxes can reference it
      const closePickerFn = (() => {
        let fn;
        return {
          set (f) {
            fn = f;
          },
          get () {
            return fn;
          }
        };
      })();

      columns.forEach((col) => {
        if (col.id === 'icon' || col.id === 'name') {
          return; // Skip icon and name columns (always visible)
        }

        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = col.visible;
        checkbox.dataset.columnId = col.id;
        checkbox.addEventListener('change', () => {
          col.visible = checkbox.checked;
          localStorage.setItem(
            'list-view-columns', JSON.stringify(columns)
          );
          // Remove picker menu and its event listeners before changePath
          if (pickerMenu.parentNode) {
            pickerMenu.remove();
          }
          const fn = closePickerFn.get();
          if (fn) {
            document.removeEventListener('click', fn);
          }
          changePath();
        });

        label.append(checkbox);
        label.append(document.createTextNode(col.label));
        pickerMenu.append(label);
      });

      // Position near button
      const buttonRect = columnPickerButton.getBoundingClientRect();
      pickerMenu.style.position = 'absolute';
      pickerMenu.style.top = (buttonRect.bottom + 5) + 'px';
      pickerMenu.style.right = '10px';

      document.body.append(pickerMenu);

      // Close picker when clicking outside
      const closeMenuFn = (evt) => {
        if (!pickerMenu.contains(/** @type {Node} */ (evt.target)) &&
            evt.target !== columnPickerButton) {
          pickerMenu.remove();
          document.removeEventListener('click', closeMenuFn);
        }
      };
      closePickerFn.set(closeMenuFn);
      setTimeout(() => {
        document.addEventListener('click', closeMenuFn);
      }, 0);
    };

    columnPickerButton.addEventListener('click', pickerClickListener);
    // Store reference for cleanup
    // @ts-expect-error Custom property
    columnPickerButton._pickerClickListener = pickerClickListener;

    // Add keyboard support
    listViewTable.setAttribute('tabindex', '0');

    // Remove any existing keydown listeners to avoid duplicates
    // @ts-expect-error Custom property
    const oldListener = listViewTable._keydownListener;
    if (oldListener) {
      listViewTable.removeEventListener('keydown', oldListener);
    }

    // Typeahead search state
    let typeaheadBuffer = '';
    let typeaheadTimeout = null;

    const keydownListener = (e) => {
      const selectedRow = tbody.querySelector('tr.selected');
      const allRows = [...tbody.querySelectorAll('tr')];

      if (allRows.length === 0) {
        return;
      }

      // Handle arrow key navigation
      if (['ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        const currentIndex = selectedRow ? allRows.indexOf(selectedRow) : -1;
        let newIndex = currentIndex;

        if (e.key === 'ArrowDown') {
          newIndex = currentIndex + 1;
        } else if (e.key === 'ArrowUp') {
          newIndex = currentIndex - 1;
        }

        if (newIndex >= 0 && newIndex < allRows.length) {
          if (selectedRow) {
            selectedRow.classList.remove('selected');
          }
          const newRow = allRows[newIndex];
          newRow.classList.add('selected');
          newRow.scrollIntoView({block: 'nearest'});
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

        // Find matching row
        const matchingRow = allRows.find((row) => {
          const nameCell = row.querySelector('.list-view-name');

          /* c8 ignore next -- Guard */
          const text = nameCell?.textContent?.toLowerCase() || '';
          return text.startsWith(typeaheadBuffer);
        });

        if (matchingRow) {
          // Remove previous selection
          if (selectedRow) {
            selectedRow.classList.remove('selected');
          }

          // Select matching row
          matchingRow.classList.add('selected');
          matchingRow.scrollIntoView({block: 'nearest'});
        }

        // Clear buffer after 1 second of inactivity
        typeaheadTimeout = setTimeout(() => {
          typeaheadBuffer = '';
        }, 1000);
        return;
      }

      // Handle Enter key to rename selected item
      if (e.key === 'Enter' && selectedRow) {
        e.preventDefault();
        const nameCell = selectedRow.querySelector('.list-view-name');
        const textElement = nameCell?.querySelector('a, span');
        if (textElement) {
          startRename(textElement);
        }
        return;
      }

      // Cmd+O to open selected item
      if (e.metaKey && e.key === 'o' && selectedRow) {
        e.preventDefault();
        selectedRow.dispatchEvent(new Event('dblclick'));
        return;
      }

      // Other keyboard shortcuts
      if (e.metaKey && e.shiftKey && e.key === 'n') {
        e.preventDefault();
        createNewFolder(currentBasePath);
      } else if (e.metaKey && e.key === 'i' && selectedRow) {
        e.preventDefault();
        const itemPath = selectedRow.dataset.path;
        if (itemPath) {
          showInfoWindow({jml, itemPath});
        }
      } else if (e.metaKey && e.key === 'c' && selectedRow) {
        e.preventDefault();
        const itemPath = selectedRow.dataset.path;
        if (itemPath) {
          setClipboard({path: itemPath, isCopy: true});
        }
      } else if (e.metaKey && e.key === 'x' && selectedRow) {
        e.preventDefault();
        const itemPath = selectedRow.dataset.path;
        if (itemPath) {
          setClipboard({path: itemPath, isCopy: false});
        }
      } else if (e.metaKey && e.key === 'v' && getClipboard()) {
        e.preventDefault();
        const clip = getClipboard();
        copyOrMoveItem(clip.path, currentBasePath, clip.isCopy);
        setClipboard(null);
      } else if (e.metaKey && e.key === 'Backspace' && selectedRow) {
        e.preventDefault();
        const itemPath = selectedRow.dataset.path;
        if (itemPath) {
          deleteItem(itemPath);
        }
      } else if (e.metaKey && e.shiftKey && e.key === 'h') {
        e.preventDefault();
        globalThis.location.hash = '#path=' +
          encodeURIComponent(globalThis.electronAPI.os.homedir());
      } else if (e.metaKey && e.shiftKey && e.key === 'd') {
        e.preventDefault();
        const desktopDir = path.join(
          globalThis.electronAPI.os.homedir(),
          'Desktop'
        );
        globalThis.location.hash = `#path=${encodeURIComponent(desktopDir)}`;
      } else if (e.metaKey && e.shiftKey && e.key === 'a') {
        e.preventDefault();
        globalThis.location.hash = '#path=/Applications';
      } else if (e.metaKey && e.shiftKey && e.key === 'u') {
        e.preventDefault();
        globalThis.location.hash = '#path=/Applications/Utilities';
      } else if (e.metaKey && e.key === '[') {
        e.preventDefault();
        history.back();
      } else if (e.metaKey && e.key === ']') {
        e.preventDefault();
        history.forward();
      }
    };

    listViewTable.addEventListener('keydown', keydownListener);
    // Store reference for cleanup
    // @ts-expect-error Custom property
    listViewTable._keydownListener = keydownListener;

    // Focus the table
    requestAnimationFrame(() => {
      listViewTable.focus();
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
      /* c8 ignore next 7 -- Guard */
      } catch (err) {
        // If preview fails, return a basic error message
        const errMsg = err && typeof err === 'object' && 'message' in err
          ? String(err.message)
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
  } else if (e.metaKey && e.key === '2') {
    // Cmd+2 to switch to list view
    e.preventDefault();
    $('#list-view').click();
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
$('#list-view').addEventListener('click', function () {
  $$('nav button').forEach((button) => {
    button.classList.remove('selected');
  });
  this.classList.add('selected');
  localStorage.setItem('view', 'list-view');
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
case 'list-view':
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
