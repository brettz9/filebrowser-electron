/* eslint-disable chai-expect-keywords/no-unsupported-keywords -- Not Chai */
import {expect, test} from '@playwright/test';

import {initialize, coverage} from './utils/initialize.js';

const {beforeEach, afterEach, describe} = test;

/** @type {import('playwright').ElectronApplication} */
let electron;

/** @type {import('playwright').Page} */
let page;

beforeEach(async () => {
  ({electron, page} = await initialize());

  // Clear storage to remove sticky notes
  await page.evaluate(() => {
    // @ts-expect-error - electronAPI storage
    globalThis.electronAPI.storage.clear();
  });

  // Reload to ensure clean state
  await page.reload();
  await page.waitForLoadState('domcontentloaded');

  // Wait a bit for any sticky notes to be rendered (if they still appear)
  await page.waitForTimeout(500);

  // Verify no sticky notes are present
  const stickyCount = await page.locator('.sticky-note').count();
  if (stickyCount > 0) {
    throw new Error(
      `Found ${stickyCount} sticky note(s) after clearing storage`
    );
  }
});

afterEach(async () => {
  return await coverage({electron, page});
});

describe('Icon view keyboard navigation', () => {
  test('should select cell on click', async () => {
    // Switch to icon view
    await page.click('#icon-view');
    await page.waitForTimeout(500);

    // Click on first cell
    const firstCell = page.locator('td.list-item').first();
    await firstCell.click();

    // Check that cell has selected class
    const hasSelected = await firstCell.evaluate((el) => {
      return el.classList.contains('selected');
    });
    expect(hasSelected).toBe(true);
  });

  test('should navigate with arrow keys', async () => {
    // Switch to icon view
    await page.click('#icon-view');
    await page.waitForTimeout(500);

    // Click on first cell to select it
    const firstCell = page.locator('td.list-item').first();
    await firstCell.click();

    // Focus the table
    await page.locator('table[data-base-path]').focus();

    // Press ArrowRight to move to next cell
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    // Check that second cell is now selected
    const secondCell = page.locator('td.list-item').nth(1);
    const secondSelected = await secondCell.evaluate((el) => {
      return el.classList.contains('selected');
    });
    expect(secondSelected).toBe(true);

    // Press ArrowLeft to move back
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(100);

    // Check that first cell is selected again
    const firstSelected = await firstCell.evaluate((el) => {
      return el.classList.contains('selected');
    });
    expect(firstSelected).toBe(true);
  });

  test('should navigate down with ArrowDown', async () => {
    // Switch to icon view
    await page.click('#icon-view');
    await page.waitForTimeout(500);

    // Click on first cell
    const firstCell = page.locator('td.list-item').first();
    await firstCell.click();

    // Focus the table
    await page.locator('table[data-base-path]').focus();

    // Press ArrowDown to move down one row (4 cells in icon view)
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(100);

    // Check that the cell 4 positions down is selected
    const cells = page.locator('td.list-item');
    const cellCount = await cells.count();

    if (cellCount > 4) {
      const fifthCell = cells.nth(4);
      const fifthSelected = await fifthCell.evaluate((el) => {
        return el.classList.contains('selected');
      });
      expect(fifthSelected).toBe(true);
    }
  });

  test('should do typeahead search', async () => {
    // Switch to icon view
    await page.click('#icon-view');
    await page.waitForTimeout(500);

    // Focus the table
    await page.locator('table[data-base-path]').focus();

    // Type 'd' to search for items starting with 'd'
    await page.keyboard.press('d');
    await page.waitForTimeout(200);

    // Check that a cell starting with 'd' or 'D' is selected
    const selectedCell = page.locator('td.list-item.selected');
    const selectedText = await selectedCell.evaluate((el) => {
      const link = el.querySelector('a, span');
      return link?.textContent?.toLowerCase() || '';
    });

    expect(selectedText.startsWith('d')).toBe(true);
  });

  test('should handle multi-character typeahead', async () => {
    // Switch to icon view
    await page.click('#icon-view');
    await page.waitForTimeout(500);

    // Focus the table
    await page.locator('table[data-base-path]').focus();

    // Type 'de' quickly to search for items starting with 'de'
    await page.keyboard.type('de', {delay: 50});
    await page.waitForTimeout(200);

    // Check that a cell starting with 'de' is selected (if exists)
    const selectedCell = page.locator('td.list-item.selected');
    const count = await selectedCell.count();

    if (count > 0) {
      const selectedText = await selectedCell.evaluate((el) => {
        const link = el.querySelector('a, span');
        return link?.textContent?.toLowerCase() || '';
      });

      // Either starts with 'de' or starts with 'd' if no 'de' match
      expect(
        selectedText.startsWith('de') || selectedText.startsWith('d')
      ).toBe(true);
    }
  });

  test('should use Cmd+C/X with selected cell', async () => {
    // Switch to icon view
    await page.click('#icon-view');
    await page.waitForTimeout(500);

    // Click on first cell
    const firstCell = page.locator('td.list-item').first();
    await firstCell.click();

    // Focus the table
    await page.locator('table[data-base-path]').focus();

    // Press Cmd+C to copy
    await page.keyboard.press('Meta+c');
    await page.waitForTimeout(100);

    // Check clipboard was set
    const clipboard = await page.evaluate(() => {
      // @ts-expect-error - clipboard exposed for testing
      return globalThis.clipboard;
    });
    expect(clipboard).not.toBeNull();
    expect(clipboard?.isCopy).toBe(true);
  });

  test('should switch views with Cmd+1 and Cmd+3', async () => {
    // Start in icon view
    await page.click('#icon-view');
    await page.waitForTimeout(500);

    // Switch to three-columns with Cmd+3
    await page.keyboard.press('Meta+3');
    await page.waitForTimeout(500);

    // Check that three-columns is selected
    const threeColumnsSelected = await page.evaluate(() => {
      return document.querySelector('#three-columns')?.classList.
        contains('selected');
    });
    expect(threeColumnsSelected).toBe(true);

    // Switch back to icon view with Cmd+1
    await page.keyboard.press('Meta+1');
    await page.waitForTimeout(500);

    // Check that icon-view is selected
    const iconViewSelected = await page.evaluate(() => {
      return document.querySelector('#icon-view')?.classList.
        contains('selected');
    });
    expect(iconViewSelected).toBe(true);
  });

  test('should open folder with Cmd+O', async () => {
    // Switch to icon view
    await page.click('#icon-view');
    await page.waitForTimeout(500);

    // Select first cell (should be a folder)
    const firstCell = page.locator('td.list-item').first();
    await firstCell.click();

    // Check if it's a folder
    const isFolder = await firstCell.evaluate((el) => {
      return el.querySelector('a') !== null;
    });

    if (isFolder) {
      // Get the folder path before navigating
      const folderPath = await firstCell.evaluate((el) => {
        const link = el.querySelector('a');
        return link?.dataset?.path;
      });

      // Focus the table
      await page.locator('table[data-base-path]').focus();

      // Press Cmd+O to open folder
      await page.keyboard.press('Meta+o');
      await page.waitForTimeout(500);

      // Check that we navigated into the folder
      const currentPath = await page.evaluate(() => {
        return globalThis.location.hash;
      });

      expect(currentPath).toContain(encodeURIComponent(folderPath || ''));
    }
  });

  test('should open file with Cmd+O', async () => {
    // Create a test file
    const testFilePath = await page.evaluate(() => {
      // @ts-expect-error - electronAPI available
      const {fs, path} = globalThis.electronAPI;
      // @ts-expect-error - electronAPI available
      const homeDir = globalThis.electronAPI.os.homedir();
      const testPath = path.join(homeDir, 'test-cmdo-file.txt');
      // eslint-disable-next-line n/no-sync -- Test setup
      fs.writeFileSync(testPath, 'test content');
      return testPath;
    });

    // Navigate to home directory
    await page.evaluate(() => {
      // @ts-expect-error - electronAPI available
      const homeDir = globalThis.electronAPI.os.homedir();
      globalThis.location.hash = `#path=${encodeURIComponent(homeDir)}`;
    });

    // Switch to icon view first
    await page.click('#icon-view');
    await page.waitForTimeout(1000);

    // Find and select the test file
    const testCell = page.locator(
      `td.list-item:has(span[data-path*="test-cmdo-file.txt"])`
    ).first();

    // Verify the cell exists and has the right structure
    const cellInfo = await testCell.evaluate((el) => {
      const link = el.querySelector('a');
      const span = el.querySelector('span');
      return {
        hasLink: link !== null,
        hasSpan: span !== null,
        spanPath: span?.dataset?.path,
        isFolder: link !== null
      };
    });

    // If it's a folder, skip this test
    if (cellInfo.isFolder) {
      // Cleanup and skip
      await page.evaluate((filePath) => {
        // @ts-expect-error - electronAPI available
        const {fs} = globalThis.electronAPI;
        try {
          // eslint-disable-next-line n/no-sync -- Test cleanup
          fs.unlinkSync(filePath);
        } catch {}
      }, testFilePath);
      return;
    }

    await testCell.click();

    // Set up test hook AFTER clicking (which might trigger refresh)
    await page.evaluate(() => {
      // @ts-expect-error - Test mock
      globalThis.cmdoOpenPathCalled = false;
      // @ts-expect-error - Test mock
      globalThis.cmdoOpenedPath = null;
      // @ts-expect-error - Test hook
      globalThis.testShellOpenPath = (/** @type {string} */ path) => {
        // @ts-expect-error - Test mock
        globalThis.cmdoOpenPathCalled = true;
        // @ts-expect-error - Test mock
        globalThis.cmdoOpenedPath = path;
      };
    });

    // Focus the table
    await page.locator('table[data-base-path]').focus();

    // Add debug listener to track keydown events
    await page.evaluate(() => {
      // @ts-expect-error - Test mock
      globalThis.keydownFired = false;
      // @ts-expect-error - Test mock
      globalThis.cmdoHandled = false;
      const table = document.querySelector('table[data-base-path]');
      table?.addEventListener('keydown', (e) => {
        // @ts-expect-error - Test mock
        globalThis.keydownFired = true;
        // @ts-expect-error - KeyboardEvent properties
        if (e.metaKey && e.key === 'o') {
          // @ts-expect-error - Test mock
          globalThis.cmdoHandled = true;
        }
      }, {capture: true});
    });

    // Press Cmd+O to open file
    await page.keyboard.press('Meta+o');
    await page.waitForTimeout(500);

    // Check debug info
    const debugInfo = await page.evaluate(() => {
      return {
        // @ts-expect-error - Test mock
        keydownFired: globalThis.keydownFired,
        // @ts-expect-error - Test mock
        cmdoHandled: globalThis.cmdoHandled,
        // @ts-expect-error - Test mock
        openPathCalled: globalThis.cmdoOpenPathCalled,
        // @ts-expect-error - Test mock
        openedPath: globalThis.cmdoOpenedPath,
        hasSelectedCell: document.querySelector(
          'td.list-item.selected'
        ) !== null,
        selectedCellHasLink: document.querySelector(
          'td.list-item.selected a'
        ) !== null,
        selectedCellHasSpan: document.querySelector(
          'td.list-item.selected span'
        ) !== null,
        // @ts-expect-error - Test mock
        mockIsFunction: typeof globalThis.electronAPI.shell.openPath ===
          'function',
        // @ts-expect-error - Test mock
        mockIsSameAsOriginal: globalThis.electronAPI.shell.openPath ===
          // @ts-expect-error - Test mock
          globalThis.originalOpenPath,
        // @ts-expect-error - Handler debug
        cmdoDebug: globalThis.cmdoDebug
      };
    });

    // If debugging needed, this will show what went wrong
    if (!debugInfo.openPathCalled) {
      const msg = `shell.openPath not called. Debug: ${
        JSON.stringify(debugInfo, null, 2)
      }`;
      throw new Error(msg);
    }

    // Check that shell.openPath was called
    const openPathCalled = await page.evaluate(() => {
      // @ts-expect-error - Test mock
      return globalThis.cmdoOpenPathCalled;
    });

    expect(openPathCalled).toBe(true);

    // Cleanup
    await page.evaluate((filePath) => {
      // @ts-expect-error - electronAPI available
      const {fs} = globalThis.electronAPI;
      try {
        // eslint-disable-next-line n/no-sync -- Test cleanup
        fs.unlinkSync(filePath);
      } catch {}
    }, testFilePath);
  });

  test('should delete item with Cmd+Backspace', async () => {
    // Create a test file
    const testFilePath = await page.evaluate(() => {
      // @ts-expect-error - electronAPI available
      const {fs, path} = globalThis.electronAPI;
      // @ts-expect-error - electronAPI available
      const homeDir = globalThis.electronAPI.os.homedir();
      const testPath = path.join(homeDir, 'test-delete-file.txt');
      // eslint-disable-next-line n/no-sync -- Test setup
      fs.writeFileSync(testPath, 'test content');
      return testPath;
    });

    // Navigate to home directory
    await page.evaluate(() => {
      // @ts-expect-error - electronAPI available
      const homeDir = globalThis.electronAPI.os.homedir();
      globalThis.location.hash = `#path=${encodeURIComponent(homeDir)}`;
    });

    // Switch to icon view
    await page.click('#icon-view');
    await page.waitForTimeout(1000);

    // Find and select the test file
    const testCell = page.locator(
      `td.list-item:has(span[data-path*="test-delete-file.txt"])`
    ).first();
    await testCell.click();

    // Focus the table
    await page.locator('table[data-base-path]').focus();

    // Set up dialog handler to accept the delete confirmation
    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });

    // Press Cmd+Backspace to delete
    await page.keyboard.press('Meta+Backspace');
    await page.waitForTimeout(500);

    // Check that file was deleted
    const fileExists = await page.evaluate((filePath) => {
      // @ts-expect-error - electronAPI available
      const {fs} = globalThis.electronAPI;
      // eslint-disable-next-line n/no-sync -- Test verification
      return fs.existsSync(filePath);
    }, testFilePath);

    expect(fileExists).toBe(false);
  });

  test('should rename item with Enter key', async () => {
    // Create a test file
    await page.evaluate(() => {
      // @ts-expect-error - electronAPI available
      const {fs, path} = globalThis.electronAPI;
      // @ts-expect-error - electronAPI available
      const homeDir = globalThis.electronAPI.os.homedir();
      const testPath = path.join(homeDir, 'test-rename-file.txt');
      // eslint-disable-next-line n/no-sync -- Test setup
      fs.writeFileSync(testPath, 'test content');
    });

    // Navigate to home directory
    await page.evaluate(() => {
      // @ts-expect-error - electronAPI available
      const homeDir = globalThis.electronAPI.os.homedir();
      globalThis.location.hash = `#path=${encodeURIComponent(homeDir)}`;
    });

    // Switch to icon view
    await page.click('#icon-view');
    await page.waitForTimeout(1000);

    // Find and select the test file
    const testCell = page.locator(
      `td.list-item:has(span[data-path*="test-rename-file.txt"])`
    ).first();
    await testCell.click();

    // Focus the table
    await page.locator('table[data-base-path]').focus();

    // Press Enter to start rename
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // Check that input field appeared
    const inputExists = await page.evaluate(() => {
      return document.querySelector('td.list-item.selected input') !== null;
    });

    expect(inputExists).toBe(true);

    // Select all and type complete new name
    await page.keyboard.press('Meta+a');
    await page.keyboard.type('test-rename-file-renamed.txt');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);

    // Check that file was renamed and is still selected
    const renameDebug = await page.evaluate(() => {
      const selectedCell = document.querySelector('td.list-item.selected');
      const span = selectedCell?.querySelector('span');
      const allSpans = [...document.querySelectorAll('td.list-item span')].
        map((s) => s.textContent);
      return {
        hasSelectedCell: selectedCell !== null,
        selectedSpanText: span?.textContent,
        allFileNames: allSpans,
        containsRenamed: span?.textContent?.
          includes('test-rename-file-renamed.txt')
      };
    });

    if (!renameDebug.containsRenamed) {
      throw new Error(
        `Rename failed. Debug: ${JSON.stringify(renameDebug, null, 2)}`
      );
    }

    expect(renameDebug.containsRenamed).toBe(true);

    // Cleanup
    await page.evaluate(() => {
      // @ts-expect-error - electronAPI available
      const {fs, path} = globalThis.electronAPI;
      // @ts-expect-error - electronAPI available
      const homeDir = globalThis.electronAPI.os.homedir();
      const testPath = path.join(homeDir, 'test-rename-file-renamed.txt');
      try {
        // eslint-disable-next-line n/no-sync -- Test cleanup
        fs.unlinkSync(testPath);
      } catch {}
    });
  });

  test('should navigate into folder with double-click', async () => {
    // Navigate to home directory first
    await page.evaluate(() => {
      // @ts-expect-error - electronAPI available
      const homeDir = globalThis.electronAPI.os.homedir();
      globalThis.location.hash = `#path=${encodeURIComponent(homeDir)}`;
    });

    // Switch to icon view
    await page.click('#icon-view');
    await page.waitForTimeout(1000);

    // Find the first folder (has an <a> tag)
    const folderCell = await page.locator(
      'td.list-item:has(a[data-path])'
    ).first();

    // Get the folder path
    const folderPath = await folderCell.evaluate((el) => {
      const link = el.querySelector('a');
      return link?.dataset?.path;
    });

    // Double-click the folder
    await folderCell.dblclick();
    await page.waitForTimeout(500);

    // Check that we navigated into the folder
    const currentPath = await page.evaluate(() => {
      return globalThis.location.hash;
    });

    expect(currentPath).toContain(folderPath || '');
  });

  test('should open file with double-click', async () => {
    // Create a test file
    const testFilePath = await page.evaluate(() => {
      // @ts-expect-error - electronAPI available
      const {fs, path} = globalThis.electronAPI;
      // @ts-expect-error - electronAPI available
      const homeDir = globalThis.electronAPI.os.homedir();
      const testPath = path.join(homeDir, 'test-dblclick-file.txt');
      // eslint-disable-next-line n/no-sync -- Test setup
      fs.writeFileSync(testPath, 'test content');
      return testPath;
    });

    // Navigate to home directory
    await page.evaluate(() => {
      // @ts-expect-error - electronAPI available
      const homeDir = globalThis.electronAPI.os.homedir();
      globalThis.location.hash = `#path=${encodeURIComponent(homeDir)}`;
    });

    // Switch to icon view
    await page.click('#icon-view');
    await page.waitForTimeout(1000);

    // Set up test hook
    await page.evaluate(() => {
      // @ts-expect-error - Test mock
      globalThis.openPathCalled = false;
      // @ts-expect-error - Test mock
      globalThis.openedPath = null;
      // @ts-expect-error - Test hook
      globalThis.testShellOpenPath = (/** @type {string} */ path) => {
        // @ts-expect-error - Test mock
        globalThis.openPathCalled = true;
        // @ts-expect-error - Test mock
        globalThis.openedPath = path;
      };
    });

    // Find and double-click the test file
    const testCell = page.locator(
      `td.list-item:has(span[data-path*="test-dblclick-file.txt"])`
    ).first();
    await testCell.dblclick();
    await page.waitForTimeout(500);

    // Check that shell.openPath was called
    const openPathCalled = await page.evaluate(() => {
      // @ts-expect-error - Test mock
      return globalThis.openPathCalled;
    });

    expect(openPathCalled).toBe(true);

    // Cleanup
    await page.evaluate((filePath) => {
      // @ts-expect-error - electronAPI available
      const {fs} = globalThis.electronAPI;
      try {
        // eslint-disable-next-line n/no-sync -- Test cleanup
        fs.unlinkSync(filePath);
      } catch {}
    }, testFilePath);
  });
});
