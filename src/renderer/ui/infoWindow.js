/* eslint-disable n/no-sync -- Needed for performance */

import {filesize} from 'filesize';
import {getFormattedDate} from '../utils/date.js';

// Get Node APIs from the preload script
const {
  fs: {
    lstatSync
  },
  path,
  getFileKind,
  getFileMetadata
} = globalThis.electronAPI;

/**
 * Create and show an info window for a file or folder.
 *
 * @param {object} deps - Dependencies
 * @param {import('jamilih').jml} deps.jml - jamilih jml function
 * @param {string} deps.itemPath - Path to the file or folder
 * @returns {void}
 */
export function showInfoWindow ({jml, itemPath}) {
  const pth = decodeURIComponent(itemPath);
  const baseName = path.basename(pth);
  const lstat = lstatSync(pth);
  const kind = getFileKind(pth);
  const metadata = getFileMetadata(pth);

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
        ['div', [
          'Name and Extension:',
          ['input', {
            value: baseName,
            $on: {
              change () {
                // Todo: Save new `baseName`
              }
            }
          }]
        ]],
        ['div', [
          'Comments:',
          ['br'],
          ['textarea', {
            $on: {
              input () {
                // Todo: Save comment
              }
            }
          }, [
            metadata.ItemFinderComment ?? ''
          ]]
        ]]
        // Todo: Open with: and Change All...
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
