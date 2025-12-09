/* eslint-disable n/no-sync -- Needed for performance */

import {filesize} from 'filesize';
import {getFormattedDate} from '../utils/date.js';
import {setFinderComment} from '../terminal/terminal.js';

// Get Node APIs from the preload script
const {
  fs: {
    lstatSync
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
              ['select', {
                $on: {
                  change () {
                    const selectedPath = this.value;
                    if (selectedPath) {
                      // Get bundle identifier from app path
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

                        // Create binary plist with required structure
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
  <string>${selectedPath}</string>
</dict>
</plist>`;

                        // Convert to binary plist, then to hex
                        const escaped = plistXml.replaceAll(
                          "'",
                          String.raw`'\''`
                        );

                        // First convert to binary plist
                        const binCmd = `printf '%s' '${escaped}' | ` +
                          `plutil -convert binary1 -o /tmp/attr.bin -`;
                        const binResult = spawnSync('sh', ['-c', binCmd]);

                        if (binResult.status === 0) {
                          // Then convert binary to hex
                          const hexResult = spawnSync(
                            'xxd',
                            ['-p', '/tmp/attr.bin'],
                            {encoding: 'utf8'}
                          );

                          if (hexResult.status === 0 &&
                            hexResult.stdout) {
                            // Remove newlines from hex output
                            const hexData = hexResult.stdout.
                              replaceAll(/\s+/gv, '');

                            // Set xattr using hex format
                            const xattrResult = spawnSync('xattr', [
                              '-wx',
                              'com.apple.LaunchServices.OpenWith',
                              hexData,
                              pth
                            ]);

                            // Verify it was set
                            const verifyResult = spawnSync(
                              'xattr',
                              ['-l', pth],
                              {encoding: 'utf8'}
                            );

                            /* eslint-disable-next-line no-console -- Debug */
                            console.log('Set OpenWith for:', pth);
                            /* eslint-disable-next-line no-console -- Debug */
                            console.log('Bundle ID:', bundleId);
                            /* eslint-disable-next-line no-console -- Debug */
                            console.log('xattr result:', xattrResult.status);
                            /* eslint-disable-next-line no-console -- Debug */
                            console.log(
                              'Verification:',
                              verifyResult.stdout
                            );
                          }
                        }
                      }
                    }
                  }
                }
              }, [
                ['option', {value: defaultApp.path}, [
                  defaultApp.name + ' (default)'
                ]],
                ...apps.map((app) => {
                  return ['option', {value: app.path}, [app.name]];
                })
              ]],
              ['button', {
                style: {marginLeft: '10px'},
                $on: {
                  click () {
                    const select = this.previousElementSibling;
                    const selectedPath = select.value;
                    if (selectedPath) {
                      // Change default app system-wide
                      const ext = path.extname(pth);
                      if (ext) {
                        const appName = select.options[
                          select.selectedIndex
                        ].text.replace(/ \(default\)$/v, '');

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
          ]
          : [])

        // Todo: Preview
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
