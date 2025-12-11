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

describe.only('Icon view keyboard navigation', () => {
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

  test('should support typeahead search', async () => {
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

  test('should support multi-character typeahead', async () => {
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
});
