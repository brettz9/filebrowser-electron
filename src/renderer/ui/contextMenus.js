/* eslint-disable n/no-sync -- Intentional use of sync methods for UI */
import {$, $$active} from '../utils/dom.js';
import {pushUndo} from '../history/undoRedo.js';

/**
 * Create and show context menu for folders.
 *
 * @param {object} deps - Dependencies
 * @param {import('jamilih').jml} deps.jml - jamilih jml function
 * @param {typeof import('jquery')} deps.jQuery - jQuery
 * @param {typeof import('path')} deps.path - Node path module
 * @param {object} deps.shell - Electron shell API
 * @param {(path: string) => boolean} deps.existsSync - fs.existsSync
 * @param {(path: string, data: string) => void} deps.writeFileSync
 *   fs.writeFileSync
 * @param {(path: string) => string} deps.decodeURIComponentFn
 *   decodeURIComponent fn
 * @param {(path: string) => string} deps.encodeURIComponentFn
 *   encodeURIComponent fn
 * @param {() => void} deps.changePath - Function to refresh the view
 * @param {(element: HTMLElement,
 *   onComplete?: () => void) => void} deps.startRename - startRename fn
 * @param {(itemPath: string) => void} deps.deleteItem
 *   deleteItem function
 * @param {() => {path: string, isCopy: boolean}|null} deps.getClipboard
 *   getClipboard function
 * @param {(clip: {path: string, isCopy: boolean}) => void} deps.setClipboard
 *   setClipboard function
 * @param {(sourcePath: string, targetDir: string,
 *   isCopy: boolean) => void} deps.copyOrMoveItem - copyOrMoveItem function
 * @param {(info: {
 *   jml: import('jamilih').jml,
 *   itemPath: string
 * }) => void} deps.showInfoWindow - showInfoWindow fn
 * @param {Event} e - Context menu event
 * @returns {void}
 */
export function showFolderContextMenu (
  {
    jml, jQuery, path, shell, existsSync, writeFileSync,
    decodeURIComponentFn, encodeURIComponentFn,
    changePath, startRename, deleteItem,
    getClipboard, setClipboard, copyOrMoveItem, showInfoWindow
  },
  e
) {
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
          setClipboard({path: pth, isCopy: false});
        }
      }
    }, [
      'Cut'
    ]],
    ['li', {
      class: 'context-menu-item',
      $on: {
        click () {
          customContextMenu.style.display = 'none';
          setClipboard({path: pth, isCopy: true});
        }
      }
    }, [
      'Copy'
    ]],
    ...(getClipboard()
      ? [['li', {
        class: 'context-menu-item',
        $on: {
          click () {
            customContextMenu.style.display = 'none';
            const clip = getClipboard();
            if (clip) {
              const targetDir = decodeURIComponentFn(pth);
              copyOrMoveItem(clip.path, targetDir, clip.isCopy);
            }
          }
        }
      }, [
        'Paste'
      ]]]
      : []),
    ['li', {
      class: 'context-menu-item',
      $on: {
        click () {
          customContextMenu.style.display = 'none';

          // Create a temporary new file in the folder
          const folderPath = decodeURIComponentFn(pth);

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
                      const decodedFolderPath = decodeURIComponentFn(pth);
                      const encodedPath = decodedFolderPath +
                        '/' + encodeURIComponentFn(tempFileName);

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
              'Failed to create file: ' +
              (/** @type {Error} */ (err)).message
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
        click () {
          customContextMenu.style.display = 'none';
          showInfoWindow({jml, itemPath: pth});
        }
      }
    }, [
      'Get Info'
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
}

/**
 * Create and show context menu for files.
 *
 * @param {object} deps - Dependencies
 * @param {import('jamilih').jml} deps.jml - jamilih jml function
 * @param {object} deps.shell - Electron shell API
 * @param {(path: string, args: string[]) => void} deps.spawnSync
 *   spawnSync function
 * @param {(path: string) => Promise<unknown[]>} deps.getOpenWithApps
 *   getOpenWithApps fn
 * @param {(apps: unknown[]) => Promise<string[]>} deps.getAppIcons
 *   getAppIcons function
 * @param {(element: HTMLElement,
 *   onComplete?: () => void) => void} deps.startRename - startRename fn
 * @param {(itemPath: string) => void} deps.deleteItem
 *   deleteItem function
 * @param {() => {path: string, isCopy: boolean}|null} deps.getClipboard
 *   getClipboard function
 * @param {(clip: {path: string, isCopy: boolean}) => void} deps.setClipboard
 *   setClipboard function
 * @param {(sourcePath: string, targetDir: string,
 *   isCopy: boolean) => void} deps.copyOrMoveItem - copyOrMoveItem function
 * @param {typeof import('path')} deps.path - Node path module
 * @param {(info: {jml: import('jamilih').jml,
 *   itemPath: string}) => void} deps.showInfoWindow - showInfoWindow fn
 * @param {Event} e - Context menu event
 * @returns {Promise<void>}
 */
export async function showFileContextMenu (
  {
    jml, shell, spawnSync, getOpenWithApps, getAppIcons,
    startRename, deleteItem,
    getClipboard, setClipboard, copyOrMoveItem, path: pathModule,
    showInfoWindow
  },
  e
) {
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
          setClipboard({path: pth, isCopy: false});
        }
      }
    }, [
      'Cut'
    ]],
    ['li', {
      class: 'context-menu-item',
      $on: {
        click () {
          customContextMenu.style.display = 'none';
          setClipboard({path: pth, isCopy: true});
        }
      }
    }, [
      'Copy'
    ]],
    ...(getClipboard()
      ? [['li', {
        class: 'context-menu-item',
        $on: {
          click () {
            customContextMenu.style.display = 'none';
            const clip = getClipboard();
            if (clip) {
              const targetDir = pathModule.dirname(pth);
              copyOrMoveItem(clip.path, targetDir, clip.isCopy);
            }
          }
        }
      }, [
        'Paste'
      ]]]
      : []),
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
        click () {
          customContextMenu.style.display = 'none';
          showInfoWindow({jml, itemPath: pth});
        }
      }
    }, [
      'Get Info'
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
          const actuallyOverflowsBottom = submenuRect.bottom >
            viewportHeight;
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
}
