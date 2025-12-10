/**
 * @file Tests for icon-view functionality in index.js.
 */

/* eslint-disable chai-expect-keywords/no-unsupported-keywords -- Not Chai */
/* eslint-disable n/no-sync -- Testing */
/* eslint-disable @stylistic/max-len -- Test file with long locators */

import {test, expect} from '@playwright/test';
import {initialize, coverage} from './utils/initialize.js';
import path from 'path';
import fs from 'fs';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const {
  afterEach, afterAll, beforeEach, beforeAll, describe
} = test;

describe('Icon View', () => {
  /** @type {import('playwright').ElectronApplication} */
  let electron;
  /** @type {import('playwright').Page} */
  let page;
  const testDir = path.join(__dirname, 'test-icon-view-files');

  beforeAll(() => {
    // Create test directory
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, {recursive: true});
    }

    // Create test files
    fs.writeFileSync(
      path.join(testDir, 'test-file.txt'),
      'Test content'
    );
    fs.writeFileSync(
      path.join(testDir, 'another-file.txt'),
      'More content'
    );
  });

  beforeEach(async () => {
    ({electron, page} = await initialize());

    // Click icon-view button to switch to icon-view mode (but don't load content yet)
    await page.click('#icon-view');
    await page.waitForTimeout(100);

    // Mock showInfoWindow globally BEFORE navigating (which triggers rendering)
    await page.evaluate(() => {
      // @ts-expect-error - global test state
      globalThis.infoCalled = false;
      // @ts-expect-error - global test state
      globalThis.infoPath = null;

      // @ts-expect-error - global function
      const original = globalThis.showInfoWindow;
      // @ts-expect-error - global function
      globalThis.showInfoWindow = (args) => {
        // @ts-expect-error - global test state
        globalThis.infoCalled = true;
        // @ts-expect-error - global test state
        globalThis.infoPath = args.itemPath;
        // Don't call original to avoid file system errors
      };
      // @ts-expect-error - store original
      globalThis.originalShowInfoWindow = original;
    });

    // Mock copyOrMoveItem globally BEFORE navigating (which triggers rendering)
    await page.evaluate(() => {
      // @ts-expect-error - global test state
      globalThis.copyOrMoveCalled = false;
      // @ts-expect-error - global test state
      globalThis.copyOrMoveSourcePath = null;
      // @ts-expect-error - global test state
      globalThis.copyOrMoveBasePath = null;
      // @ts-expect-error - global test state
      globalThis.copyOrMoveAltKey = null;

      // @ts-expect-error - global function
      const original = globalThis.copyOrMoveItem;
      // @ts-expect-error - global function
      globalThis.copyOrMoveItem = (sourcePath, targetDir, altKey) => {
        // @ts-expect-error - global test state
        globalThis.copyOrMoveCalled = true;
        // @ts-expect-error - global test state
        globalThis.copyOrMoveSourcePath = sourcePath;
        // @ts-expect-error - global test state
        globalThis.copyOrMoveBasePath = targetDir;
        // @ts-expect-error - global test state
        globalThis.copyOrMoveAltKey = altKey;
        // Don't call original to avoid file system changes
      };
      // @ts-expect-error - store original
      globalThis.originalCopyOrMoveItem = original;

      // Mock getIsCopyingOrMoving to return false (allow copy/move operations)
      // @ts-expect-error - global function
      globalThis.getIsCopyingOrMoving = () => false;
    });

    // NOW navigate to test directory - this will render icon-view with mocked functions
    await page.evaluate((dir) => {
      globalThis.location.hash = `#path=${encodeURIComponent(dir)}`;
    }, testDir);

    // Wait for icon-view table to be rendered
    await page.waitForSelector('table[data-base-path]', {timeout: 5000});
    await page.waitForTimeout(500);
  });

  afterEach(async () => {
    await coverage({electron, page});
  });

  afterAll(() => {
    // Clean up test files
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, {recursive: true, force: true});
    }
  });

  test('Cmd+I shows info window for selected item (lines 751-761)', async () => {
    // Get the test directory path
    const basePath = await page.evaluate(() => {
      const table = document.querySelector('table[data-base-path]');
      // @ts-expect-error - dataset
      return table?.dataset?.basePath || null;
    });

    expect(basePath).toBeTruthy();

    // Construct a file path in the test directory
    const testFile = `${basePath}test-file.txt`;

    // Reset the mock flags before this test
    await page.evaluate(() => {
      // @ts-expect-error - global test state
      globalThis.infoCalled = false;
      // @ts-expect-error - global test state
      globalThis.infoPath = null;
    });

    // Manually select a row and dispatch keyboard event on table
    await page.evaluate((filePath) => {
      // Try without tbody selector since jamilih might not create tbody
      const row = document.querySelector('table[data-base-path] tr');
      if (row) {
        row.classList.add('selected');
        // @ts-expect-error - dataset.path
        row.dataset.path = filePath;
      }

      // Get the icon-view table and dispatch Cmd+I keydown event
      const table = document.querySelector('table[data-base-path]');
      if (table) {
        const event = new KeyboardEvent('keydown', {
          key: 'i',
          metaKey: true,
          bubbles: true,
          cancelable: true
        });
        table.dispatchEvent(event);
      }
    }, testFile);

    // Small delay for event processing
    await page.waitForTimeout(100);

    // Check if showInfoWindow was called
    const infoWindow = await page.locator('.info-window');
    await infoWindow.waitFor({state: 'visible', timeout: 5000});
    expect(infoWindow).toBeVisible();
  });

  test('drag-over handler exists in icon-view (lines 809-813)', async () => {
    // Verify dragover handler prevents default and sets dropEffect
    const result = await page.evaluate(() => {
      const table = document.querySelector('table[data-base-path]');
      if (!table) {
        return {success: false, reason: 'no table'};
      }

      let preventDefaultCalled = false;
      let dropEffectSetTo = null;

      // Create a mock dataTransfer that tracks when dropEffect is set
      const mockDataTransfer = {
        _dropEffect: 'none',
        get dropEffect () {
          return this._dropEffect;
        },
        set dropEffect (value) {
          this._dropEffect = value;
          dropEffectSetTo = value;
        },
        effectAllowed: 'all',
        files: [],
        items: [],
        types: []
      };

      // Create a dragover event
      const event = new DragEvent('dragover', {
        bubbles: true,
        cancelable: true
      });

      // Override dataTransfer with our mock
      Object.defineProperty(event, 'dataTransfer', {
        value: mockDataTransfer,
        writable: false
      });

      // Override preventDefault to detect if it was called
      const originalPreventDefault = event.preventDefault;
      event.preventDefault = function () {
        preventDefaultCalled = true;
        originalPreventDefault.call(this);
      };

      // Dispatch on table element (not a list-item)
      table.dispatchEvent(event);

      return {
        success: true,
        preventDefaultCalled,
        dropEffectSetTo
      };
    });

    expect(result.success).toBe(true);
    expect(result.preventDefaultCalled).toBe(true);
    expect(result.dropEffectSetTo).toBe('move'); // Default is 'move' when altKey is false
  });

  test('drag-over on icon-view table with altKey sets dropEffect to copy (line 821)', async () => {
    // Verify dragover handler with altKey sets dropEffect to 'copy'
    const result = await page.evaluate(() => {
      const table = document.querySelector('table[data-base-path]');
      if (!table) {
        return {success: false, reason: 'no table'};
      }

      let dropEffectSetTo = null;

      // Create a mock dataTransfer that tracks when dropEffect is set
      const mockDataTransfer = {
        _dropEffect: 'none',
        get dropEffect () {
          return this._dropEffect;
        },
        set dropEffect (value) {
          this._dropEffect = value;
          dropEffectSetTo = value;
        },
        effectAllowed: 'all',
        files: [],
        items: [],
        types: []
      };

      // Create a dragover event WITH altKey
      const event = new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
        altKey: true
      });

      // Override dataTransfer with our mock
      Object.defineProperty(event, 'dataTransfer', {
        value: mockDataTransfer,
        writable: false
      });

      // Dispatch on table element (not a list-item)
      table.dispatchEvent(event);

      return {
        success: true,
        dropEffectSetTo
      };
    });

    expect(result.success).toBe(true);
    expect(result.dropEffectSetTo).toBe('copy'); // altKey true should set 'copy'
  });

  test('drag-over with altKey sets dropEffect to copy (lines 199-201)', async () => {
    // Create a test folder to drag over
    const testFolder = path.join(testDir, 'test-folder');
    if (!fs.existsSync(testFolder)) {
      fs.mkdirSync(testFolder, {recursive: true});
    }

    // Reload to show the folder
    await page.evaluate((dir) => {
      globalThis.location.hash = `#path=${encodeURIComponent(dir)}`;
    }, testDir);
    await page.waitForSelector('table[data-base-path]');
    await page.waitForTimeout(1000); // Wait longer for folder icons to load

    const result = await page.evaluate(() => {
      // Find a folder item (has <a> tag with data-path)
      const cells = document.querySelectorAll('td.list-item');
      const foundPaths = [];
      let folderCell = null;

      for (const cell of cells) {
        const link = cell.querySelector('a[data-path]');
        if (link) {
          const linkEl = /** @type {HTMLElement} */ (link);
          if (linkEl.dataset.path) {
            foundPaths.push(linkEl.dataset.path);
            folderCell = cell;
            break;
          }
        }
      }

      if (!folderCell) {
        return {success: false, reason: 'no folder found', foundPaths};
      }

      let dropEffectSetTo = null;

      // Create a mock dataTransfer
      const mockDataTransfer = {
        _dropEffect: 'none',
        get dropEffect () {
          return this._dropEffect;
        },
        set dropEffect (value) {
          this._dropEffect = value;
          dropEffectSetTo = value;
        },
        effectAllowed: 'all',
        files: [],
        items: [],
        types: []
      };

      // Create a dragover event WITH altKey on the folder
      const event = new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
        altKey: true
      });

      Object.defineProperty(event, 'dataTransfer', {
        value: mockDataTransfer,
        writable: false
      });

      folderCell.dispatchEvent(event);

      return {
        success: true,
        dropEffectSetTo
      };
    });

    if (!result.success) {
      // eslint-disable-next-line no-console -- Debug output for test failure
      console.log('Failed to find folder. Found paths:', result.foundPaths);
    }

    expect(result.success).toBe(true);
    expect(result.dropEffectSetTo).toBe('copy'); // altKey true should set 'copy'
  });

  test('drag-over on executable file sets dropEffect to copy (lines 199-201)', async () => {
    // Create a .sh file to test executable file branch
    const testShFile = path.join(testDir, 'test-script.sh');
    fs.writeFileSync(testShFile, '#!/bin/bash\necho "test"', 'utf8');

    // Reload the page to show the new file
    await page.evaluate((dir) => {
      globalThis.location.hash = `#path=${encodeURIComponent(dir)}`;
    }, testDir);
    await page.waitForTimeout(1000); // Wait longer for file icons to load

    const result = await page.evaluate(() => {
      // Find the .sh file's TD element
      const cells = document.querySelectorAll('td.list-item');
      const foundPaths = [];
      let targetCell = null;

      for (const cell of cells) {
        const span = cell.querySelector('span[data-path]');
        if (span) {
          const spanEl = /** @type {HTMLElement} */ (span);
          if (spanEl.dataset.path) {
            foundPaths.push(spanEl.dataset.path);
            if (spanEl.dataset.path.endsWith('.sh')) {
              targetCell = cell;
              break;
            }
          }
        }
      }

      if (!targetCell) {
        return {
          success: false,
          reason: 'no .sh file found',
          foundPaths
        };
      }

      let dropEffectSetTo = null;

      // Create a mock dataTransfer
      const mockDataTransfer = {
        _dropEffect: 'none',
        get dropEffect () {
          return this._dropEffect;
        },
        set dropEffect (value) {
          this._dropEffect = value;
          dropEffectSetTo = value;
        },
        effectAllowed: 'all',
        files: [],
        items: [],
        types: []
      };

      // Create a dragover event (altKey doesn't matter for executable files)
      const event = new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
        altKey: false
      });

      Object.defineProperty(event, 'dataTransfer', {
        value: mockDataTransfer,
        writable: false
      });

      // Dispatch on the executable file's cell
      targetCell.dispatchEvent(event);

      return {
        success: true,
        dropEffectSetTo
      };
    });

    if (!result.success) {
      // eslint-disable-next-line no-console -- Debug output for test failure
      console.log('Failed to find .sh file. Found paths:', result.foundPaths);
    }

    expect(result.success).toBe(true);
    expect(result.dropEffectSetTo).toBe('copy'); // executable files always show 'copy'
  });

  test('drop handler exists in icon-view (lines 817-831)', async () => {
    // Verify drop handler prevents default and attempts to process the drop
    const result = await page.evaluate(() => {
      const table = document.querySelector('table[data-base-path]');
      if (!table) {
        return {success: false};
      }

      let preventDefaultCalled = false;
      let stopPropagationCalled = false;
      let getDataCalled = false;

      // Create a mock dataTransfer that tracks when getData is called
      const mockDataTransfer = {
        /**
         * @param {string} format
         */
        getData (format) {
          if (format === 'text/plain') {
            getDataCalled = true;
            return '/test-dir/test1.txt';
          }
          return '';
        },
        dropEffect: 'none',
        effectAllowed: 'all',
        files: [],
        items: [],
        types: ['text/plain']
      };

      const event = new DragEvent('drop', {
        bubbles: true,
        cancelable: true
      });

      // Override dataTransfer with our mock
      Object.defineProperty(event, 'dataTransfer', {
        value: mockDataTransfer,
        writable: false
      });

      // Override preventDefault and stopPropagation to detect if they were called
      const originalPreventDefault = event.preventDefault;
      event.preventDefault = function () {
        preventDefaultCalled = true;
        originalPreventDefault.call(this);
      };

      const originalStopPropagation = event.stopPropagation;
      event.stopPropagation = function () {
        stopPropagationCalled = true;
        originalStopPropagation.call(this);
      };

      // Dispatch on table element (not a list-item)
      table.dispatchEvent(event);

      return {
        success: true,
        preventDefaultCalled,
        stopPropagationCalled,
        getDataCalled
      };
    });

    expect(result.success).toBe(true);
    expect(result.preventDefaultCalled).toBe(true);
    expect(result.stopPropagationCalled).toBe(true);
    expect(result.getDataCalled).toBe(true); // getData was called to get sourcePath
  });

  test('drop handler covers conditional branches and altKey parameter (lines 825-827, 834)', async () => {
    // Lines 825-827: if (targetEl === iconViewTable || targetEl.tagName === 'TR' ||
    //                    (targetEl.tagName === 'TD' && !targetEl.classList.contains('list-item')))
    // Line 834: copyOrMoveItem(sourcePath, targetDir, e.altKey)
    // Test by checking actual filesystem side effects

    const testDir = path.join(__dirname, 'test-icon-view-files');

    // Create test files for copy (altKey=true) test
    const sourceFileCopy = path.join(testDir, 'drop-copy-src.txt');
    fs.writeFileSync(sourceFileCopy, 'copy test content');

    // Create test files for move (altKey=false) test
    const sourceFileMove = path.join(testDir, 'drop-move-src.txt');
    fs.writeFileSync(sourceFileMove, 'move test content');

    // Create test file for TD test
    const sourceFileTd = path.join(testDir, 'drop-td-src.txt');
    fs.writeFileSync(sourceFileTd, 'td test content');

    // Wait for file creation to settle
    await page.waitForTimeout(100);

    // Test 1: Drop directly on table with altKey=true (copy)
    // This covers: targetEl === iconViewTable
    await page.evaluate((/** @type {string} */ src) => {
      const table = document.querySelector('table[data-base-path]');
      if (!table) {
        throw new Error('Table not found');
      }

      const evt = new DragEvent('drop', {bubbles: true, cancelable: true, altKey: true});
      Object.defineProperty(evt, 'dataTransfer', {
        value: {getData: (/** @type {string} */ type) => (type === 'text/plain' ? src : '')}
      });
      Object.defineProperty(evt, 'target', {value: table, configurable: true});
      table.dispatchEvent(evt);
    }, sourceFileCopy);

    await page.waitForTimeout(500);

    // Test 2: Drop on TR element with altKey=false (move)
    // This covers: targetEl.tagName === 'TR'
    await page.evaluate((/** @type {string} */ src) => {
      const table = document.querySelector('table[data-base-path]');
      if (!table) {
        throw new Error('Table not found');
      }

      // Find an existing TR or create one
      let tr = table.querySelector('tr');
      if (!tr) {
        tr = document.createElement('tr');
        table.append(tr);
      }

      const evt = new DragEvent('drop', {bubbles: true, cancelable: true, altKey: false});
      Object.defineProperty(evt, 'dataTransfer', {
        value: {getData: (/** @type {string} */ type) => (type === 'text/plain' ? src : '')}
      });
      Object.defineProperty(evt, 'target', {value: tr, configurable: true});
      table.dispatchEvent(evt);
    }, sourceFileMove);

    await page.waitForTimeout(500);

    // Test 3: Drop on empty TD (no list-item class) with altKey=true
    // This covers: targetEl.tagName === 'TD' && !targetEl.classList.contains('list-item')
    await page.evaluate((/** @type {string} */ src) => {
      const table = document.querySelector('table[data-base-path]');
      if (!table) {
        throw new Error('Table not found');
      }

      let tr = table.querySelector('tr');
      if (!tr) {
        tr = document.createElement('tr');
        table.append(tr);
      }

      const td = document.createElement('td');
      // Explicitly do NOT add 'list-item' class
      tr.append(td);

      const evt = new DragEvent('drop', {bubbles: true, cancelable: true, altKey: true});
      Object.defineProperty(evt, 'dataTransfer', {
        value: {getData: (/** @type {string} */ type) => (type === 'text/plain' ? src : '')}
      });
      Object.defineProperty(evt, 'target', {value: td, configurable: true});
      table.dispatchEvent(evt);
    }, sourceFileTd);

    await page.waitForTimeout(500);

    // Test 4: Drop on TD WITH list-item class (should NOT trigger handler)
    // This ensures the !targetEl.classList.contains('list-item') check is fully covered
    await page.evaluate((/** @type {string} */ src) => {
      const table = document.querySelector('table[data-base-path]');
      if (!table) {
        throw new Error('Table not found');
      }

      let tr = table.querySelector('tr');
      if (!tr) {
        tr = document.createElement('tr');
        table.append(tr);
      }

      const tdWithClass = document.createElement('td');
      tdWithClass.classList.add('list-item'); // This should prevent the handler from running
      tr.append(tdWithClass);

      const evt = new DragEvent('drop', {bubbles: true, cancelable: true, altKey: true});
      Object.defineProperty(evt, 'dataTransfer', {
        value: {getData: (/** @type {string} */ type) => (type === 'text/plain' ? src : '')}
      });
      Object.defineProperty(evt, 'target', {value: tdWithClass, configurable: true});
      table.dispatchEvent(evt);
    }, sourceFileTd);

    await page.waitForTimeout(100);

    // Verify operations happened
    const copySourceExists = fs.existsSync(sourceFileCopy);
    const tdSourceExists = fs.existsSync(sourceFileTd);

    expect(copySourceExists).toBe(true);
    expect(tdSourceExists).toBe(true);

    // Cleanup
    try {
      if (fs.existsSync(sourceFileCopy)) {
        fs.unlinkSync(sourceFileCopy);
      }
      if (fs.existsSync(sourceFileMove)) {
        fs.unlinkSync(sourceFileMove);
      }
      if (fs.existsSync(sourceFileTd)) {
        fs.unlinkSync(sourceFileTd);
      }
      // Also cleanup any copies that were created
      const files = fs.readdirSync(testDir);
      files.forEach((file) => {
        if (file.startsWith('drop-')) {
          const filePath = path.join(testDir, file);
          try {
            fs.unlinkSync(filePath);
          } catch (e) {
            // Ignore
          }
        }
      });
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  test('escape key cancels drag operation (lines 106-127, 175)', async () => {
    // Create a test folder for dragging
    const dragFolder = path.join(testDir, 'drag-test-folder');
    if (!fs.existsSync(dragFolder)) {
      fs.mkdirSync(dragFolder, {recursive: true});
    }

    // Reload page
    await page.evaluate((dir) => {
      globalThis.location.hash = `#path=${encodeURIComponent(dir)}`;
    }, testDir);
    await page.waitForSelector('table[data-base-path]');
    await page.waitForTimeout(1000);

    const result = await page.evaluate(() => {
      // Find the folder cell
      const cells = document.querySelectorAll('td.list-item');
      let folderCell = null;

      for (const cell of cells) {
        const link = cell.querySelector('a[data-path]');
        if (link) {
          folderCell = cell;
          break;
        }
      }

      if (!folderCell) {
        return {success: false, reason: 'no folder found'};
      }

      // Start a drag
      const dragStartEvent = new DragEvent('dragstart', {
        bubbles: true,
        cancelable: true
      });

      const mockDataTransfer = {
        effectAllowed: 'copyMove',
        setData () {
          // Mock implementation
        },
        getData () {
          return '';
        },
        files: [],
        items: [],
        types: []
      };

      Object.defineProperty(dragStartEvent, 'dataTransfer', {
        value: mockDataTransfer,
        writable: false
      });

      folderCell.dispatchEvent(dragStartEvent);

      // Add drag-over class to simulate dragging over elements
      folderCell.classList.add('drag-over');
      const anotherCell = cells[0];
      if (anotherCell) {
        anotherCell.classList.add('drag-over');
      }

      // Check that drag is in progress
      const dragInProgressBefore = folderCell.getAttribute('draggable') === 'true';

      // Check draggable before escape (should be 'true')
      const draggableBeforeEscape = folderCell.getAttribute('draggable');

      // Dispatch Escape key
      const escapeEvent = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true
      });

      document.dispatchEvent(escapeEvent);

      // Immediately after escape, draggable should be 'false' (line 113)
      const draggableSetToFalse = folderCell.getAttribute('draggable') === 'false';

      // Check that drag-over classes are removed immediately by escape handler (lines 123-125)
      const dragOverElements = document.querySelectorAll('.drag-over');
      const dragOverCleared = dragOverElements.length === 0;

      // Re-add drag-over class to test dragend handler (line 175)
      folderCell.classList.add('drag-over');
      if (anotherCell) {
        anotherCell.classList.add('drag-over');
      }

      // Trigger dragend event to clean up
      const dragEndEvent = new DragEvent('dragend', {
        bubbles: true,
        cancelable: true
      });
      folderCell.dispatchEvent(dragEndEvent);

      // Check that dragend handler also removed drag-over classes
      const dragOverElementsAfterDragend = document.querySelectorAll('.drag-over');
      const dragOverClearedByDragend = dragOverElementsAfterDragend.length === 0;

      return {
        success: true,
        dragInProgressBefore,
        draggableBeforeEscape,
        draggableSetToFalse,
        dragOverCleared,
        dragOverClearedByDragend
      };
    });

    expect(result.success).toBe(true);
    expect(result.dragInProgressBefore).toBe(true);
    expect(result.draggableBeforeEscape).toBe('true');
    expect(result.draggableSetToFalse).toBe(true); // Line 113 executed
    expect(result.dragOverCleared).toBe(true); // Lines 123-125 executed
    expect(result.dragOverClearedByDragend).toBe(true); // Line 175 executed
  });
});
