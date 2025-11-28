/* eslint-disable n/no-sync,
  promise/prefer-await-to-then,
  promise/catch-or-return -- Needed for performance */
/* eslint-disable sonarjs/no-os-command-from-path -- Needed */
'use strict';

const {
  mkdirSync, readdirSync, writeFileSync, existsSync, renameSync,
  lstatSync, rmSync
} = require('node:fs');
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
const chokidar = require('chokidar');

const getIconDataURLForFile =
  require('./src/renderer/utils/getIconDataURLForFile.cjs');

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
 * Setup file system watcher for a directory.
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
  if (currentWatcher && currentWatchedPath === dirPath) {
    return;
  }

  // Close existing watcher
  if (currentWatcher) {
    currentWatcher.close();
    currentWatcher = null;
    currentWatchedPath = null;
  }

  // Clear any pending timeout
  if (watcherTimeout) {
    clearTimeout(watcherTimeout);
    watcherTimeout = null;
  }

  currentWatchedPath = dirPath;

  try {
    currentWatcher = chokidar.watch(dirPath, {
      persistent: false,
      ignoreInitial: true,
      depth: 1, // Watch direct children and one level deep
      ignored: [
        '**/.DS_Store',
        '**/Thumbs.db',
        '**/.git',
        '**/node_modules'
      ]
    });

    const handleChange = (/** @type {string} */ eventPath) => {
      // eslint-disable-next-line no-console -- Debugging
      console.log('File change detected:', eventPath);

      // Debounce multiple rapid changes
      if (watcherTimeout) {
        clearTimeout(watcherTimeout);
      }

      watcherTimeout = setTimeout(() => {
        // eslint-disable-next-line no-console -- Debugging
        console.log('Watcher timeout fired. isDeleting:', isDeleting,
          'isCreating:', isCreating);

        // Only refresh if not currently deleting or creating
        if (!isDeleting && !isCreating) {
          const currentBasePath = getBasePath();

          // eslint-disable-next-line no-console -- Debugging
          console.log('Comparing paths - current:', currentBasePath,
            'watched:', currentWatchedPath);

          // Normalize paths by removing trailing slashes for comparison
          const normalizedCurrent = currentBasePath.replace(/\/+$/v, '');
          const normalizedWatched =
            currentWatchedPath?.replace(/\/+$/v, '') ?? '';

          // Refresh if we're viewing the watched directory or any of its
          // children (in case a parent folder was deleted)
          if (normalizedCurrent === normalizedWatched ||
              normalizedCurrent.startsWith(normalizedWatched + '/')) {
            // eslint-disable-next-line no-console -- Debugging
            console.log('Refreshing view for:', currentBasePath);

            // If we're in a subdirectory of the watched path, navigate back
            // to the watched directory
            if (normalizedCurrent.startsWith(normalizedWatched + '/')) {
              // Save the folder we were viewing so we can select it after
              // navigating back
              const childFolderName = normalizedCurrent.slice(
                normalizedWatched.length + 1
              ).split('/')[0];
              const childFolderPath = normalizedWatched + '/' +
                childFolderName;

              // Navigate back to the parent directory
              location.hash = '#path=' + encodeURIComponent(
                currentWatchedPath ?? normalizedWatched
              );

              // After navigation, select and expand the folder we were in
              setTimeout(() => {
                const folderElement = $(
                  `[data-path="${CSS.escape(childFolderPath)}"]`
                );
                if (folderElement) {
                  const li = folderElement.closest('li');
                  if (li) {
                    // Remove selection from all items
                    $$('.miller-selected').
                      forEach((el) => {
                        el.classList.remove('miller-selected');
                      });
                    // Select the folder
                    li.classList.add('miller-selected');

                    // Trigger it to load children
                    jQuery(li).trigger('click');

                    // Focus for keyboard navigation
                    const parentUl = li.closest('ul');
                    if (parentUl) {
                      parentUl.setAttribute('tabindex', '0');
                      parentUl.focus();
                    }
                  }
                }
              }, 100);

              // Don't continue with refresh here - hashchange event will
              // trigger changePath()
              return;
            }

            // Save the currently selected item before refresh
            const selectedItem = $('li.miller-selected a');
            const selectedPath = selectedItem
              ? /** @type {HTMLElement} */ (selectedItem).dataset.path
              : null;

            // Set flag to prevent watcher recreation
            isRefreshing = true;

            // Refresh the view
            changePath();

            // Clear flag after refresh
            isRefreshing = false;

            // Restore selection after refresh
            if (selectedPath) {
              setTimeout(() => {
                const itemElement = $(
                  `[data-path="${CSS.escape(selectedPath)}"]`
                );
                if (itemElement) {
                  const li = itemElement.closest('li');
                  if (li) {
                    // Remove selection from all items
                    $$('.miller-selected').
                      forEach((el) => {
                        el.classList.remove('miller-selected');
                      });
                    // Select the item
                    li.classList.add('miller-selected');

                    // If this is a folder (has an <a> tag), trigger it to
                    // reload its children
                    const anchor = li.querySelector('a');
                    if (anchor) {
                      // Trigger miller-columns to reload children
                      jQuery(li).trigger('click');
                    }

                    // Focus the parent ul to enable keyboard navigation
                    const parentUl = li.closest('ul');
                    if (parentUl) {
                      parentUl.setAttribute('tabindex', '0');
                      parentUl.focus();
                    }
                  }
                }
              }, 100);
            }
          } else {
            // eslint-disable-next-line no-console -- Debugging
            console.log('Not refreshing - path mismatch');
          }
        } else {
          // eslint-disable-next-line no-console -- Debugging
          console.log('Skipping refresh due to isDeleting or isCreating');
        }
      }, 300);
    };

    currentWatcher.
      on('add', (filePath) => {
        // eslint-disable-next-line no-console -- Debugging
        console.log('add event:', filePath);
        handleChange(filePath);
      }).
      on('unlink', (filePath) => {
        // eslint-disable-next-line no-console -- Debugging
        console.log('unlink event:', filePath);
        handleChange(filePath);
      }).
      on('addDir', (dir) => {
        // eslint-disable-next-line no-console -- Debugging
        console.log('addDir event:', dir);
        handleChange(dir);
      }).
      on('unlinkDir', (dir) => {
        // eslint-disable-next-line no-console -- Debugging
        console.log('unlinkDir event:', dir);
        handleChange(dir);
      }).
      on('ready', () => {
        // eslint-disable-next-line no-console -- Debugging
        console.log('Watcher ready');
      }).
      on('error', (/** @type {unknown} */ error) => {
        // eslint-disable-next-line no-console -- Debugging
        console.error('Watcher error:', error);
      });
  } catch (err) {
    // eslint-disable-next-line no-console -- Debugging
    console.warn('Could not watch directory:', dirPath, err);
  }
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

  // Setup watcher for the current directory being viewed
  // (not basePath which could be / in list view)
  setupFileWatcher(currentBasePath);
}

/**
 * @typedef {[isDir: boolean, childDir: string, title: string]} Result
 */

/** @type {JQuery} */
let $columns;
let isDeleting = false;
let isCreating = false;
let isRefreshing = false;
// eslint-disable-next-line jsdoc/imports-as-dependencies -- Bug
/** @type {import('chokidar').FSWatcher|null} */
let currentWatcher = null;
/** @type {NodeJS.Timeout|null} */
let watcherTimeout = null;
/** @type {string|null} */
let currentWatchedPath = null;

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
   * @param {string} itemPath
   */
  const deleteItem = (itemPath) => {
    // Prevent multiple simultaneous deletions
    if (isDeleting) {
      return;
    }

    isDeleting = true;

    const decodedPath = decodeURIComponent(itemPath);
    const itemName = path.basename(decodedPath);

    // eslint-disable-next-line no-alert -- User confirmation
    const confirmed = confirm(`Are you sure you want to delete "${itemName}"?`);

    if (!confirmed) {
      isDeleting = false;
      return;
    }

    try {
      // rmSync with recursive and force options to handle both files
      //   and directories
      rmSync(decodedPath, {recursive: true, force: true});

      // Refresh the view to reflect deletion
      changePath();

      // Reset flag after a delay to allow view to update
      setTimeout(() => {
        isDeleting = false;
      }, 100);
    } catch (err) {
      // eslint-disable-next-line no-alert -- User feedback
      alert('Failed to delete: ' + (/** @type {Error} */ (err)).message);
      isDeleting = false;
    }
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
    isCreating = true;

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
      // Create the directory
      mkdirSync(newFolderPath);

      // Refresh the view to show the new folder
      changePath();

      // Wait for the view to refresh, then find and start renaming
      //   the new folder
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // The data-path attribute uses encodeURIComponent for the folder name
          const encodedPath = folderPath + '/' +
            encodeURIComponent(newFolderName);
          const newFolderElement = $(
            `[data-path="${CSS.escape(encodedPath)}"]`
          );
          if (newFolderElement) {
            startRename(newFolderElement, () => {
              // Clear flag after rename completes
              isCreating = false;
            });
          } else {
            // eslint-disable-next-line no-console -- Debugging
            console.warn('Could not find new folder element');
            isCreating = false;
          }
        });
      });
    } catch (err) {
      isCreating = false;
      // eslint-disable-next-line no-alert -- User feedback
      alert('Failed to create folder: ' + (/** @type {Error} */ (err)).message);
    }
  };

  /**
   * @param {HTMLElement} textElement
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

    // Replace text with input
    const originalContent = textElement.textContent;
    textElement.textContent = '';
    textElement.append(input);
    input.focus();
    input.select();

    // Scroll the input into view
    requestAnimationFrame(() => {
      textElement.scrollIntoView({
        block: 'nearest',
        inline: 'nearest'
      });
    });

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
          // Set flag to prevent watcher from interfering during rename
          isCreating = true;

          renameSync(decodeURIComponent(oldPath), newPath);
          // Refresh the view - this will rebuild the DOM with new names
          changePath();

          // Re-select the renamed item after view refresh
          setTimeout(() => {
            const encodedNewPath = parentPath + '/' +
              encodeURIComponent(newName);
            // eslint-disable-next-line no-console -- Debugging
            console.log(
              'Looking for renamed element with path:', encodedNewPath
            );
            const renamedElement = $(
              `[data-path="${CSS.escape(encodedNewPath)}"]`
            );
            // eslint-disable-next-line no-console -- Debugging
            console.log('Found renamed element:', renamedElement);
            if (renamedElement) {
              const li = renamedElement.closest('li');
              if (li) {
                // Remove selection from all items
                $$('.miller-selected').
                  forEach((el) => {
                    el.classList.remove('miller-selected');
                  });
                // Select the renamed item
                li.classList.add('miller-selected');

                // Focus the parent ul to enable keyboard navigation
                // without triggering folder navigation
                const parentUl = li.closest('ul');
                if (parentUl) {
                  parentUl.setAttribute('tabindex', '0');
                  parentUl.focus();
                }

                // Scroll into view
                li.scrollIntoView({
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
          }, 100);
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

        // Refresh the view to ensure miller-columns state is correct
        changePath();

        // Re-select the item after view refresh
        setTimeout(() => {
          const itemElement = $(
            `[data-path="${CSS.escape(itemPath)}"]`
          );
          // eslint-disable-next-line no-console -- Debugging
          console.log('Looking for item with path:', itemPath);
          // eslint-disable-next-line no-console -- Debugging
          console.log('Found item element:', itemElement);
          if (itemElement) {
            const li = itemElement.closest('li');
            if (li) {
              // Remove selection from all items
              $$('.miller-selected').
                forEach((el) => {
                  el.classList.remove('miller-selected');
                });
              // Select the item
              li.classList.add('miller-selected');

              // Focus the parent ul to enable keyboard navigation
              // without triggering folder navigation
              const parentUl = li.closest('ul');
              if (parentUl) {
                parentUl.setAttribute('tabindex', '0');
                parentUl.focus();
              }

              // Scroll into view
              li.scrollIntoView({
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
        }, 100);
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

  /**
   * @param {Event} e
   */
  const folderContextmenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const {path: pth} = /** @type {HTMLElement} */ (e.target).dataset;
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

              // Refresh the view to show the new file
              changePath();

              // Wait for the view to refresh, then find the folder and trigger
              //   it to load children
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  // Find the folder element (anchor tag with this path)
                  const folderElement = $$('a[data-path]').find(
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

                        if (attempts === 0) {
                          // eslint-disable-next-line no-console -- Debugging
                          console.log('Searching for path:', encodedPath);
                        }
                        // Check both span and a tags (files are span,
                        //   folders are a)
                        const allElements = [
                          ...$$('span[data-path]'),
                          ...$$('a[data-path]')
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
                          // eslint-disable-next-line no-console -- Debugging
                          console.log('Found element on attempt', attempts + 1);
                          startRename(/** @type {HTMLElement} */ (
                            newFileElement
                          ));
                        } else {
                          // Try again
                          tryFindElement(attempts + 1);
                        }
                      });
                    };
                    tryFindElement();
                  } else {
                    // eslint-disable-next-line no-console -- Debugging
                    console.log('Could not find folder element to trigger');
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
            if (actuallyOverflowsTop) {
              // Submenu is cut off at the top, position it at viewport top
              submenu.style.position = 'fixed';
              submenu.style.top = '10px';
              submenu.style.bottom = 'auto';
              submenu.style.left = submenuRect.left + 'px';
            } else if (actuallyOverflowsBottom) {
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
                submenu.style.left = submenuRect.left + 'px';
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
    // eslint-disable-next-line prefer-destructuring -- TS
    const target = /** @type {HTMLElement} */ (e.target);

    // Only show context menu if clicking on the ul.miller-column
    //   itself, not on items
    if (!target.classList.contains('miller-column')) {
      return;
    }

    e.preventDefault();

    // Find which column was clicked and get its path
    const columnElement = target;
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
            customContextMenu.style.display = 'none';
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

  // Ensure the miller-columns container is focusable and
  //   focused for keyboard navigation
  if (view === 'three-columns') {
    requestAnimationFrame(() => {
      const millerColumnsDiv = $('div.miller-columns');
      if (millerColumnsDiv) {
        millerColumnsDiv.setAttribute('tabindex', '0');
        millerColumnsDiv.focus();
      }
    });
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
