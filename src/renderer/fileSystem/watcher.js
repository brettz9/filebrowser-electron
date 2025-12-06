/* eslint-disable n/no-sync -- Needed for performance */
import {emit} from '../events/eventBus.js';
import {$, $$, $$active} from '../utils/dom.js';
import {getBasePath} from '../utils/path.js';
import {
  isDeleting,
  isCreating,
  isWatcherRefreshing,
  setIsWatcherRefreshing
} from '../state/flags.js';
import jQuery from 'jquery';

// Get Node APIs from the preload script
const {
  fs: {realpathSync},
  path,
  parcelWatcher
} = globalThis.electronAPI;

// Map of directory paths to their watcher subscriptions
// eslint-disable-next-line jsdoc/reject-any-type -- Watcher type
/** @type {Map<string, any>} */
export const activeWatchers = new Map();
/** @type {Set<string>} */
export const foldersWithPendingChanges = new Set();

/**
 * Setup file system watcher for a directory.
 * Now uses parcel watcher exclusively.
 *
 * @param {string} dirPath
 * @returns {void}
 */
export function setupFileWatcher (dirPath) {
  // Don't recreate watcher during external refresh
  if (isWatcherRefreshing) {
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

  /* c8 ignore next 5 - Defensive: setupFileWatcher already checks,
     but kept for safety if called directly in future */
  // Check if already watching this path
  if (activeWatchers.has(dirPath)) {
    return;
  }

  // Resolve symlinks to get the real path
  // (e.g., /tmp -> /private/tmp on macOS)
  let resolvedDirPath;
  try {
    resolvedDirPath = realpathSync(dirPath);
  /* c8 ignore next 5 - Defensive:
     hard to mock due to module-level binding */
  // If path doesn't exist or can't be resolved, use original
  } catch {
    resolvedDirPath = dirPath;
  }

  let debounceTimer = /** @type {NodeJS.Timeout | null} */ (null);

  try {
    // Use @parcel/watcher which is more efficient
    // and tracks subdirectories
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
        const allSelected = $$(
          'li.miller-selected a, li.miller-selected span'
        );
        const selectedItem = allSelected.length > 0
          ? allSelected.at(-1)
          : null;
        const selectedPath = selectedItem
          ? /** @type {HTMLElement} */ (selectedItem).dataset.path
          : null;

        // Track which folders have changes
        // (for later refresh when visited)
        let changeInSelectedFolder = false;
        let changeInVisibleArea = false;
        const columnsToRefresh = new Set();

        // Get current base path being viewed
        const currentBasePath = getBasePath();

        // Check each event against the watched folder
        for (const evt of relevantEvents) {
          const eventPath = evt.path;
          const eventDir = path.dirname(eventPath);

          // Ignore macOS Trash events
          // – moving items there shouldn't refresh
          if (eventDir.includes('/.Trash')) {
            continue;
          }

          // Track this folder as having pending changes
          foldersWithPendingChanges.add(eventDir);

          // Check if change is in the current base path (root being viewed)
          // Normalize paths for comparison
          // (currentBasePath has trailing slash)
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
            // Defensive: Hard to test scenario
            // where both paths throw but match
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
              resolvedDecodedSelectedPath = realpathSync(
                decodedSelectedPath
              );
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

            // Case 2b: Change in sibling folder
            // (different child, same parent)
            // Check if eventDir's parent matches selectedDir's parent
            const eventDirParent = path.dirname(resolvedEventDir);
            const selectedDirParent = path.dirname(resolvedSelectedDir);
            if (eventDirParent === selectedDirParent &&
                resolvedEventDir !== resolvedSelectedDir) {
              changeInVisibleArea = true;
              columnsToRefresh.add(eventDir); // Add the sibling folder path
            }

            // Case 3: Change in ancestor columns
            // (visible parent/grandparent)
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
                emit('refreshView');

                // After refresh, re-select the previously selected item
                if (previouslySelectedPath) {
                  requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                      const escapedPath = CSS.escape(
                        previouslySelectedPath
                      );
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
                setTimeout(() => emit('refreshView'), 150);
                clearRefreshFlag();
                refreshHandled = true;
                break;
              }

              // Find the folder element that represents this directory
              // We need to find an <a> tag whose data-path equals
              //   this directory
              const allFolders = $$active('a[data-path]');

              /* c8 ignore start -- Folder element refresh: Complex
                 integration requiring precise folder structure and timing.
                 Main folder refresh tested; edge cases difficult to reach. */
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
                                const rect = reselectLi.
                                  getBoundingClientRect();
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
              /* c8 ignore stop */
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
  // 1. setupNativeWatcher is called during initial page load via refreshView
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

