/* eslint-disable n/no-sync -- Intentional use of sync methods for UI */
import {$, $$, $$active} from '../utils/dom.js';
import {getCurrentView} from '../utils/view.js';
import {pushUndo} from '../history/undoRedo.js';
import {setIsCreating} from '../state/flags.js';
import {foldersWithPendingChanges} from '../fileSystem/watcher.js';

/**
 * Start renaming an item (file or folder).
 *
 * @param {object} deps - Dependencies
 * @param {typeof import('path')} deps.path - Node path module
 * @param {typeof import('jquery')} deps.jQuery - jQuery
 * @param {(oldPath: string, newPath: string) => void} deps.renameSync
 *   fs.renameSync
 * @param {(path: string) => string} deps.decodeURIComponentFn
 *   decodeURIComponent function
 * @param {() => void} deps.changePath - Function to refresh the view
 * @param {HTMLElement} [textElement] - Element to rename
 * @param {(() => void)} [onComplete] - Callback when rename completes
 * @returns {void}
 */
export function startRename (
  {path, jQuery, renameSync, decodeURIComponentFn, changePath},
  textElement,
  onComplete
) {
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

        renameSync(decodeURIComponentFn(oldPath), newPath);

        // Add to undo stack
        pushUndo({
          type: 'rename',
          path: newPath,
          oldPath: decodeURIComponentFn(oldPath),
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
            const elPath = decodeURIComponentFn(
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
                      const decoded = decodeURIComponentFn(itemPath);
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
                              const decoded = decodeURIComponentFn(itemPath);
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
          // For icon/gallery/list view, set the renamed path for reselection
          const encodedNewPath = parentPath + '/' + encodeURIComponent(newName);

          // Set the path to reselect after refresh via global setter
          if (typeof globalThis !== 'undefined' &&
              globalThis.setLastSelectedItemPath) {
            globalThis.setLastSelectedItemPath(encodedNewPath);
          }

          // Manually refresh
          changePath();

          // Clear the isCreating flag quickly so watcher can detect changes
          setTimeout(() => {
            setIsCreating(false);
          }, 100);

          // Call completion callback after flag is cleared
          if (onComplete) {
            setTimeout(onComplete, 200);
          }
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
          `a[data-path="${CSS.escape(itemPath)}"], ` +
          `span[data-path="${CSS.escape(itemPath)}"], ` +
          `p[data-path="${CSS.escape(itemPath)}"]`
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
            // For icon-view and gallery-view, just scroll into view
            itemElement.scrollIntoView({
              block: 'nearest',
              inline: 'nearest'
            });
            itemElement.closest('td').classList.add('selected');
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
      // Remove blur listener to prevent it from firing after we remove input
      input.removeEventListener('blur', finishRename);
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
}
