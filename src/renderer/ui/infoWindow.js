/* eslint-disable n/no-sync -- Needed for performance */
/* eslint-disable sonarjs/publicly-writable-directories -- Safe */

import {filesize} from 'filesize';
import {getFormattedDate} from '../utils/date.js';
import {setFinderComment} from '../terminal/terminal.js';

// Get Node APIs from the preload script
const {
  fs: {
    lstatSync,
    readFileSync
  },
  path,
  getFileKind,
  getFileMetadata,
  getOpenWithApps,
  getAppIcons,
  spawnSync
} = globalThis.electronAPI;

/**
 * Create and show an info window for a file or folder.
 *
 * @param {object} deps - Dependencies
 * @param {import('jamilih').jml} deps.jml - jamilih jml function
 * @param {string} deps.itemPath - Path to the file or folder
 * @returns {Promise<void>}
 */
export async function showInfoWindow ({jml, itemPath}) {
  const pth = decodeURIComponent(itemPath);
  const baseName = path.basename(pth);
  const lstat = lstatSync(pth);
  const kind = getFileKind(pth);
  const metadata = getFileMetadata(pth);

  // Get open with apps for files (not folders)
  let defaultApp = null;
  let apps = [];
  if (lstat.isFile()) {
    const appsOrig = await getOpenWithApps(pth);
    const icons = await getAppIcons(appsOrig);

    // Add icons to apps
    const appsWithIcons = appsOrig.map((app, idx) => {
      app.image = icons[idx];
      return app;
    });

    // Find default app and filter
    apps = appsWithIcons.filter((app) => {
      if (app.isSystemDefault) {
        defaultApp = app;
      }
      return !app.isSystemDefault;
    }).toSorted((a, b) => {
      return a.name.localeCompare(b.name);
    });
  }

  // Create a draggable info window
  const infoWindow = jml('div', {
    class: 'info-window'
  }, [
    // Title bar with close button
    ['div', {
      class: 'info-window-header'
    }, [
      ['h3', ['Info']],
      ['button', {
        class: 'info-window-close',
        $on: {
          click () {
            infoWindow.remove();
          }
        }
      }, ['×']]
    ]],
    // Content area (to be populated with metadata)
    ['div', {
      class: 'info-window-content',
      dataset: {
        path: itemPath
      }
    }, [
      ['p', [
        ['table', [
          ['tr', [
            ['td', [
              ['b', [baseName]]
            ]],
            ['td', [
              filesize(lstat.size)
            ]]
          ]],
          ['tr', [
            ['td', [
              'Modified'
            ]],
            ['td', [
              getFormattedDate(lstat.mtimeMs)
            ]]
          ]]
        ]],
        // Todo: Tags textbox
        ['div', [
          'General',
          ['table', [
            ['tr', [
              ['td', [
                'Kind'
              ]],
              ['td', [
                kind
              ]]
            ]],
            ['tr', [
              ['td', [
                'Created'
              ]],
              ['td', [
                getFormattedDate(lstat.birthtimeMs)
              ]]
            ]],
            ['tr', [
              ['td', [
                'Modified'
              ]],
              ['td', [
                getFormattedDate(lstat.mtimeMs)
              ]]
            ]],
            ...(metadata.ItemVersion
              ? [
                ['tr', [
                  ['td', [
                    'Version'
                  ]],
                  ['td', [
                    metadata.ItemVersion
                  ]]
                ]]
              ]
              : []),
            ...(metadata.ItemCopyright
              ? [
                ['tr', [
                  ['td', [
                    'Copyright'
                  ]],
                  ['td', [
                    metadata.ItemCopyright
                  ]]
                ]]
              ]
              : []
            )
          ]]
        ]],
        ['div', [
          'More Info:',
          ['table', [
            metadata.ItemWhereFroms
              ? ['tr', [
                ['td', [
                  'Where from'
                ]],
                ['td', [
                  metadata.ItemWhereFroms
                ]]
              ]]
              : '',
            ['tr', [
              ['td', [
                'Last opened'
              ]],
              ['td', [
                getFormattedDate(metadata.ItemLastUsedDate)
              ]]
            ]]
            // Todo (e.g., PDFs): Version, Pages, Security, Encoding software
          ]]
        ]],
        // ['div', [
        //   'Name and Extension:',
        //   ['input', {
        //     value: baseName,
        //     $on: {
        //       change () {
        //         // Todo: Save new `baseName`
        //       }
        //     }
        //   }]
        // ]],
        ['div', [
          'Comments:',
          ['br'],
          ['textarea', {
            $on: {
              input () {
                setFinderComment(pth, this.value);
              }
            }
          }, [
            metadata.ItemFinderComment ?? ''
          ]]
        ]],
        ...(lstat.isFile() && defaultApp
          ? [
            ['div', [
              'Open with:',
              ['br'],
              ['div', {
                class: 'custom-select-container'
              }, [
                // Selected item display (looks like a select)
                ['div', {
                  class: 'custom-select-trigger',
                  $on: {
                    click (e) {
                      const trigger = e.currentTarget;
                      const dropdown = trigger.nextElementSibling;
                      const isHidden = dropdown.style.display === 'none' ||
                        !dropdown.style.display;

                      if (isHidden) {
                        dropdown.style.display = 'flex';

                        // Store handler reference
                        const closeDropdown = (evt) => {
                          // Don't close if clicking on dropdown or trigger
                          if (dropdown.contains(evt.target) ||
                              trigger.contains(evt.target)) {
                            return;
                          }
                          dropdown.style.display = 'none';
                          document.removeEventListener(
                            'click',
                            closeDropdown,
                            true
                          );
                        };

                        // Store reference on dropdown for item handlers
                        dropdown._closeHandler = closeDropdown;

                        // Attach immediately after this event finishes
                        requestAnimationFrame(() => {
                          document.addEventListener(
                            'click',
                            closeDropdown,
                            true
                          );
                        });
                      } else {
                        dropdown.style.display = 'none';
                      }
                    }
                  }
                }, [
                  ['img', {
                    src: defaultApp.image
                  }],
                  ['span', [defaultApp.name + ' (default)']],
                  ['span', ['▼']]
                ]],
                // Dropdown list (hidden by default)
                ['div', {
                  class: 'app-list'
                }, [
                  ['div', {
                    class: 'app-item default',
                    dataset: {appPath: defaultApp.path}
                  }, [
                    ['img', {
                      src: defaultApp.image
                    }],
                    ['span', [defaultApp.name + ' (default)']]
                  ]],
                  ...apps.map((app) => {
                    return ['div', {
                      class: 'app-item selectable',
                      dataset: {appPath: app.path},
                      $on: {
                        click (e) {
                          const {appPath} = e.currentTarget.dataset;
                          // Set per-file override using xattr
                          const bundleResult = spawnSync(
                            '/usr/libexec/PlistBuddy',
                            [
                              '-c',
                              'Print CFBundleIdentifier',
                              `${appPath}/Contents/Info.plist`
                            ],
                            {encoding: 'utf8'}
                          );

                          if (bundleResult.status === 0 &&
                            bundleResult.stdout) {
                            const bundleId = bundleResult.stdout.trim();

                            const plistXml = String.raw`<?xml version="1.0" ` +
                              String.raw`encoding="UTF-8"?>
  <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
  <plist version="1.0">
  <dict>
  <key>version</key>
  <integer>0</integer>
  <key>bundleidentifier</key>
  <string>${bundleId}</string>
  <key>path</key>
  <string>${appPath}</string>
  </dict>
  </plist>`;

                            const escaped = plistXml.replaceAll(
                              "'",
                              String.raw`'\''`
                            );

                            const binCmd = `printf '%s' '${escaped}' | ` +
                              `plutil -convert binary1 -o /tmp/attr.bin -`;
                            const binResult = spawnSync('sh', ['-c', binCmd]);

                            if (binResult.status === 0) {
                              const hexResult = spawnSync(
                                'xxd',
                                ['-p', '/tmp/attr.bin'],
                                {encoding: 'utf8'}
                              );

                              if (hexResult.status === 0 &&
                                hexResult.stdout) {
                                const hexData = hexResult.stdout.
                                  replaceAll(/\s+/gv, '');

                                spawnSync('xattr', [
                                  '-wx',
                                  'com.apple.LaunchServices.OpenWith',
                                  hexData,
                                  pth
                                ]);
                              }
                            }
                          }

                          // Close the dropdown
                          const dropdown = e.currentTarget.parentElement;
                          dropdown.style.display = 'none';
                          if (dropdown._closeHandler) {
                            document.removeEventListener(
                              'click',
                              dropdown._closeHandler,
                              true
                            );
                          }

                          // Update the trigger to show selected app
                          const trigger = dropdown.previousElementSibling;
                          const triggerImg = trigger.querySelector('img');
                          const triggerSpan = trigger.querySelector('span');
                          const clickedImg = e.currentTarget.
                            querySelector('img');
                          const clickedSpan = e.currentTarget.
                            querySelector('span');

                          if (triggerImg && clickedImg) {
                            triggerImg.src = clickedImg.src;
                          }
                          if (triggerSpan && clickedSpan) {
                            triggerSpan.textContent = clickedSpan.textContent;
                          }
                        }
                      }
                    }, [
                      ['img', {
                        src: app.image
                      }],
                      ['span', [app.name]]
                    ]];
                  })
                ]],
                ['button', {
                  class: 'change-all-button',
                  $on: {
                    click (e) {
                      // Get the currently selected app from the trigger
                      const container = e.currentTarget.parentElement;
                      const trigger = container.querySelector(
                        '.custom-select-trigger'
                      );

                      // Find the selected app from the list
                      let selectedPath = defaultApp.path;
                      let selectedName = defaultApp.name;

                      // Check trigger text to find which app is selected
                      const triggerSpan = trigger?.querySelector('span');
                      if (triggerSpan) {
                        const displayedName = triggerSpan.textContent;
                        const allApps = [defaultApp, ...apps];
                        const selectedApp = allApps.find((app) => {
                          // Match exact name or name with " (default)"
                          return displayedName === app.name ||
                            displayedName === `${app.name} (default)`;
                        });

                        if (selectedApp) {
                          selectedPath = selectedApp.path;
                          selectedName = selectedApp.name;
                        }
                      }

                      if (selectedPath) {
                        // Change default app system-wide
                        const ext = path.extname(pth);
                        if (ext) {
                          const appName = selectedName;

                          // Get bundle ID
                          const bundleResult = spawnSync(
                            '/usr/libexec/PlistBuddy',
                            [
                              '-c',
                              'Print CFBundleIdentifier',
                              `${selectedPath}/Contents/Info.plist`
                            ],
                            {encoding: 'utf8'}
                          );

                          if (bundleResult.status === 0 &&
                            bundleResult.stdout) {
                            const bundleId = bundleResult.stdout.trim();

                            // Get UTI for the file
                            const utiResult = spawnSync(
                              'mdls',
                              ['-name', 'kMDItemContentType', '-raw', pth],
                              {encoding: 'utf8'}
                            );

                            if (utiResult.status === 0 && utiResult.stdout &&
                              utiResult.stdout !== '(null)') {
                              const uti = utiResult.stdout.trim();

                              // Use JXA to call LSSetDefaultHandler
                              const script = `
  ObjC.import('CoreServices');

  var bundleID = '${bundleId}';
  var uti = '${uti}';

  var result = $.LSSetDefaultRoleHandlerForContentType(
    $(uti),
    $.kLSRolesAll,
    $(bundleID)
  );

  result;
                              `.trim();

                              const result = spawnSync(
                                'osascript',
                                ['-l', 'JavaScript', '-e', script],
                                {encoding: 'utf8'}
                              );

                              if (result.status === 0) {
                                // eslint-disable-next-line no-alert -- Feedback
                                alert(
                                  `Default app for ${ext} files ` +
                                  `changed to ${appName}`
                                );
                              } else {
                                // eslint-disable-next-line no-alert -- Error
                                alert(
                                  'Failed to change: ' +
                                  `${result.stderr || 'Unknown error'}`
                                );
                              }
                            } else {
                              // eslint-disable-next-line no-alert -- Error
                              alert('Could not determine file type');
                            }
                          }
                        }
                      }
                    }
                  }
                }, ['Change All...']]
              ]]
            ]]
          ]
          : []),

        // Preview
        ...(lstat.isFile()
          ? [
            ['div', [
              'Preview:',
              ['br'],
              ['div', {
                class: 'info-window-preview'
              }, [
                (() => {
                  // Get UTI/MIME type
                  const utiResult = spawnSync(
                    'mdls',
                    ['-name', 'kMDItemContentType', '-raw', pth],
                    {encoding: 'utf8'}
                  );
                  const uti = utiResult.stdout?.trim() || '';

                  // Image types
                  if ((/image|png|jpeg|gif|svg|webp|bmp|tiff/v).
                    test(uti)) {
                    return ['img', {
                      src: `file://${pth}`
                    }];
                  }

                  // PDF
                  if ((/pdf/v).test(uti)) {
                    return ['embed', {
                      src: `file://${pth}`,
                      type: 'application/pdf'
                    }];
                  }

                  // Text-based files
                  if ((/text|json|xml|javascript|source/v).test(uti) ||
                    (/\.(?:txt|md|js|ts|html|css|json|xml|sh|py|rb)$/iv).
                      test(pth)) {
                    try {
                      const content = readFileSync(pth, 'utf8');
                      const preview = content.length > 5000
                        ? content.slice(0, 5000) + '\n\n[... truncated]'
                        : content;
                      return ['pre', {}, [preview]];
                    } catch {
                      return ['div', ['Cannot preview file']];
                    }
                  }

                  // Default: show file info
                  return ['div', [
                    'Preview not available for this file type',
                    ['br'],
                    ['small', [`Type: ${uti || 'Unknown'}`]]
                  ]];
                })()
              ]]
            ]]
          ]
          : [])

        // Todo: Sharing & Permissions
      ]]
    ]]
  ], document.body);

  // Make the window draggable
  const header = infoWindow.querySelector('.info-window-header');
  let isDragging = false;
  let currentX;
  let currentY;
  let initialX;
  let initialY;

  header.addEventListener('mousedown', (e) => {
    isDragging = true;
    initialX = e.clientX - infoWindow.offsetLeft;
    initialY = e.clientY - infoWindow.offsetTop;
    infoWindow.style.cursor = 'move';
  });

  document.addEventListener('mousemove', (e) => {
    if (isDragging) {
      e.preventDefault();
      currentX = e.clientX - initialX;
      currentY = e.clientY - initialY;
      infoWindow.style.left = currentX + 'px';
      infoWindow.style.top = currentY + 'px';
    }
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
    infoWindow.style.cursor = 'default';
  });

  // Bring window to front when clicked
  infoWindow.addEventListener('mousedown', () => {
    // Find max z-index of all info windows
    const allInfoWindows = document.querySelectorAll('.info-window');
    let maxZ = 10000;
    allInfoWindows.forEach((win) => {
      const z = Number.parseInt(win.style.zIndex || '10000');
      if (z > maxZ) {
        maxZ = z;
      }
    });
    infoWindow.style.zIndex = (maxZ + 1).toString();
  });

  // Offset each new window slightly
  const existingWindows = document.querySelectorAll('.info-window');
  if (existingWindows.length > 1) {
    const offset = (existingWindows.length - 1) * 30;
    infoWindow.style.left = (100 + offset) + 'px';
    infoWindow.style.top = (100 + offset) + 'px';
  }
}
