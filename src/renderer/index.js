/* eslint-disable n/no-sync,
  promise/prefer-await-to-then,
  promise/catch-or-return -- Needed for performance */
import {jml} from 'jamilih';
import jQuery from 'jquery';
import addMillerColumnPlugin from 'miller-columns';
import {chunk} from './utils/array.js';
import {$, $$, $$active} from './utils/dom.js';
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
  isDeleting,
  isCreating,
  setIsCreating,
  isRefreshing,
  isWatcherRefreshing,
  setIsWatcherRefreshing
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
import {on} from './events/eventBus.js';

// Get Node APIs from the preload script
const {
  fs: {
    mkdirSync, writeFileSync, existsSync, renameSync,
    realpathSync
  },
  path,
  // eslint-disable-next-line no-shadow -- Different process
  process,
  spawnSync,
  shell,
  getOpenWithApps,
  getAppIcons,
  parcelWatcher,
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
 * Setup file system watcher for a directory.
 * Now uses parcel watcher exclusively.
 *
 * @param {string} dirPath
 * @returns {void}
 */
function setupFileWatcher (dirPath) {
  // Don't recreate watcher during external refresh
  if (isRefreshing) {
    return;
  }

  // Don't watch root directory
  if (dirPath === '/') {
    return;
  }

  // Don't recreate watcher if already watching this path
  if (activeWatchers.has(dirPath)) {
    return;
  }

  // Use parcel watcher for all cases
  setupNativeWatcher(dirPath);
}

/**
 * Setup a parcel/watcher as fallback.
 *
 * @param {string} dirPath
 * @returns {Promise<void>}
 */
async function setupNativeWatcher (dirPath) {
  /* c8 ignore next 3 - Unreachable: setupFileWatcher filters root first */
  if (dirPath === '/') {
    return;
  }

  // Check if already watching this path
  if (activeWatchers.has(dirPath)) {
    return;
  }

  // Resolve symlinks to get the real path (e.g., /tmp -> /private/tmp on macOS)
  let resolvedDirPath;
  try {
    resolvedDirPath = realpathSync(dirPath);
  /* c8 ignore next 4 - Defensive: hard to mock due to module-level binding */
  // If path doesn't exist or can't be resolved, use original
  } catch {
    resolvedDirPath = dirPath;
  }

  let debounceTimer = /** @type {NodeJS.Timeout | null} */ (null);

  try {
    // Use @parcel/watcher which is more efficient and tracks subdirectories
    const subscription = await parcelWatcher.subscribe(
      resolvedDirPath,
      (err, events) => {
        /* c8 ignore next 6 - Error handler for parcel watcher failures,
           difficult to trigger in integration tests */
        if (err) {
          // eslint-disable-next-line no-console -- Debugging
          console.error('Parcel watcher error:', err);
          return;
        }

        // Filter events to include direct children and first-level
        // subdirectories (depth 0 and depth 1 only)
        const relevantEvents = events.filter((evt) => {
          const relativePath = evt.path.slice(resolvedDirPath.length + 1);
          // Count slashes to determine depth
          const slashCount = (relativePath.match(/\//gv) || []).length;
          // Include depth 0 (direct children) and depth 1
          // (files in direct child folders)
          return slashCount <= 1;
        });

        // Skip if no relevant events
        if (relevantEvents.length === 0) {
          return;
        }

        // Get currently selected item
        // In miller-columns, there can be multiple selected items
        //   (one per column). We want the rightmost (deepest) one
        const allSelected = $$('li.miller-selected a, li.miller-selected span');
        const selectedItem = allSelected.length > 0
          ? allSelected.at(-1)
          : null;
        const selectedPath = selectedItem
          ? /** @type {HTMLElement} */ (selectedItem).dataset.path
          : null;

        // Track which folders have changes (for later refresh when visited)
        let changeInSelectedFolder = false;
        let changeInVisibleArea = false;
        const columnsToRefresh = new Set();

        // Get current base path being viewed
        const currentBasePath = getBasePath();

        // Check each event against the watched folder
        for (const evt of relevantEvents) {
          const eventPath = evt.path;
          const eventDir = path.dirname(eventPath);

          // Ignore macOS Trash events – moving items there shouldn’t refresh
          if (eventDir.includes('/.Trash')) {
            continue;
          }

          // Track this folder as having pending changes
          foldersWithPendingChanges.add(eventDir);

          // Check if change is in the current base path (root being viewed)
          // Normalize paths for comparison (currentBasePath has trailing slash)
          // Also resolve symlinks (macOS /tmp -> /private/tmp)
          const normalizedEventDir = path.normalize(eventDir + '/');
          try {
            const resolvedEventDir = realpathSync(normalizedEventDir);
            const resolvedCurrentBasePath = realpathSync(currentBasePath);
            if (resolvedEventDir === resolvedCurrentBasePath) {
              changeInVisibleArea = true;
              columnsToRefresh.add(currentBasePath);
            }
          } catch {
            // If realpathSync fails (e.g., path doesn't exist), fall back to
            // simple string comparison
            /* c8 ignore start */
            // Defensive: Hard to test scenario where both paths throw but match
            if (normalizedEventDir === currentBasePath) {
              changeInVisibleArea = true;
              columnsToRefresh.add(currentBasePath);
            }
            /* c8 ignore stop */
          }

          // Check if change affects visible columns
          if (selectedPath) {
            const decodedSelectedPath = decodeURIComponent(selectedPath);
            const selectedDir = path.dirname(decodedSelectedPath);

            // Resolve symlinks for path comparison
            let resolvedEventDir = eventDir;
            let resolvedSelectedDir = selectedDir;
            let resolvedDecodedSelectedPath = decodedSelectedPath;
            try {
              resolvedEventDir = realpathSync(eventDir);
              resolvedSelectedDir = realpathSync(selectedDir);
              resolvedDecodedSelectedPath = realpathSync(decodedSelectedPath);
            } catch {
              // If resolution fails, use original paths
            }

            // Case 1: Change in selected folder's children (if folder)
            if (resolvedDecodedSelectedPath === resolvedEventDir) {
              changeInSelectedFolder = true;
              changeInVisibleArea = true;
            }

            // Case 2: Change in selected item's siblings (same parent)
            if (resolvedSelectedDir === resolvedEventDir) {
              changeInVisibleArea = true;
              columnsToRefresh.add(selectedDir);
            }

            // Case 2b: Change in sibling folder (different child, same parent)
            // Check if eventDir's parent matches selectedDir's parent
            const eventDirParent = path.dirname(resolvedEventDir);
            const selectedDirParent = path.dirname(resolvedSelectedDir);
            if (eventDirParent === selectedDirParent &&
                resolvedEventDir !== resolvedSelectedDir) {
              changeInVisibleArea = true;
              columnsToRefresh.add(eventDir); // Add the sibling folder path
            }

            // Case 3: Change in ancestor columns (visible parent/grandparent)
            // Walk up the selected path to check all visible ancestors
            let ancestorPath = selectedDir;
            while (
              ancestorPath && ancestorPath !== '/' && ancestorPath !== '.'
            ) {
              let resolvedAncestorPath = ancestorPath;
              try {
                resolvedAncestorPath = realpathSync(ancestorPath);
              } catch {
                // Use original if resolution fails
              }

              if (resolvedAncestorPath === resolvedEventDir) {
                changeInVisibleArea = true;
                columnsToRefresh.add(eventDir);
                break;
              }
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

        // Debounce to avoid multiple rapid refreshes
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }

        debounceTimer = setTimeout(() => {
          if (isDeleting || isCreating || isWatcherRefreshing) {
            return;
          }

          // Refresh visible changes
          if (changeInVisibleArea) {
            // Set flag to prevent concurrent refreshes
            setIsWatcherRefreshing(true);

            // If change was in selected folder's children, refresh it
            if (changeInSelectedFolder && selectedPath) {
              const itemElement = $(
                `[data-path="${CSS.escape(selectedPath)}"]`
              );
              if (itemElement) {
                const li = itemElement.closest('li');
                if (li) {
                  jQuery(li).trigger('click');
                }
              }
            }

            // Refresh any ancestor columns that changed
            let refreshHandled = false;

            // Check if any changed paths are the current base path
            // (root directory being viewed)
            const rootChanged = columnsToRefresh.has(currentBasePath);

            if (rootChanged) {
              // Root directory changed - reload entire view
              // Preserve selection if something was selected
              const previouslySelectedPath = selectedPath;
              setTimeout(() => {
                changePath();

                // After refresh, re-select the previously selected item
                if (previouslySelectedPath) {
                  requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                      const escapedPath = CSS.escape(previouslySelectedPath);
                      const reselect = $(`[data-path="${escapedPath}"]`);

                      if (reselect) {
                        const reselectLi = reselect.closest('li');
                        if (reselectLi) {
                          jQuery(reselectLi).trigger('click');
                        }
                      }

                      setIsWatcherRefreshing(false);
                    });
                  });
                /* c8 ignore next 3 -- Difficult to cover? */
                } else {
                  setIsWatcherRefreshing(false);
                }
              }, 150);
              refreshHandled = true;
            }

            /**
             * Clear refresh flag helper.
             * @returns {void}
             */
            const clearRefreshFlag = () => {
              setTimeout(() => {
                setIsWatcherRefreshing(false);
              }, 300);
            };

            for (const columnPath of columnsToRefresh) {
              if (refreshHandled) {
                break;
              }

              // Special case: if the changed path is an ancestor of current
              // path but not directly visible as a folder element, we need to
              // rebuild the leftmost column that shows this path's contents
              // Resolve currentBasePath for comparison with columnPath
              let resolvedCurrentBasePath = currentBasePath;
              try {
                resolvedCurrentBasePath = realpathSync(currentBasePath);
              /* c8 ignore next 3 -- Defensive code */
              } catch {
                // Use original if resolution fails
              }

              if (resolvedCurrentBasePath.startsWith(columnPath + '/') &&
                resolvedCurrentBasePath !== columnPath + '/'
              ) {
                // The changed directory is an ancestor
                // We need to reload the entire view to refresh it
                setTimeout(changePath, 150);
                clearRefreshFlag();
                refreshHandled = true;
                break;
              }

              // Find the folder element that represents this directory
              // We need to find an <a> tag whose data-path equals
              //   this directory
              const allFolders = $$active('a[data-path]');

              for (const folderEl of allFolders) {
                const folderPath = decodeURIComponent(
                  /* c8 ignore next -- TS */
                  /** @type {HTMLElement} */ (folderEl).dataset.path || ''
                );

                // Resolve symlinks for comparison
                let resolvedFolderPath = folderPath;
                try {
                  resolvedFolderPath = realpathSync(folderPath);
                } catch {
                  // Use original if resolution fails
                }

                // If this folder's path matches the changed directory
                if (resolvedFolderPath === columnPath) {
                  const li = folderEl.closest('li');
                  if (li) {
                    // Remember what was selected so we can restore it
                    const previouslySelectedPath = selectedPath;

                    // Save scroll positions of all columns before refresh
                    const scrollPositions = new Map();
                    $$('.miller-column').forEach((col) => {
                      scrollPositions.set(col, {
                        scrollTop: col.scrollTop,
                        scrollLeft: col.scrollLeft
                      });
                    });

                    // Add delay to let filesystem settle before refresh
                    setTimeout(() => {
                      // Re-click this folder to refresh its contents
                      jQuery(li).trigger('click');

                      // Restore scroll positions
                      requestAnimationFrame(() => {
                        scrollPositions.forEach((pos, col) => {
                          col.scrollTop = pos.scrollTop;
                          col.scrollLeft = pos.scrollLeft;
                        });
                      });

                      // After refresh, re-select the previously selected item
                      if (previouslySelectedPath) {
                        requestAnimationFrame(() => {
                          requestAnimationFrame(() => {
                            const escapedPath = CSS.escape(
                              previouslySelectedPath
                            );
                            const reselect = $(
                              `[data-path="${escapedPath}"]`
                            );

                            if (reselect) {
                              const reselectLi = reselect.closest('li');
                              if (reselectLi) {
                                jQuery(reselectLi).trigger('click');

                                // Only scroll if item is out of viewport
                                const rect = reselectLi.getBoundingClientRect();
                                const column = reselectLi.closest(
                                  '.miller-column'
                                );
                                if (column) {
                                  const colRect = column.
                                    getBoundingClientRect();
                                  const isVisible = (
                                    rect.top >= colRect.top &&
                                    rect.bottom <= colRect.bottom &&
                                    rect.left >= colRect.left &&
                                    rect.right <= colRect.right
                                  );

                                  /* c8 ignore next 8 -- Difficult to test:
                                   * Requires folder element refresh (not root)
                                   * with selected item out of viewport */
                                  if (!isVisible) {
                                    reselectLi.scrollIntoView({
                                      block: 'nearest',
                                      inline: 'nearest'
                                    });
                                  }
                                }
                              }
                            }

                            clearRefreshFlag();
                          });
                        });
                      /* c8 ignore next 4 -- Difficult to test:
                       * Requires folder element refresh without selection */
                      } else {
                        clearRefreshFlag();
                      }
                    }, 150); // Delay for filesystem to settle
                    refreshHandled = true;
                    break;
                  }
                }
              }
            }

            // If no columns were refreshed, clear the flag
            /* c8 ignore start - This case is currently unreachable
             * because all code paths that set changeInVisibleArea=true
             * also set either changeInSelectedFolder=true or add entries
             * to columnsToRefresh, which would set refreshHandled=true.
             * This is defensive code in case the logic changes. */
            if (!refreshHandled) {
              setIsWatcherRefreshing(false);
            }
            /* c8 ignore stop */
          }
        }, 500); // Debounce delay - wait for filesystem operations to settle
      }
    );

    // Store the subscription in the map
    activeWatchers.set(dirPath, subscription);

  // Note: The parcelWatcher.subscribe error catch block
  // is difficult to cover in automated tests because:
  // 1. setupNativeWatcher is called during initial page load via changePath()
  // 2. The activeWatchers Map caches watched paths, preventing repeated
  //    subscribe calls on navigation
  // 3. Mocking parcelWatcher.subscribe before page load would break all
  //    watcher functionality, making it difficult to verify the specific
  //    error path
  // 4. The async nature of watcher setup (not awaited) makes timing
  //    unreliable
  // This error handling would require manual/integration testing or
  // modification of the source code to expose setupNativeWatcher for
  // direct unit testing.
  /* c8 ignore next 4 -- Debugging -- Difficult to cover */
  } catch (err) {
    // eslint-disable-next-line no-console -- Debugging
    console.warn('Could not set up parcel watcher:', err);
  }
}

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

// Map of directory paths to their watcher subscriptions
// eslint-disable-next-line jsdoc/reject-any-type -- Watcher type
/** @type {Map<string, any>} */
const activeWatchers = new Map();
/** @type {Set<string>} */
const foldersWithPendingChanges = new Set();

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
    // Prevent double-creation if already in progress
    if (isCreating) {
      return;
    }

    // Set flag to prevent watcher from interfering
    setIsCreating(true);

    // Find an available "untitled folder" name
    const baseName = 'untitled folder';
    let newFolderName = baseName;
    let counter = 2;

    while (existsSync(path.join(folderPath, newFolderName))) {
      newFolderName = baseName + counter;
      counter++;
    }

    const newFolderPath = path.join(folderPath, newFolderName);

    try {
      // Don't close the watcher - just let it detect the change
      // The isCreating flag will prevent it from refreshing the view

      // Create the directory
      mkdirSync(newFolderPath);

      // Add to undo stack
      pushUndo({
        type: 'create',
        path: newFolderPath,
        wasDirectory: true
      });

      // Refresh the view to show the new folder
      // Watcher setup will be skipped due to isCreating flag
      changePath();

      // Wait for the view to refresh, then find and start renaming
      // Use setTimeout instead of nested requestAnimationFrame to avoid freeze
      setTimeout(() => {
        // The data-path attribute uses encodeURIComponent for the folder name
        // Remove trailing slash from folderPath to avoid double slashes
        const normalizedFolderPath = folderPath.replace(/\/+$/v, '');
        const encodedPath = normalizedFolderPath + '/' +
          encodeURIComponent(newFolderName);
        const newFolderElement = $(
          `[data-path="${CSS.escape(encodedPath)}"]`
        );
        if (newFolderElement) {
          startRename(newFolderElement, () => {
            // Clear flag after rename completes
            setIsCreating(false);

            const currentDir = getBasePath();
            if (currentDir !== '/') {
              setupNativeWatcher(currentDir);
            }
          });

          // Scroll the folder into view after a delay to avoid freeze
          setTimeout(() => {
            const inputElement = newFolderElement.querySelector('input');
            if (inputElement) {
              inputElement.scrollIntoView({
                behavior: 'instant',
                block: 'center'
              });

              // Focus immediately after instant scroll
              inputElement.focus();
              inputElement.select();
            }
          }, 100);
        /* c8 ignore next 5 -- Defensive */
        } else {
          // eslint-disable-next-line no-console -- Debugging
          console.warn('Could not find new folder element');
          setIsCreating(false);
        }
      }, 150);
    } catch (err) {
      setIsCreating(false);
      // eslint-disable-next-line no-alert -- User feedback
      alert('Failed to create folder: ' + (/** @type {Error} */ (err)).message);
    }
  };

  /**
   * @param {HTMLElement} [textElement]
   * @param {(() => void)} [onComplete] - Callback when rename completes
   */
  const startRename = (textElement, onComplete) => {
    if (!textElement || !textElement.dataset.path) {
      // Call callback even if we exit early
      if (onComplete) {
        onComplete();
      }
      return;
    }

    // Check if already in rename mode (input exists)
    if (textElement.querySelector('input')) {
      // Call callback even if we exit early
      if (onComplete) {
        onComplete();
      }
      return;
    }

    const oldPath = textElement.dataset.path;
    const oldName = textElement.textContent.trim();
    const parentPath = path.dirname(oldPath);

    // Create input element for renaming
    const input = document.createElement('input');
    input.type = 'text';
    input.value = oldName;
    input.style.width = '100%';
    input.style.boxSizing = 'border-box';
    input.style.position = 'relative';
    input.style.zIndex = '9999'; // Above sticky headers
    input.style.padding = '2px 4px';
    input.style.border = '1px solid #ccc';
    input.style.borderRadius = '2px';
    input.style.backgroundColor = 'white';
    input.style.color = 'black';

    // Replace text with input
    const originalContent = textElement.textContent;
    textElement.textContent = '';
    textElement.append(input);

    // Focus and select the text
    input.focus();
    input.select();

    let isFinishing = false;

    const finishRename = () => {
      if (isFinishing) {
        return;
      }
      isFinishing = true;

      const newName = input.value.trim();

      if (newName && newName !== oldName) {
        const newPath = path.join(parentPath, newName);

        try {
          // eslint-disable-next-line no-console -- Debugging
          console.log('Starting rename from', oldName, 'to', newName);
          // Set flag to prevent watcher from interfering during rename
          setIsCreating(true);

          renameSync(decodeURIComponent(oldPath), newPath);

          // Add to undo stack
          pushUndo({
            type: 'rename',
            path: newPath,
            oldPath: decodeURIComponent(oldPath),
            newPath
          });

          // eslint-disable-next-line no-console -- Debugging
          console.log('Rename completed');

          // Clear the flag immediately after rename so watcher
          //   can detect change
          // In three-columns mode, manually trigger parent refresh
          const currentView = getCurrentView();
          // eslint-disable-next-line no-console -- Debugging
          console.log('Current view:', currentView);
          if (currentView === 'three-columns') {
            // Mark parent folder as having pending changes
            foldersWithPendingChanges.add(parentPath);

            // Find and click the parent folder to refresh it
            const parentElements = $$active('a[data-path]');
            let foundParent = false;
            for (const el of parentElements) {
              const elPath = decodeURIComponent(
                /* c8 ignore next -- TS */
                /** @type {HTMLElement} */ (el).dataset.path || ''
              );
              if (elPath === parentPath) {
                foundParent = true;
                const li = el.closest('li');
                if (li) {
                  // Save scroll positions of all columns before refresh
                  /**
                   * @type {Array<{
                   *   index: number,
                   *   path: string,
                   *   scrollTop: number,
                   *   scrollLeft: number
                   * }>}
                   */
                  const scrollPositions = [];
                  $$('.miller-column').forEach((col, index) => {
                    // Get the directory path this column represents
                    // by looking at any item's path and getting its parent dir
                    const anyItem = col.querySelector(
                      'a[data-path], span[data-path]'
                    );
                    let colDirPath = '';
                    if (anyItem) {
                      const itemPath = /** @type {HTMLElement} */ (anyItem).
                        dataset.path;
                      if (itemPath) {
                        // Decode and get parent directory
                        const decoded = decodeURIComponent(itemPath);
                        colDirPath = path.dirname(decoded);
                      }
                    }
                    scrollPositions.push({
                      index,
                      path: colDirPath,
                      scrollTop: col.scrollTop,
                      scrollLeft: col.scrollLeft
                    });
                  });

                  // Trigger refresh
                  jQuery(li).trigger('click');

                  // After refresh, find and select the renamed item
                  setTimeout(() => {
                    const encodedNewPath = parentPath + '/' +
                      encodeURIComponent(newName);
                    const renamedElement = $(
                      `[data-path="${CSS.escape(encodedNewPath)}"]`
                    );
                    if (renamedElement) {
                      const reselectLi = renamedElement.closest('li');
                      if (reselectLi) {
                        jQuery(reselectLi).trigger('click');

                        // Restore scroll after plugin finishes rebuild
                        // Plugin rebuilds columns async after click,
                        // so wait for completion before restoring
                        setTimeout(() => {
                          // Get fresh column references after rebuild
                          const newColumns = $$('.miller-column');

                          // Restore scroll by matching paths, not indices
                          newColumns.forEach((col) => {
                            // Skip collapsed columns
                            if (col.classList.contains('miller-collapse')) {
                              return;
                            }
                            // Get the directory path this column represents
                            const anyItem = col.querySelector(
                              'a[data-path], span[data-path]'
                            );
                            let colDirPath = '';
                            if (anyItem) {
                              const itemPath = /** @type {HTMLElement} */
                                (anyItem).dataset.path;
                              if (itemPath) {
                                const decoded = decodeURIComponent(itemPath);
                                colDirPath = path.dirname(decoded);
                              }
                            }
                            // Find saved scroll for this path
                            const saved = scrollPositions.find(
                              (sp) => sp.path === colDirPath
                            );
                            if (saved && saved.scrollTop > 0) {
                              col.scrollTop = saved.scrollTop;
                              col.scrollLeft = saved.scrollLeft;
                            }
                          });

                          // Don't scroll the renamed item into view - trust
                          // the restored scroll position preserves the user's
                          // intended view

                          // Clear the flag well after watcher debounce
                          setTimeout(() => {
                            setIsCreating(false);
                          }, 600);
                        }, 100);
                      }
                    }

                    if (onComplete) {
                      setTimeout(onComplete, 100);
                    }
                  }, 200);
                  break;
                }
              }
            }

            if (!foundParent) {
              // Clear the flag if parent not found
              setTimeout(() => {
                setIsCreating(false);
              }, 800);
            }
          } else {
            // For icon view, manually refresh
            changePath();

            // Re-select the renamed item after view refresh
            setTimeout(() => {
              const encodedNewPath = parentPath + '/' +
                encodeURIComponent(newName);
              const renamedElement = $(
                `[data-path="${CSS.escape(encodedNewPath)}"]`
              );
              if (renamedElement) {
                // Scroll into view
                requestAnimationFrame(() => {
                  renamedElement.scrollIntoView({
                    block: 'nearest',
                    inline: 'nearest'
                  });
                });
              }

              // Call completion callback after everything is done
              if (onComplete) {
                setTimeout(onComplete, 250);
              } else {
                // If no callback, just clear the flag after a delay
                setTimeout(() => {
                  setIsCreating(false);
                }, 250);
              }
            }, 100);
          }
        } catch (err) {
          // eslint-disable-next-line no-alert -- User feedback
          alert('Failed to rename: ' + (/** @type {Error} */ (err)).message);
          input.remove();
          textElement.textContent = originalContent;

          // Call completion callback on error too
          if (onComplete) {
            onComplete();
          }
        }
      } else {
        // No rename needed, but still need to refresh to ensure proper state
        input.remove();
        textElement.textContent = originalContent;

        // Get the path before refresh
        const itemPath = oldPath;

        // In three-columns mode, let the watcher handle refreshes
        const currentView = getCurrentView();
        if (currentView !== 'three-columns') {
          // For icon view, manually refresh
          changePath();
        }

        // Re-select the item after view refresh
        setTimeout(() => {
          const itemElement = $(
            `[data-path="${CSS.escape(itemPath)}"]`
          );
          if (itemElement) {
            if (currentView === 'three-columns') {
              // Find container element for three-columns
              const container = itemElement.closest('li');
              if (container) {
                // Remove selection from all items
                $$('.miller-selected').
                  forEach((el) => {
                    el.classList.remove('miller-selected');
                  });
                // Select the item
                container.classList.add('miller-selected');

                // Focus the parent ul to enable keyboard navigation
                // without triggering folder navigation
                const parentUl = container.closest('ul');
                if (parentUl) {
                  parentUl.setAttribute('tabindex', '0');
                  parentUl.focus();
                }

                // Scroll into view
                container.scrollIntoView({
                  block: 'nearest',
                  inline: 'nearest'
                });
              }
            } else {
              // For icon-view, just scroll into view
              itemElement.scrollIntoView({
                block: 'nearest',
                inline: 'nearest'
              });
            }
          }

          // Call completion callback after everything is done
          if (onComplete) {
            // Delay clearing the flag to ensure watcher timeout has passed
            setTimeout(onComplete, 250);
          }
        }, currentView === 'three-columns' ? 350 : 100);
      }
    };

    input.addEventListener('blur', finishRename);

    input.addEventListener('keydown', (ev) => {
      // Stop propagation to prevent miller-columns from handling these events
      ev.stopPropagation();

      if (ev.key === 'Enter') {
        ev.preventDefault();
        input.blur();
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        input.remove();
        textElement.textContent = originalContent;

        // Call onComplete to clear isCreating flag
        if (onComplete) {
          onComplete();
        }
      }
    });

    // Also stop propagation for keypress and keyup to prevent interference
    input.addEventListener('keypress', (ev) => {
      ev.stopPropagation();
    });
    input.addEventListener('keyup', (ev) => {
      ev.stopPropagation();
    });
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
    e.preventDefault();
    e.stopPropagation();
    const {path: pth} = /** @type {HTMLElement} */ (e.target).dataset;
    /* c8 ignore next 3 -- TS */
    if (!pth) {
      return;
    }

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
        'Open in Finder'
      ]],
      ['li', {
        class: 'context-menu-item',
        $on: {
          click () {
            customContextMenu.style.display = 'none';

            // Create a temporary new file in the folder
            const folderPath = decodeURIComponent(pth);

            // Find an available "untitled.txt" name
            const baseName = 'untitled';
            const extension = '.txt';
            let tempFileName = baseName + extension;
            let counter = 2;

            while (existsSync(path.join(folderPath, tempFileName))) {
              tempFileName = baseName + counter + extension;
              counter++;
            }

            const tempFilePath = path.join(folderPath, tempFileName);

            try {
              // Create empty file
              writeFileSync(tempFilePath, '');

              // Add to undo stack
              pushUndo({
                type: 'create',
                path: tempFilePath,
                wasDirectory: false
              });

              // Refresh the view to show the new file
              changePath();

              // Wait for the view to refresh, then find the folder and trigger
              //   it to load children
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  // Find the folder element (anchor tag with this path)
                  const folderElement = $$active('a[data-path]').find(
                    /** @type {(el: Element) => boolean} */ (
                      el
                    ) => /** @type {HTMLElement} */ (el).dataset.path === pth
                  );

                  if (folderElement && folderElement.parentElement) {
                    // Trigger the folder to be selected so miller-columns
                    //   builds its children
                    jQuery(folderElement.parentElement).trigger('click');

                    // Now wait for children to be built and find our file
                    const tryFindElement = (attempts = 0) => {
                      /* c8 ignore next 8 -- Guard */
                      if (attempts > 20) {
                        // eslint-disable-next-line no-console -- Debugging
                        console.log(
                          'Could not find newly created file ' +
                          'element after multiple attempts'
                        );
                        return;
                      }

                      requestAnimationFrame(() => {
                        // The data-path attribute uses:
                        //   childDirectory + '/' + encodeURIComponent(title)
                        // where childDirectory is the decoded path, so we
                        //   need to decode pth first
                        const decodedFolderPath = decodeURIComponent(pth);
                        const encodedPath = decodedFolderPath +
                          '/' + encodeURIComponent(tempFileName);

                        // Minimal logging
                        // Check both span and a tags (files are span,
                        //   folders are a)
                        const allElements = [
                          ...$$active('span[data-path]'),
                          ...$$active('a[data-path]')
                        ];

                        // Find by matching the data-path attribute directly
                        const newFileElement = allElements.find(
                          /** @type {(el: Element) => boolean} */ (
                            el
                          ) => /** @type {HTMLElement} */ (
                            el
                          ).dataset.path === encodedPath
                        );

                        if (newFileElement) {
                          startRename(/** @type {HTMLElement} */ (
                            newFileElement
                          ));
                        /* c8 ignore next 5 -- Difficult to test: requires
                            precise timing where DOM updates haven't
                            completed yet */
                        } else {
                          tryFindElement(attempts + 1);
                        }
                      });
                    };
                    tryFindElement();
                  }
                });
              });
            } catch (err) {
              // eslint-disable-next-line no-alert -- User feedback
              alert(
                'Failed to create file: ' + (/** @type {Error} */ (err)).message
              );
            }
          }
        }
      }, [
        'Create text file'
      ]],
      ['li', {
        class: 'context-menu-item',
        $on: {
          click () {
            customContextMenu.style.display = 'none';
            // Find the element with this path
            const targetElement = $(
              `[data-path="${CSS.escape(pth)}"]`
            );
            if (targetElement) {
              startRename(targetElement);
            }
          }
        }
      }, [
        'Rename'
      ]],
      ['li', {
        class: 'context-menu-item',
        $on: {
          click (ev) {
            ev.stopPropagation();
            customContextMenu.style.display = 'none';
            deleteItem(pth);
          }
        }
      }, [
        'Delete'
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
      /* c8 ignore next 4 -- Defensive as context menus should
         be at positive pageX/pageY coordinates */
      if (menuRect.top < 0) {
        customContextMenu.style.top = '10px';
      }
    });

    // Hide the custom context menu when clicking anywhere else
    const hideCustomContextMenu = () => {
      customContextMenu.style.display = 'none';
      document.removeEventListener('click', hideCustomContextMenu);
      document.removeEventListener('contextmenu', hideCustomContextMenu);
    };
    document.addEventListener('click', hideCustomContextMenu, {
      capture: true
    });
    document.addEventListener('contextmenu', hideCustomContextMenu, {
      capture: true
    });
  };

  /**
   * @param {Event} e
   */
  const contextmenu = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const {path: pth} = /** @type {HTMLElement} */ (e.target).dataset;
    /* c8 ignore next 3 -- TS */
    if (!pth) {
      return;
    }
    /** @type {import('open-with-me').OpenWithApp & {image?: string}} */
    let defaultApp = {name: '', path: '', rank: '', image: ''};
    const appsOrig = await getOpenWithApps(pth);
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
      ]],
      ['li', {
        class: 'context-menu-item',
        $on: {
          click () {
            customContextMenu.style.display = 'none';
            // Find the element with this path
            const targetElement = $(
              `[data-path="${CSS.escape(pth)}"]`
            );
            if (targetElement) {
              startRename(targetElement);
            }
          }
        }
      }, [
        'Rename'
      ]],
      ['li', {
        class: 'context-menu-item',
        $on: {
          click (ev) {
            ev.stopPropagation();
            customContextMenu.style.display = 'none';
            deleteItem(pth);
          }
        }
      }, [
        'Delete'
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
      /* c8 ignore next 4 -- Defensive as context menus should
         be at positive pageX/pageY coordinates */
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
          /* c8 ignore next 3 -- TS */
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

            // Check if submenu actually overflows (is already
            //   visible but cut off)
            const actuallyOverflowsRight = submenuRect.right > viewportWidth;
            const actuallyOverflowsBottom = submenuRect.bottom > viewportHeight;
            const actuallyOverflowsTop = submenuRect.top < 0;

            // Handle horizontal overflow - only reposition submenu,
            //   never main menu
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

            // Handle vertical overflow - only reposition submenu,
            //   never main menu
            /* c8 ignore start - Top overflow unreachable: submenu opens
               downward at top:0 relative to parent, so rect.top < 0 would
               require parent to be above viewport (unhoverable) */
            if (actuallyOverflowsTop) {
              // Submenu is cut off at the top, position it at viewport top
              submenu.style.position = 'fixed';
              submenu.style.top = '10px';
              submenu.style.bottom = 'auto';
              // Preserve horizontal position when switching to fixed
              if (actuallyOverflowsRight && submenu.style.right === '100%') {
                // Submenu is on the left, keep it there with fixed pos
                const parentRect = parentLi.getBoundingClientRect();
                submenu.style.left =
                  (parentRect.left - submenuRect.width) + 'px';
                submenu.style.right = 'auto';
              } else if (actuallyOverflowsRight &&
                         submenu.style.right === '10px') {
                // Submenu is pinned to right edge, keep it there
                submenu.style.left = 'auto';
              } else {
                submenu.style.left = submenuRect.left + 'px';
              }
            } else if (actuallyOverflowsBottom) {
            /* c8 ignore stop */
              const parentRect = parentLi.getBoundingClientRect();
              const wouldFitOnTop = parentRect.top - submenuRect.height >= 0;

              if (wouldFitOnTop) {
                // Align to bottom of parent instead
                submenu.style.top = 'auto';
                submenu.style.bottom = '0';
              } else {
                // Can't fit on top either, pin to bottom edge of viewport
                submenu.style.position = 'fixed';
                submenu.style.top = 'auto';
                submenu.style.bottom = '10px';
                // Preserve horizontal position when switching to fixed
                if (actuallyOverflowsRight && submenu.style.right === '100%') {
                  // Submenu is on the left, keep it there with fixed pos
                  submenu.style.left = (parentRect.left - submenuRect.width) +
                    'px';
                  submenu.style.right = 'auto';
                } else if (actuallyOverflowsRight &&
                           submenu.style.right === '10px') {
                  // Submenu is pinned to right edge, keep it there
                  submenu.style.left = 'auto';
                } else {
                  submenu.style.left = submenuRect.left + 'px';
                }
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
