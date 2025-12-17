/* eslint-disable n/no-sync -- Intentional use of sync methods for UI */
import {$} from '../utils/dom.js';
import {getBasePath} from '../utils/path.js';
import {pushUndo} from '../history/undoRedo.js';
import {isCreating, setIsCreating} from '../state/flags.js';
import {setupFileWatcher} from '../fileSystem/watcher.js';

/**
 * Create a new folder and start renaming it.
 *
 * @param {object} deps - Dependencies
 * @param {typeof import('path')} deps.path - Node path module
 * @param {(path: string) => boolean} deps.existsSync - fs.existsSync
 * @param {(path: string) => void} deps.mkdirSync - fs.mkdirSync
 * @param {(path: string) => string} deps.encodeURIComponentFn
 *   encodeURIComponent function
 * @param {() => void} deps.changePath - Function to refresh the view
 * @param {(deps: object, element: HTMLElement,
 *   onComplete?: () => void) => void} deps.startRename - startRename fn
 * @param {string} folderPath - Path where new folder should be created
 * @returns {void}
 */
export function createNewFolder (
  {path, existsSync, mkdirSync, encodeURIComponentFn, changePath, startRename},
  folderPath
) {
  // Prevent double-creation if already in progress
  /* c8 ignore next 3 -- Guard */
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

    // Wait for the view to refresh AND for any watcher activity to settle
    // before trying to add the rename input
    setTimeout(() => {
      // The data-path attribute uses encodeURIComponent for the folder name
      // Remove trailing slash from folderPath to avoid double slashes
      const normalizedFolderPath = folderPath.replace(/\/+$/v, '');
      const encodedPath = normalizedFolderPath + '/' +
        encodeURIComponentFn(newFolderName);
      // Find the text element (p, span, or a) specifically, not img elements
      // Need to search within the active view container, not globally,
      // since elements with the same path may exist in hidden views

      // Try finding in list view first (most specific)
      const listTable = $('.list-view-table');
      let newFolderElement = null;

      if (listTable && listTable.offsetWidth > 0) {
        // In list view - search within the table
        const row = listTable.querySelector(
          `tr[data-path="${CSS.escape(encodedPath)}"]`
        );
        if (row) {
          newFolderElement = row.querySelector(
            '.list-view-name a, .list-view-name span'
          );
        }
      }

      // If not found, try icon view
      if (!newFolderElement) {
        const iconTable = $('.icon-view-table');
        if (iconTable && iconTable.offsetWidth > 0) {
          newFolderElement = iconTable.querySelector(
            `p[data-path="${CSS.escape(encodedPath)}"], ` +
            `span[data-path="${CSS.escape(encodedPath)}"], ` +
            `a[data-path="${CSS.escape(encodedPath)}"]`
          );
        }
      }

      // If still not found, try Miller columns
      if (!newFolderElement) {
        const millerColumns = $('.miller-columns');
        if (millerColumns && millerColumns.offsetWidth > 0) {
          newFolderElement = millerColumns.querySelector(
            `span[data-path="${CSS.escape(encodedPath)}"], ` +
            `a[data-path="${CSS.escape(encodedPath)}"]`
          );
        }
      }

      // Legacy fallback - remove the row-based search since
      //   it's now handled above
      if (!newFolderElement) {
        const row = $(`tr[data-path="${CSS.escape(encodedPath)}"]`);
        if (row) {
          newFolderElement = row.querySelector(
            '.list-view-name a, .list-view-name span'
          );
        }
      }

      if (newFolderElement) {
        startRename(newFolderElement, () => {
          // Clear flag after rename completes
          setIsCreating(false);

          const currentDir = getBasePath();
          if (currentDir !== '/') {
            setupFileWatcher(currentDir);
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
    }, 300); // Wait 300ms for watcher and DOM to settle
  } catch (err) {
    setIsCreating(false);
    // eslint-disable-next-line no-alert -- User feedback
    alert('Failed to create folder: ' + (/** @type {Error} */ (err)).message);
  }
}
