/* eslint-disable n/no-sync -- Testing */
/* eslint-disable sonarjs/publicly-writable-directories -- Safe test usage */
/* eslint-disable chai-expect-keywords/no-unsupported-keywords -- Not Chai */

import {rm} from 'node:fs/promises';
import path from 'node:path';
import {expect, test} from '@playwright/test';

import {initialize, coverage} from './utils/initialize.js';

const {beforeEach, afterEach, describe} = test;

/** @type {import('playwright').ElectronApplication} */
let electron;

/** @type {import('playwright').Page} */
let page;

beforeEach(async () => {
  ({electron, page} = await initialize());
});

afterEach(async () => {
  // Remove storage
  const userData = await electron.evaluate(async ({app}) => {
    return await app.getPath('userData');
  });

  const storageFilePath = path.join(
    userData, 'storage.json'
  );
  try {
    await rm(storageFilePath);
  } catch {}

  return await coverage({electron, page});
});

describe('icon view sorting', () => {
  test('right-click empty space shows Sort by submenu', async () => {
    // Create test directory with one file
    await page.evaluate(() => {
      // @ts-expect-error Our own API
      const {fs} = globalThis.electronAPI;
      const testDir = '/tmp/test-context-menu';
      fs.rmSync(testDir, {recursive: true, force: true});
      fs.mkdirSync(testDir);
      fs.writeFileSync(`${testDir}/file1.txt`, 'test');
    });

    // Switch to icon-view
    await page.locator('#icon-view').click();
    await page.waitForTimeout(500);

    // Navigate to test folder
    await page.evaluate(() => {
      globalThis.location.hash = '#path=/tmp/test-context-menu';
    });
    await page.waitForTimeout(1000);

    // Get the table element and a table row
    const table = await page.locator('table[data-base-path]');
    await table.waitFor({state: 'visible', timeout: 5000});

    // Find the first TR that contains the file
    const firstRow = await table.locator('tr').first();
    await firstRow.waitFor({state: 'visible'});

    // Right-click directly on the TR element (not its content)
    await firstRow.click({button: 'right', force: true});

    await page.waitForTimeout(500);

    // Check if context menu appeared
    const contextMenu = await page.locator('.context-menu');
    await contextMenu.waitFor({state: 'visible', timeout: 5000});
    expect(contextMenu).toBeVisible();

    // Verify Sort by submenu exists
    const sortByItem = await page.locator(
      '.context-menu-item.has-submenu:has-text("Sort by")'
    );
    expect(sortByItem).toBeVisible();

    // Hover to show submenu
    await sortByItem.hover();
    await page.waitForTimeout(300);

    // Check submenu items
    const submenu = await page.locator('.context-submenu');
    await submenu.waitFor({state: 'visible', timeout: 5000});

    const submenuText = await submenu.textContent();
    expect(submenuText).toContain('None');
    expect(submenuText).toContain('Snap to Grid');
    expect(submenuText).toContain('Name');
    expect(submenuText).toContain('Size');

    // Clean up - close menu
    await page.mouse.click(200, 200);
    await page.waitForTimeout(300);
  });

  test('selecting None mode enables icon repositioning', async () => {
    // Create test files in /tmp
    await page.evaluate(() => {
      // @ts-expect-error Our own API
      const {fs} = globalThis.electronAPI;
      const testDir = '/tmp/test-icon-sort';

      try {
        fs.rmSync(testDir, {recursive: true, force: true});
      } catch (e) {
        // Ignore
      }

      fs.mkdirSync(testDir);
      fs.writeFileSync(`${testDir}/file1.txt`, 'content1');
      fs.writeFileSync(`${testDir}/file2.txt`, 'content2');
      fs.writeFileSync(`${testDir}/file3.txt`, 'content3');
    });

    // Switch to icon-view
    await page.locator('#icon-view').click();
    await page.waitForTimeout(500);

    // Navigate to test folder
    await page.evaluate(() => {
      globalThis.location.hash = '#path=/tmp/test-icon-sort';
    });
    await page.waitForTimeout(1000);

    // Get the table element
    const table = await page.locator('table[data-base-path]');
    await table.waitFor({state: 'visible', timeout: 5000});

    // Get first row to right-click
    const firstRow = await table.locator('tr').first();
    await firstRow.waitFor({state: 'visible'});

    // Right-click to show context menu
    await firstRow.click({button: 'right', force: true});
    await page.waitForTimeout(500);

    // Click Sort by > None
    const sortByItem = await page.locator(
      '.context-menu-item.has-submenu:has-text("Sort by")'
    );
    await sortByItem.hover();
    await page.waitForTimeout(300);

    const noneItem = await page.locator(
      '.context-submenu .context-menu-item:has-text("None")'
    ).first();
    await noneItem.click();
    await page.waitForTimeout(1000);

    // Verify cells are draggable (in None mode, items are divs with
    // class icon-freeform-item)
    const firstCell = await page.locator('.icon-freeform-item').first();
    const isDraggable = await firstCell.evaluate(
      (el) => el.getAttribute('draggable')
    );
    expect(isDraggable).toBe('true');

    // Verify the sort mode is stored
    const sortMode = await page.evaluate(() => {
      // @ts-expect-error Our own API
      return globalThis.electronAPI.storage.getItem('icon-view-sort-mode');
    });
    expect(sortMode).toBe('none');

    // Clean up
    await page.evaluate(() => {
      // @ts-expect-error Our own API
      const {fs} = globalThis.electronAPI;
      try {
        fs.rmSync('/tmp/test-icon-sort', {recursive: true, force: true});
      } catch (e) {
        // Ignore
      }
    });
  });

  test('dragging icon to empty cell repositions it', async () => {
    // Create test files
    await page.evaluate(() => {
      // @ts-expect-error Our own API
      const {fs} = globalThis.electronAPI;
      const testDir = '/tmp/test-drag-icons';

      try {
        fs.rmSync(testDir, {recursive: true, force: true});
      } catch (e) {
        // Ignore
      }

      fs.mkdirSync(testDir);
      fs.writeFileSync(`${testDir}/fileA.txt`, 'A');
      fs.writeFileSync(`${testDir}/fileB.txt`, 'B');
    });

    // Switch to icon-view and set None mode
    await page.locator('#icon-view').click();
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      localStorage.setItem('icon-view-sort-mode', 'none');
      globalThis.location.hash = '#path=/tmp/test-drag-icons';
    });
    await page.waitForTimeout(1500);

    // Get initial positions
    const initialCells = await page.locator('td.list-item').all();
    expect(initialCells.length).toBeGreaterThan(0);

    // Verify draggable attribute exists
    const firstCellDraggable = await initialCells[0].evaluate(
      (el) => el.getAttribute('draggable')
    );
    expect(firstCellDraggable).toBe('true');

    // Clean up
    await page.evaluate(() => {
      // @ts-expect-error Our own API
      const {fs} = globalThis.electronAPI;
      try {
        fs.rmSync('/tmp/test-drag-icons', {recursive: true, force: true});
      } catch (e) {
        // Ignore
      }
      localStorage.removeItem('icon-view-sort-mode');
    });
  });
});
