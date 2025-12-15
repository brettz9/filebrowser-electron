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

    // Wait for the view to refresh, then find and start renaming
    // Use setTimeout instead of nested requestAnimationFrame to avoid freeze
    setTimeout(() => {
      // The data-path attribute uses encodeURIComponent for the folder name
      // Remove trailing slash from folderPath to avoid double slashes
      const normalizedFolderPath = folderPath.replace(/\/+$/v, '');
      const encodedPath = normalizedFolderPath + '/' +
        encodeURIComponentFn(newFolderName);
      // Find the text element (p, span, or a) specifically, not img elements
      const newFolderElement = $(
        `p[data-path="${CSS.escape(encodedPath)}"], ` +
        `span[data-path="${CSS.escape(encodedPath)}"], ` +
        `a[data-path="${CSS.escape(encodedPath)}"]`
      );
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
    }, 150);
  } catch (err) {
    setIsCreating(false);
    // eslint-disable-next-line no-alert -- User feedback
    alert('Failed to create folder: ' + (/** @type {Error} */ (err)).message);
  }
}
