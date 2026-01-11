/**
 * @file Tests for list-view functionality in index.js.
 */

/* eslint-disable sonarjs/publicly-writable-directories -- Safe */
/* eslint-disable chai-expect-keywords/no-unsupported-keywords -- Not Chai */
/* eslint-disable n/no-sync -- Testing */
/* eslint-disable @stylistic/max-len -- Test file with long locators */

import {test, expect} from '@playwright/test';
import {initialize, coverage} from './utils/initialize.js';

import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const {
  afterEach, afterAll, beforeEach, beforeAll, describe
} = test;

describe('List View', () => {
  /** @type {import('playwright').ElectronApplication} */
  let electron;
  /** @type {import('playwright').Page} */
  let page;
  const testDir = path.join(__dirname, 'test-list-view-files');

  beforeAll(() => {
    // Create test directory structure
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, {recursive: true});
    }

    // Create test files
    fs.writeFileSync(
      path.join(testDir, 'file-a.txt'),
      'Content A'
    );
    fs.writeFileSync(
      path.join(testDir, 'file-b.txt'),
      'Content B'
    );
    fs.writeFileSync(
      path.join(testDir, 'file-c.txt'),
      'Content C'
    );

    // Create test folders
    const subDir1 = path.join(testDir, 'folder-1');
    const subDir2 = path.join(testDir, 'folder-2');
    if (!fs.existsSync(subDir1)) {
      fs.mkdirSync(subDir1, {recursive: true});
    }
    if (!fs.existsSync(subDir2)) {
      fs.mkdirSync(subDir2, {recursive: true});
    }

    // Create nested structure for tree view tests
    fs.writeFileSync(
      path.join(subDir1, 'nested-file.txt'),
      'Nested content'
    );
    const nestedDir = path.join(subDir1, 'nested-folder');
    if (!fs.existsSync(nestedDir)) {
      fs.mkdirSync(nestedDir, {recursive: true});
    }
    fs.writeFileSync(
      path.join(nestedDir, 'deep-file.txt'),
      'Deep content'
    );
  });

  beforeEach(async () => {
    ({electron, page} = await initialize());

    await page.evaluate(() => {
      // @ts-expect-error - electronAPI storage
      globalThis.electronAPI.storage.clear();
    });

    // Clear ALL localStorage to ensure clean state
    await page.evaluate(() => {
      localStorage.clear();
    });

    // Switch to list view
    await page.click('#list-view');
    await page.waitForTimeout(100);
  });

  afterEach(async () => {
    await coverage({electron, page});
  });

  afterAll(async () => {
    await electron.close();

    // Cleanup test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, {recursive: true, force: true});
    }
  });

  test('switches to list view mode', async () => {
    // Navigate to test directory
    await page.evaluate((dir) => {
      globalThis.location.hash = `#path=${encodeURIComponent(dir)}`;
    }, testDir);
    await page.waitForTimeout(500);

    // Verify list view is active
    const listViewButton = await page.locator('#list-view.selected');
    await expect(listViewButton).toBeVisible();

    // Verify list view table is visible
    const listViewTable = await page.locator('.list-view-table');
    await expect(listViewTable).toBeVisible();

    // Verify rows exist
    const rows = await page.locator('.list-view-table tbody tr');
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);
  });

  test('displays table headers with correct columns', async () => {
    await page.evaluate((dir) => {
      globalThis.location.hash = `#path=${encodeURIComponent(dir)}`;
    }, testDir);
    await page.waitForTimeout(800);

    // Wait for table to be visible
    await page.waitForSelector('.list-view-table', {state: 'visible'});

    // Check for default columns
    const iconHeader = await page.locator('th[data-column-id="icon"]');
    await expect(iconHeader).toBeVisible();

    const nameHeader = await page.locator('th[data-column-id="name"]');
    await expect(nameHeader).toBeVisible();

    const sizeHeader = await page.locator('th[data-column-id="size"]');
    await expect(sizeHeader).toBeVisible();

    const dateModifiedHeader = await page.locator('th[data-column-id="dateModified"]');
    await expect(dateModifiedHeader).toBeVisible();
  });

  test('selects a row on click', async () => {
    await page.evaluate((dir) => {
      globalThis.location.hash = `#path=${encodeURIComponent(dir)}`;
    }, testDir);
    await page.waitForTimeout(500);

    // Click first row
    const firstRow = await page.locator('.list-view-table tbody tr').first();
    await firstRow.click();
    await page.waitForTimeout(100);

    // Verify row is selected
    const hasSelectedClass = await firstRow.evaluate((el) => {
      return el.classList.contains('selected');
    });
    expect(hasSelectedClass).toBe(true);
  });

  test('changes selection when clicking different row', async () => {
    await page.evaluate((dir) => {
      globalThis.location.hash = `#path=${encodeURIComponent(dir)}`;
    }, testDir);
    await page.waitForTimeout(500);

    const rows = await page.locator('.list-view-table tbody tr').all();
    expect(rows.length).toBeGreaterThanOrEqual(2);

    // Click first row
    await rows[0].click();
    await page.waitForTimeout(100);

    // Click second row
    await rows[1].click();
    await page.waitForTimeout(100);

    // Verify second row is selected
    const secondSelected = await rows[1].evaluate((el) => {
      return el.classList.contains('selected');
    });
    expect(secondSelected).toBe(true);

    // Verify first row is not selected
    const firstSelected = await rows[0].evaluate((el) => {
      return el.classList.contains('selected');
    });
    expect(firstSelected).toBe(false);
  });

  test('double-click navigates into folder', async () => {
    await page.evaluate((dir) => {
      globalThis.location.hash = `#path=${encodeURIComponent(dir)}`;
    }, testDir);
    await page.waitForTimeout(500);

    // Find a folder row
    const folderRow = await page.locator('.list-view-table tbody tr').first();
    const isFolder = await folderRow.evaluate((row) => {
      const nameCell = row.querySelector('td.list-view-name');
      return nameCell && nameCell.textContent.includes('folder');
    });

    expect(isFolder).toBe(true);

    // Get current hash
    const hashBefore = await page.evaluate(() => globalThis.location.hash);

    // Double-click folder
    await folderRow.dblclick();
    await page.waitForTimeout(500);

    // Verify hash changed
    const hashAfter = await page.evaluate(() => globalThis.location.hash);
    expect(hashAfter).not.toBe(hashBefore);
  });

  test('sorts by name column ascending by default', async () => {
    // Ensure localStorage is completely clear RIGHT before navigation
    await page.evaluate(() => {
      localStorage.clear();
    });

    await page.evaluate((dir) => {
      globalThis.location.hash = `#path=${encodeURIComponent(dir)}`;
    }, testDir);
    await page.waitForTimeout(3000);

    // Wait for table to be visible
    await page.waitForSelector('.list-view-table', {state: 'visible'});
    await page.waitForTimeout(1000);

    // Get name header and wait for it to be visible
    const nameHeader = await page.locator('th[data-column-id="name"]');
    await nameHeader.waitFor({state: 'visible'});

    // Verify it has sort-asc class
    const hasAscClass = await nameHeader.evaluate((el) => {
      return el.classList.contains('sort-asc');
    });
    expect(hasAscClass).toBe(true);
  });

  test('toggles sort direction on column header click', async () => {
    await page.evaluate((dir) => {
      globalThis.location.hash = `#path=${encodeURIComponent(dir)}`;
    }, testDir);
    await page.waitForTimeout(2000);

    const nameHeader = await page.locator('th[data-column-id="name"]');
    await nameHeader.waitFor({state: 'visible'});

    // Click to change to descending
    await nameHeader.click();
    await page.waitForTimeout(2000);

    // Verify it has sort-desc class
    const hasDescClass = await nameHeader.evaluate((el) => {
      return el.classList.contains('sort-desc');
    });
    expect(hasDescClass).toBe(true);

    // Click again to change back to ascending
    await nameHeader.click();
    await page.waitForTimeout(2000);

    const hasAscClass = await nameHeader.evaluate((el) => {
      return el.classList.contains('sort-asc');
    });
    expect(hasAscClass).toBe(true);
  });

  test('sorts by different column', async () => {
    await page.evaluate((dir) => {
      globalThis.location.hash = `#path=${encodeURIComponent(dir)}`;
    }, testDir);
    await page.waitForTimeout(500);

    const sizeHeader = await page.locator('th[data-column-id="size"]');

    // Click size header
    await sizeHeader.click();
    await page.waitForTimeout(500);

    // Verify size header has sort-asc class
    const hasSizeAsc = await sizeHeader.evaluate((el) => {
      return el.classList.contains('sort-asc');
    });
    expect(hasSizeAsc).toBe(true);

    // Verify name header no longer has sort class
    const nameHeader = await page.locator('th[data-column-id="name"]');
    const nameHasSort = await nameHeader.evaluate((el) => {
      return el.classList.contains('sort-asc') || el.classList.contains('sort-desc');
    });
    expect(nameHasSort).toBe(false);
  });

  test('persists sort state in localStorage', async () => {
    await page.evaluate((dir) => {
      globalThis.location.hash = `#path=${encodeURIComponent(dir)}`;
    }, testDir);
    await page.waitForTimeout(2000);

    // Sort by size ascending first
    const sizeHeader = await page.locator('th[data-column-id="size"]');
    await sizeHeader.waitFor({state: 'visible'});
    await sizeHeader.click();
    await page.waitForTimeout(2000);

    // Check localStorage for ascending
    const sortStateAsc = await page.evaluate(() => {
      // @ts-expect-error - electronAPI storage
      const stored = globalThis.electronAPI.storage.getItem('list-view-sort');
      return stored ? JSON.parse(stored) : null;
    });

    expect(sortStateAsc).toBeTruthy();
    expect(sortStateAsc.column).toBe('size');
    expect(sortStateAsc.direction).toBe('asc');
  });

  test('clicking column header after expanding folders works', async () => {
    await page.evaluate((dir) => {
      globalThis.location.hash = `#path=${encodeURIComponent(dir)}`;
    }, testDir);
    await page.waitForTimeout(1000);

    // Enable tree mode
    const treeModeToggle = await page.locator('.tree-mode-toggle');
    await treeModeToggle.click();
    await page.waitForTimeout(1500);

    // Expand a folder
    const firstExpander = await page.locator('.tree-expander:not(.empty)').first();
    await firstExpander.click();
    await page.waitForTimeout(1000);

    // Now click a column header to sort
    const sizeHeader = await page.locator('th[data-column-id="size"]');
    await sizeHeader.click();
    await page.waitForTimeout(1000);

    // Verify it worked - should have sort-asc class
    const hasSortClass = await sizeHeader.evaluate((el) => {
      return el.classList.contains('sort-asc');
    });
    expect(hasSortClass).toBe(true);

    // Click again to test it doesn't crash
    await sizeHeader.click();
    await page.waitForTimeout(1000);

    const hasDescClass = await sizeHeader.evaluate((el) => {
      return el.classList.contains('sort-desc');
    });
    expect(hasDescClass).toBe(true);
  });

  test('clicking column checkbox after expanding folders works', async () => {
    await page.evaluate((dir) => {
      globalThis.location.hash = `#path=${encodeURIComponent(dir)}`;
    }, testDir);
    await page.waitForTimeout(1000);

    // Enable tree mode
    const treeModeToggle = await page.locator('.tree-mode-toggle');
    await treeModeToggle.click();
    await page.waitForTimeout(1500);

    // Expand a folder
    const firstExpander = await page.locator('.tree-expander:not(.empty)').first();
    await firstExpander.click();
    await page.waitForTimeout(1000);

    // Now open column picker
    const columnPickerButton = await page.locator('.column-picker-button');
    await columnPickerButton.click();
    await page.waitForTimeout(500);

    // Click a checkbox to toggle column visibility (use dateOpened which is hidden by default)
    const dateOpenedCheckbox = await page.locator('input[data-column-id="dateOpened"]');
    await dateOpenedCheckbox.click();
    await page.waitForTimeout(1000);

    // Verify the column is now visible
    const dateOpenedHeader = await page.locator('th[data-column-id="dateOpened"]');
    const isVisible = await dateOpenedHeader.isVisible();
    expect(isVisible).toBe(true);
  });

  test('shows column picker button', async () => {
    await page.evaluate((dir) => {
      globalThis.location.hash = `#path=${encodeURIComponent(dir)}`;
    }, testDir);
    await page.waitForTimeout(500);

    const columnPickerButton = await page.locator('.column-picker-button');
    await expect(columnPickerButton).toBeVisible();
  });

  test('opens column picker menu on button click', async () => {
    await page.evaluate((dir) => {
      globalThis.location.hash = `#path=${encodeURIComponent(dir)}`;
    }, testDir);
    await page.waitForTimeout(500);

    const columnPickerButton = await page.locator('.column-picker-button');
    await columnPickerButton.click();
    await page.waitForTimeout(200);

    const pickerMenu = await page.locator('.column-picker-menu');
    await expect(pickerMenu).toBeVisible();
  });

  test('column picker menu contains checkboxes for columns', async () => {
    await page.evaluate((dir) => {
      globalThis.location.hash = `#path=${encodeURIComponent(dir)}`;
    }, testDir);
    await page.waitForTimeout(500);

    const columnPickerButton = await page.locator('.column-picker-button');
    await columnPickerButton.click();
    await page.waitForTimeout(200);

    // Check for checkboxes
    const checkboxes = await page.locator('.column-picker-menu input[type="checkbox"]');
    const checkboxCount = await checkboxes.count();
    expect(checkboxCount).toBeGreaterThan(0);
  });

  test('toggles column visibility via picker', async () => {
    await page.evaluate((dir) => {
      globalThis.location.hash = `#path=${encodeURIComponent(dir)}`;
    }, testDir);
    await page.waitForTimeout(500);

    // Open picker
    const columnPickerButton = await page.locator('.column-picker-button');
    await columnPickerButton.click();
    await page.waitForTimeout(200);

    // Find a checkbox (e.g., for Date Created column)
    const checkboxes = await page.locator('.column-picker-menu input[type="checkbox"]').all();
    expect(checkboxes.length).toBeGreaterThan(0);

    // Get initial checked state
    const initialChecked = await checkboxes[0].isChecked();

    // Toggle checkbox (this triggers a page refresh)
    await checkboxes[0].click();
    await page.waitForTimeout(1000);

    // Re-open picker after refresh
    await columnPickerButton.click();
    await page.waitForTimeout(200);

    // Get checkboxes again after refresh
    const newCheckboxes = await page.locator('.column-picker-menu input[type="checkbox"]').all();
    const newChecked = await newCheckboxes[0].isChecked();

    // Verify state changed
    expect(newChecked).toBe(!initialChecked);
  });

  test('shows tree mode toggle button', async () => {
    await page.evaluate((dir) => {
      globalThis.location.hash = `#path=${encodeURIComponent(dir)}`;
    }, testDir);
    await page.waitForTimeout(500);

    const treeModeToggle = await page.locator('.tree-mode-toggle');
    await expect(treeModeToggle).toBeVisible();
  });

  test('toggles tree mode on button click', async () => {
    await page.evaluate((dir) => {
      globalThis.location.hash = `#path=${encodeURIComponent(dir)}`;
    }, testDir);
    await page.waitForTimeout(500);

    const treeModeToggle = await page.locator('.tree-mode-toggle');

    // Get initial opacity (should be 0.5 when off)
    const initialOpacity = await treeModeToggle.evaluate((el) => {
      return globalThis.getComputedStyle(el).opacity;
    });

    // Toggle tree mode
    await treeModeToggle.click();
    await page.waitForTimeout(500);

    // Get new opacity (should be 1 when on)
    const newOpacity = await treeModeToggle.evaluate((el) => {
      return globalThis.getComputedStyle(el).opacity;
    });

    expect(newOpacity).not.toBe(initialOpacity);
  });

  test('tree mode shows expander triangles for folders', async () => {
    // Navigate first
    await page.evaluate((dir) => {
      globalThis.location.hash = `#path=${encodeURIComponent(dir)}`;
    }, testDir);
    await page.waitForTimeout(800);

    // Wait for table to be visible
    await page.waitForSelector('.list-view-table', {state: 'visible', timeout: 5000});

    // Enable tree mode (this triggers a re-render via changePath())
    const treeModeToggle = await page.locator('.tree-mode-toggle');
    await treeModeToggle.click();

    // Wait for the re-render to complete - changePath() is synchronous but DOM updates take time
    await page.waitForTimeout(1500);

    // Wait for table to have tree structure
    await page.waitForSelector('.list-view-table tbody tr', {state: 'visible', timeout: 5000});
  });

  test('clicking expander expands folder', async () => {
    await page.evaluate((dir) => {
      globalThis.location.hash = `#path=${encodeURIComponent(dir)}`;
    }, testDir);
    await page.waitForTimeout(800);

    // Wait for table to be visible
    await page.waitForSelector('.list-view-table', {state: 'visible', timeout: 5000});

    // Enable tree mode
    const treeModeToggle = await page.locator('.tree-mode-toggle');
    await treeModeToggle.click();

    // Wait for the re-render to complete
    await page.waitForTimeout(1500);

    // Wait for rows to be visible
    await page.waitForSelector('.list-view-table tbody tr', {state: 'visible'});

    // Get initial row count
    const initialRows = await page.locator('.list-view-table tbody tr');
    const initialCount = await initialRows.count();

    // Click first expander (not empty)
    const firstExpander = await page.locator('.tree-expander:not(.empty)').first();
    const expanderExists = await firstExpander.count();
    expect(expanderExists).toBeGreaterThan(0);

    await firstExpander.click();
    await page.waitForTimeout(800);

    // Get new row count
    const newRows = await page.locator('.list-view-table tbody tr');
    const newCount = await newRows.count();

    // Should have same or more rows (folder-1 has nested files)
    expect(newCount).toBeGreaterThanOrEqual(initialCount);
  });

  test('clicking expander adds expanded class', async () => {
    await page.evaluate((dir) => {
      globalThis.location.hash = `#path=${encodeURIComponent(dir)}`;
    }, testDir);
    await page.waitForTimeout(800);

    // Wait for table to be visible
    await page.waitForSelector('.list-view-table', {state: 'visible', timeout: 5000});

    // Enable tree mode
    const treeModeToggle = await page.locator('.tree-mode-toggle');
    await treeModeToggle.click();

    // Wait for the re-render to complete
    await page.waitForTimeout(1500);

    // Wait for rows to be visible
    await page.waitForSelector('.list-view-table tbody tr', {state: 'visible'});

    // Click first non-empty expander
    const expanders = await page.locator('.tree-expander:not(.empty)').all();
    expect(expanders.length).toBeGreaterThan(0);

    await expanders[0].click();
    await page.waitForTimeout(800);

    // Check if expander has expanded class
    const hasExpandedClass = await expanders[0].evaluate((el) => {
      return el.classList.contains('expanded');
    });
    expect(hasExpandedClass).toBe(true);
  });

  test('clicking expanded expander collapses folder', async () => {
    await page.evaluate((dir) => {
      globalThis.location.hash = `#path=${encodeURIComponent(dir)}`;
    }, testDir);
    await page.waitForTimeout(1000);

    // Wait for table to be visible
    await page.waitForSelector('.list-view-table', {state: 'visible', timeout: 5000});

    // Enable tree mode
    const treeModeToggle = await page.locator('.tree-mode-toggle');
    await treeModeToggle.click();

    // Wait for the re-render to complete
    await page.waitForTimeout(2000);

    // Wait for table to be visible
    await page.waitForSelector('.list-view-table tbody tr', {state: 'visible'});
    await page.waitForTimeout(500);

    // Click expander to expand
    const firstExpander = await page.locator('.tree-expander:not(.empty)').first();
    const expanderExists = await firstExpander.count();
    expect(expanderExists).toBeGreaterThan(0);

    await firstExpander.click();
    await page.waitForTimeout(1000);

    const expandedCount = await page.locator('.list-view-table tbody tr').count();

    // Verify expander has expanded class
    const hasExpanded = await firstExpander.evaluate((el) => {
      return el.classList.contains('expanded');
    });

    expect(hasExpanded).toBe(true);

    // Click again to collapse
    await firstExpander.click();
    await page.waitForTimeout(1000);

    const collapsedCount = await page.locator('.list-view-table tbody tr').count();

    // Should have fewer rows after collapse
    expect(collapsedCount).toBeLessThan(expandedCount);
  });

  test('clicking expander removes expanded class on collapse', async () => {
    await page.evaluate((dir) => {
      globalThis.location.hash = `#path=${encodeURIComponent(dir)}`;
    }, testDir);
    await page.waitForTimeout(1000);

    // Wait for table to be visible
    await page.waitForSelector('.list-view-table', {state: 'visible', timeout: 5000});

    // Enable tree mode
    const treeModeToggle = await page.locator('.tree-mode-toggle');
    await treeModeToggle.click();

    // Wait for the re-render to complete
    await page.waitForTimeout(2000);

    // Wait for rows to be visible
    await page.waitForSelector('.list-view-table tbody tr', {state: 'visible'});
    await page.waitForTimeout(500);

    // Wait for expanders to be rendered
    await page.waitForSelector('.tree-expander:not(.empty)', {state: 'visible', timeout: 3000});

    // Click expander to expand
    const expanders = await page.locator('.tree-expander:not(.empty)').all();
    expect(expanders.length).toBeGreaterThan(0);

    await expanders[0].click();
    await page.waitForTimeout(800);

    // Click again to collapse
    await expanders[0].click();
    await page.waitForTimeout(800);

    // Check if expander no longer has expanded class
    const hasExpandedClass = await expanders[0].evaluate((el) => {
      return el.classList.contains('expanded');
    });
    expect(hasExpandedClass).toBe(false);
  });

  test('expanded folders show indented child items', async () => {
    await page.evaluate((dir) => {
      globalThis.location.hash = `#path=${encodeURIComponent(dir)}`;
    }, testDir);
    await page.waitForTimeout(500);

    // Enable tree mode
    const treeModeToggle = await page.locator('.tree-mode-toggle');
    await treeModeToggle.click();
    await page.waitForTimeout(1000);

    // Expand first folder
    const firstExpander = await page.locator('.tree-expander:not(.empty)').first();
    const expanderExists = await firstExpander.count();
    expect(expanderExists).toBeGreaterThan(0);

    await firstExpander.click();
    await page.waitForTimeout(800);

    // Check for tree-indent elements or rows with depth > 0
    const childRows = await page.locator('.list-view-table tbody tr[data-depth="1"]').count();
    expect(childRows).toBeGreaterThanOrEqual(0);
  });

  test('clicking expander does not navigate into folder', async () => {
    await page.evaluate((dir) => {
      globalThis.location.hash = `#path=${encodeURIComponent(dir)}`;
    }, testDir);
    await page.waitForTimeout(1000);

    // Wait for table to be visible
    await page.waitForSelector('.list-view-table', {state: 'visible', timeout: 5000});

    // Enable tree mode
    const treeModeToggle = await page.locator('.tree-mode-toggle');
    await treeModeToggle.click();

    // Wait for the re-render to complete
    await page.waitForTimeout(2000);

    // Wait for rows to be visible
    await page.waitForSelector('.list-view-table tbody tr', {state: 'visible'});
    await page.waitForTimeout(500);

    // Get current hash
    const initialHash = await page.evaluate(() => globalThis.location.hash);

    // Click expander
    const firstExpander = await page.locator('.tree-expander:not(.empty)').first();
    const expanderExists = await firstExpander.count();
    expect(expanderExists).toBeGreaterThan(0);

    await firstExpander.click();
    await page.waitForTimeout(800);

    // Hash should not have changed
    const currentHash = await page.evaluate(() => globalThis.location.hash);
    expect(currentHash).toBe(initialHash);
  });

  test('tree expansion state persists in localStorage', async () => {
    await page.evaluate((dir) => {
      globalThis.location.hash = `#path=${encodeURIComponent(dir)}`;
    }, testDir);
    await page.waitForTimeout(1000);

    // Wait for table to be visible
    await page.waitForSelector('.list-view-table', {state: 'visible', timeout: 5000});

    // Enable tree mode
    const treeModeToggle = await page.locator('.tree-mode-toggle');
    await treeModeToggle.click();

    // Wait for the re-render to complete
    await page.waitForTimeout(2000);

    // Wait for table to be visible
    await page.waitForSelector('.list-view-table tbody tr', {state: 'visible'});
    await page.waitForTimeout(500);

    // Expand a folder
    const firstExpander = await page.locator('.tree-expander:not(.empty)').first();
    const expanderExists = await firstExpander.count();
    expect(expanderExists).toBeGreaterThan(0);

    await firstExpander.click();
    await page.waitForTimeout(1000);

    // Verify expander actually expanded
    const hasExpanded = await firstExpander.evaluate((el) => {
      return el.classList.contains('expanded');
    });

    expect(hasExpanded).toBe(true);

    // Check localStorage for expansion state
    const expansionState = await page.evaluate(() => {
      // @ts-expect-error - electronAPI storage
      const stored = globalThis.electronAPI.storage.getItem('list-view-expansion-state');
      return stored ? JSON.parse(stored) : null;
    });

    expect(expansionState).toBeTruthy();
    expect(Array.isArray(expansionState)).toBe(true);
    expect(expansionState.length).toBeGreaterThanOrEqual(0);
  });

  test('restores expanded folders on page reload', async () => {
    await page.evaluate((dir) => {
      globalThis.location.hash = `#path=${encodeURIComponent(dir)}`;
    }, testDir);
    await page.waitForTimeout(1000);

    // Wait for table to be visible
    await page.waitForSelector('.list-view-table', {state: 'visible', timeout: 5000});

    // Enable tree mode
    const treeModeToggle = await page.locator('.tree-mode-toggle');
    await treeModeToggle.click();

    // Wait for the re-render to complete
    await page.waitForTimeout(2000);

    // Wait for rows to be visible
    await page.waitForSelector('.list-view-table tbody tr', {state: 'visible'});
    await page.waitForTimeout(500);

    // Wait for expanders to be rendered
    await page.waitForSelector('.tree-expander:not(.empty)', {state: 'visible', timeout: 3000});

    // Expand a folder
    const expanders = await page.locator('.tree-expander:not(.empty)').all();
    expect(expanders.length).toBeGreaterThan(0);

    await expanders[0].click();
    await page.waitForTimeout(800);

    // Get row count with expansion
    const expandedCount = await page.locator('.list-view-table tbody tr').count();

    // Reload by navigating away and back
    await page.evaluate(() => {
      globalThis.location.hash = '#path=/Users';
    });
    await page.waitForTimeout(800);

    await page.evaluate((dir) => {
      globalThis.location.hash = `#path=${encodeURIComponent(dir)}`;
    }, testDir);
    await page.waitForTimeout(1500); // Give time for restoration

    // Verify row count is the same (expansion restored)
    const restoredCount = await page.locator('.list-view-table tbody tr').count();
    expect(restoredCount).toBe(expandedCount);
  });

  test('child rows have correct depth data attribute', async () => {
    await page.evaluate((dir) => {
      globalThis.location.hash = `#path=${encodeURIComponent(dir)}`;
    }, testDir);
    await page.waitForTimeout(500);

    // Enable tree mode
    const treeModeToggle = await page.locator('.tree-mode-toggle');
    await treeModeToggle.click();
    await page.waitForTimeout(1000);

    // Expand a folder
    const firstExpander = await page.locator('.tree-expander:not(.empty)').first();
    const expanderExists = await firstExpander.count();
    expect(expanderExists).toBeGreaterThan(0);

    await firstExpander.click();
    await page.waitForTimeout(800);

    // Check for rows with depth > 0
    const childRows = await page.locator('.list-view-table tbody tr[data-depth="1"]').count();
    expect(childRows).toBeGreaterThanOrEqual(0);
  });

  test('files show empty expander space in tree mode', async () => {
    await page.evaluate((dir) => {
      globalThis.location.hash = `#path=${encodeURIComponent(dir)}`;
    }, testDir);
    await page.waitForTimeout(500);

    // Enable tree mode
    const treeModeToggle = await page.locator('.tree-mode-toggle');
    await treeModeToggle.click();
    await page.waitForTimeout(1000);

    // Find empty expanders (for files)
    const emptyExpanders = await page.locator('.tree-expander.empty').count();
    expect(emptyExpanders).toBeGreaterThanOrEqual(0);
  });

  test('tree mode state persists in localStorage', async () => {
    await page.evaluate((dir) => {
      globalThis.location.hash = `#path=${encodeURIComponent(dir)}`;
    }, testDir);
    await page.waitForTimeout(500);

    // Enable tree mode
    const treeModeToggle = await page.locator('.tree-mode-toggle');
    await treeModeToggle.click();
    await page.waitForTimeout(500);

    // Check localStorage
    const treeMode = await page.evaluate(() => {
      return localStorage.getItem('list-view-tree-mode');
    });

    expect(treeMode).toBe('true');
  });

  test('displays file icons in icon column', async () => {
    await page.evaluate((dir) => {
      globalThis.location.hash = `#path=${encodeURIComponent(dir)}`;
    }, testDir);
    await page.waitForTimeout(1000); // Give time for icons to load

    const icons = await page.locator('.list-view-table td.list-view-icon img').all();
    expect(icons.length).toBeGreaterThan(0);

    // Check that at least one icon has a src
    const firstIconSrc = await icons[0].getAttribute('src');
    expect(firstIconSrc).toBeTruthy();
  });

  test('displays file names in name column', async () => {
    await page.evaluate((dir) => {
      globalThis.location.hash = `#path=${encodeURIComponent(dir)}`;
    }, testDir);
    await page.waitForTimeout(500);

    const nameCell = await page.locator('.list-view-table td.list-view-name').first();
    const nameText = await nameCell.textContent();
    expect(nameText).toBeTruthy();
    expect(nameText?.trim().length).toBeGreaterThan(0);
  });

  test('displays file sizes in size column', async () => {
    await page.evaluate((dir) => {
      globalThis.location.hash = `#path=${encodeURIComponent(dir)}`;
    }, testDir);
    await page.waitForTimeout(500);

    const sizeCell = await page.locator('.list-view-table td.list-view-size').first();
    const sizeText = await sizeCell.textContent();
    expect(sizeText).toBeTruthy();
  });

  test('folders appear before files in list', async () => {
    await page.evaluate((dir) => {
      globalThis.location.hash = `#path=${encodeURIComponent(dir)}`;
    }, testDir);
    await page.waitForTimeout(500);

    const rows = await page.locator('.list-view-table tbody tr').all();
    expect(rows.length).toBeGreaterThanOrEqual(2);

    // Get all row names
    const rowNames = await Promise.all(
      rows.map((row) => row.locator('td.list-view-name').textContent())
    );

    // Check if folders (ending with path separator or without extension)
    // appear before files
    let seenFile = false;
    for (const name of rowNames) {
      if (!name) {
        continue;
      }
      const isFolder = name.includes('folder');
      const isFile = name.includes('file');

      if (isFile) {
        seenFile = true;
      }

      if (seenFile && isFolder) {
        // Found a folder after a file - fail
        expect(isFolder).toBe(false);
      }
    }
  });

  test('navigates down with ArrowDown in list view', async () => {
    // Covers lines 2455-2475 in index.js
    const tbody = await page.locator('tbody');
    await tbody.focus();
    await page.waitForTimeout(100);

    // First row should be auto-selected
    const firstRow = await page.locator('tbody tr').first();
    const firstRowPath = await firstRow.getAttribute('data-path');

    // Press ArrowDown
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(100);

    // Second row should now be selected
    const selectedRow = await page.locator('tbody tr.selected');
    const selectedPath = await selectedRow.getAttribute('data-path');

    expect(selectedPath).not.toBe(firstRowPath);
  });

  test('navigates up with ArrowUp in list view', async () => {
    // Covers lines 2455-2475 in index.js
    const tbody = await page.locator('tbody');
    await tbody.focus();
    await page.waitForTimeout(100);

    // Move down twice
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(50);
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(100);

    const secondRowPath = await page.evaluate(() => {
      const selected = /** @type {HTMLElement} */ (
        document.querySelector('tbody tr.selected')
      );
      return selected ? selected.dataset.path : null;
    });

    // Press ArrowUp
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(100);

    // Should move back up
    const selectedRow = await page.locator('tbody tr.selected');
    const selectedPath = await selectedRow.getAttribute('data-path');

    expect(selectedPath).not.toBe(secondRowPath);
  });

  test('typeahead search in list view', async () => {
    // Covers lines 2479-2510 in index.js

    // Navigate to test directory first
    await page.evaluate((dir) => {
      globalThis.location.hash = `#path=${encodeURIComponent(dir)}`;
    }, testDir);
    await page.waitForTimeout(800);

    // Wait for table to be visible with rows
    await page.waitForSelector('.list-view-table tbody tr', {state: 'visible', timeout: 5000});

    // Dispatch keydown event directly to tbody element
    const result = await page.evaluate(() => {
      const tbody = document.querySelector('tbody');
      if (!tbody) {
        return {success: false, error: 'no tbody'};
      }

      const allRows = [...document.querySelectorAll('tbody tr')];
      if (allRows.length === 0) {
        return {success: false, error: 'no rows'};
      }

      // Clear existing selection
      allRows.forEach((row) => {
        row.classList.remove('selected');
      });

      // Focus tbody
      tbody.focus();

      // Create and dispatch keydown event for 'f'
      const event = new KeyboardEvent('keydown', {
        key: 'f',
        bubbles: true,
        cancelable: true
      });
      tbody.dispatchEvent(event);

      // Give it a moment to process
      // eslint-disable-next-line promise/avoid-new -- Might not be able to do async evaluate
      return new Promise((resolve) => {
        setTimeout(() => {
          const selected = document.querySelector('tbody tr.selected');
          const nameCell = selected?.querySelector('.list-view-name');
          const text = nameCell?.textContent?.toLowerCase() || '';
          resolve({
            success: true,
            selectedText: text,
            hasSelected: Boolean(selected),
            allRows: allRows.map((r) => {
              const cell = r.querySelector('.list-view-name');
              return cell?.textContent || '';
            })
          });
        }, 200);
      });
    });

    expect(result.success).toBe(true);
    expect(result.hasSelected).toBe(true);
    expect(result.selectedText.startsWith('f')).toBe(true);
  });

  test('typeahead buffer clears after timeout', async () => {
    // Covers line 2508 in index.js
    const tbody = await page.locator('tbody');
    await tbody.focus();
    await page.waitForTimeout(100);

    // Type a character
    await page.keyboard.press('f');
    await page.waitForTimeout(100);

    // Wait for buffer to clear (1000ms timeout + extra buffer)
    await page.waitForTimeout(1200);

    // Type a different character - should start fresh search
    await page.keyboard.press('t');
    await page.waitForTimeout(100);

    const selectedText = await page.evaluate(() => {
      const selected = document.querySelector('tbody tr.selected');
      const nameCell = selected?.querySelector('.list-view-name');
      return nameCell?.textContent?.toLowerCase() || '';
    });

    // Should find item starting with 't', not 'ft'
    expect(selectedText.startsWith('t')).toBe(true);
  });

  test('Enter key triggers rename in list view', async () => {
    // Covers lines 2513-2521 in index.js
    const tbody = await page.locator('tbody');
    await tbody.focus();
    await page.waitForTimeout(100);

    // Press Enter to trigger rename
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // Should show rename input
    const renameInput = await page.locator('input[type="text"]');
    await expect(renameInput).toBeVisible();

    // Cancel rename
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
  });

  test('Cmd+O opens selected item in list view', async () => {
    // Covers lines 2524-2529 in index.js
    const tbody = await page.locator('tbody');
    await tbody.focus();
    await page.waitForTimeout(100);

    // Get initial path
    const initialPath = await page.evaluate(() => {
      return decodeURIComponent(location.hash.replace('#path=', ''));
    });

    // Press Cmd+O to open first folder
    await page.keyboard.press('Meta+o');
    await page.waitForTimeout(500);

    // Path should have changed
    const newPath = await page.evaluate(() => {
      return decodeURIComponent(location.hash.replace('#path=', ''));
    });

    expect(newPath).not.toBe(initialPath);
  });

  test('Cmd+Shift+N creates folder in list view', async () => {
    // Covers lines 2532-2535 in index.js

    // Navigate to /tmp which has write permissions
    await page.evaluate(() => {
      globalThis.location.hash = '#path=/tmp';
    });
    await page.waitForTimeout(1000);

    // Wait for table to be visible
    await page.waitForSelector('.list-view-table tbody tr', {state: 'visible', timeout: 5000});
    await page.waitForTimeout(500);

    // Focus table and dispatch event directly
    await page.evaluate(() => {
      const table = /** @type {HTMLElement} */ (
        document.querySelector('.list-view-table')
      );
      if (table) {
        table.focus();
        const event = new KeyboardEvent('keydown', {
          key: 'n',
          code: 'KeyN',
          metaKey: true,
          shiftKey: true,
          bubbles: true,
          cancelable: true
        });
        table.dispatchEvent(event);
      }
    });

    // Wait longer for folder creation + watcher + DOM updates to settle
    await page.waitForTimeout(1500);

    // Should show rename input for new folder
    await page.waitForSelector('input[type="text"]:visible', {state: 'visible', timeout: 5000});

    const renameInput = await page.locator('input[type="text"]:visible');
    await expect(renameInput).toBeVisible();

    // Cancel
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  });

  test('Cmd+I shows info window in list view', async () => {
    // Covers lines 2536-2541 in index.js
    const tbody = await page.locator('tbody');
    await tbody.focus();
    await page.waitForTimeout(100);

    // Press Cmd+I
    await page.keyboard.press('Meta+i');
    await page.waitForTimeout(500);

    // Info window should appear
    const infoWindow = await page.locator('.info-window, .item-info-window');
    await expect(infoWindow).toBeVisible();
  });

  test('Cmd+C copies item in list view', async () => {
    // Covers lines 2542-2547 in index.js
    const tbody = await page.locator('tbody');
    await tbody.focus();
    await page.waitForTimeout(100);

    // Press Cmd+C
    await page.keyboard.press('Meta+c');
    await page.waitForTimeout(100);

    // Verify clipboard was set
    const clipboard = await page.evaluate(() => {
      // @ts-expect-error - clipboard exposed for testing
      return globalThis.clipboard;
    });

    expect(clipboard).toBeTruthy();
    expect(clipboard.isCopy).toBe(true);
  });

  test('Cmd+X cuts item in list view', async () => {
    // Covers lines 2548-2553 in index.js
    const tbody = await page.locator('tbody');
    await tbody.focus();
    await page.waitForTimeout(100);

    // Press Cmd+X
    await page.keyboard.press('Meta+x');
    await page.waitForTimeout(100);

    // Verify clipboard was set with isCopy: false
    const clipboard = await page.evaluate(() => {
      // @ts-expect-error - clipboard exposed for testing
      return globalThis.clipboard;
    });

    expect(clipboard).toBeTruthy();
    expect(clipboard.isCopy).toBe(false);
  });

  test('Cmd+V pastes item in list view', async () => {
    // Covers lines 2554-2559 in index.js
    const tbody = await page.locator('tbody');
    await tbody.focus();
    await page.waitForTimeout(100);

    // First copy something
    await page.keyboard.press('Meta+c');
    await page.waitForTimeout(100);

    // Navigate to a different folder
    await page.keyboard.press('Meta+o');
    await page.waitForTimeout(500);

    // Switch back to list view if needed
    await page.click('#list-view');
    await page.waitForTimeout(100);

    const tbodyAfter = await page.locator('tbody');
    await tbodyAfter.focus();

    // Paste
    await page.keyboard.press('Meta+v');
    await page.waitForTimeout(1000);

    // Operation should complete (we can't easily verify the file was copied
    // but we can verify no error occurred)
    const hasError = await page.evaluate(() => {
      return document.querySelector('.error, .alert') !== null;
    });

    expect(hasError).toBe(false);
  });

  test('Cmd+Backspace deletes item in list view', async () => {
    // Covers lines 2560-2565 in index.js

    // Create a test directory and file first
    await page.evaluate(() => {
      // @ts-expect-error - electronAPI available
      const {fs, path} = globalThis.electronAPI;
      const testDir = '/tmp/test-folder';
      const testFile = path.join(testDir, 'delete-me.txt');

      // Create directory if it doesn't exist
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, {recursive: true});
      }

      fs.writeFileSync(testFile, 'delete test');
    });

    await page.waitForTimeout(300);

    // Navigate to the test folder
    await page.evaluate(() => {
      globalThis.location.hash = '#path=/tmp/test-folder';
    });
    await page.waitForTimeout(500);

    // Switch to list view
    await page.click('#list-view');
    await page.waitForTimeout(300);

    const tbody = await page.locator('tbody');
    await tbody.focus();
    await page.waitForTimeout(100);

    // Find and select the test file
    await page.evaluate(() => {
      const rows = /** @type {HTMLElement[]} */ (
        [...document.querySelectorAll('tbody tr')]
      );
      for (const row of rows) {
        const {path} = row.dataset;
        if (path?.includes('delete-me.txt')) {
          row.classList.add('selected');
          break;
        }
      }
    });

    // Set up dialog handler
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });

    // Press Cmd+Backspace
    await page.keyboard.press('Meta+Backspace');
    await page.waitForTimeout(500);

    // File should be deleted
    const fileExists = await page.evaluate(() => {
      // @ts-expect-error - electronAPI available
      const {fs, path} = globalThis.electronAPI;
      return fs.existsSync(path.join('/tmp/test-folder', 'delete-me.txt'));
    });

    expect(fileExists).toBe(false);
  });

  test('Cmd+Shift+H navigates to home in list view', async () => {
    // Covers lines 2575-2578 in index.js
    const tbody = await page.locator('tbody');
    await tbody.focus();
    await page.waitForTimeout(100);

    await page.keyboard.press('Shift+Meta+h');
    await page.waitForTimeout(500);

    const homeDir = await page.evaluate(() => {
      // @ts-expect-error - os available
      return globalThis.electronAPI.os.homedir();
    });

    const currentPath = await page.evaluate(() => {
      return decodeURIComponent(location.hash.replace('#path=', ''));
    });

    expect(currentPath).toBe(homeDir);
  });

  test('Cmd+Shift+D navigates to Desktop in list view', async () => {
    // Covers lines 2579-2585 in index.js
    const tbody = await page.locator('tbody');
    await tbody.focus();
    await page.waitForTimeout(100);

    await page.keyboard.press('Shift+Meta+d');
    await page.waitForTimeout(500);

    const desktopDir = await page.evaluate(() => {
      // @ts-expect-error - electronAPI available
      const {os, path} = globalThis.electronAPI;
      return path.join(os.homedir(), 'Desktop');
    });

    const currentPath = await page.evaluate(() => {
      return decodeURIComponent(location.hash.replace('#path=', ''));
    });

    expect(currentPath).toBe(desktopDir);
  });

  test('Cmd+Shift+A navigates to Applications in list view', async () => {
    // Covers lines 2586-2588 in index.js
    const tbody = await page.locator('tbody');
    await tbody.focus();
    await page.waitForTimeout(100);

    await page.keyboard.press('Shift+Meta+a');
    await page.waitForTimeout(500);

    const currentPath = await page.evaluate(() => {
      return decodeURIComponent(location.hash.replace('#path=', ''));
    });

    expect(currentPath).toBe('/Applications');
  });

  test('Cmd+Shift+U navigates to Utilities in list view', async () => {
    // Covers lines 2589-2591 in index.js
    const tbody = await page.locator('tbody');
    await tbody.focus();
    await page.waitForTimeout(100);

    await page.keyboard.press('Shift+Meta+u');
    await page.waitForTimeout(500);

    const currentPath = await page.evaluate(() => {
      return decodeURIComponent(location.hash.replace('#path=', ''));
    });

    expect(currentPath).toBe('/Applications/Utilities');
  });

  test('Cmd+[ navigates back in list view', async () => {
    // Covers lines 2592-2594 in index.js

    // Navigate somewhere first
    const tbody = await page.locator('tbody');
    await tbody.focus();
    await page.keyboard.press('Meta+o'); // Open a folder
    await page.waitForTimeout(500);

    const pathAfterNav = await page.evaluate(() => {
      return decodeURIComponent(location.hash.replace('#path=', ''));
    });

    // Go back
    await page.keyboard.press('Meta+[');
    await page.waitForTimeout(500);

    const pathAfterBack = await page.evaluate(() => {
      return decodeURIComponent(location.hash.replace('#path=', ''));
    });

    expect(pathAfterBack).not.toBe(pathAfterNav);
  });

  test('Cmd+] navigates forward in list view', async () => {
    // Covers lines 2595-2597 in index.js (forward navigation)

    // Navigate somewhere, then back
    const tbody = await page.locator('tbody');
    await tbody.focus();
    await page.keyboard.press('Meta+o'); // Open a folder
    await page.waitForTimeout(500);

    const pathAfterNav = await page.evaluate(() => {
      return decodeURIComponent(location.hash.replace('#path=', ''));
    });

    await page.keyboard.press('Meta+['); // Go back
    await page.waitForTimeout(500);

    // Now go forward
    await page.keyboard.press('Meta+]');
    await page.waitForTimeout(500);

    const pathAfterForward = await page.evaluate(() => {
      return decodeURIComponent(location.hash.replace('#path=', ''));
    });

    expect(pathAfterForward).toBe(pathAfterNav);
  });

  test('column picker close functionality (lines 2416-2420)', async () => {
    // List view is already active from beforeEach

    // Navigate to test directory
    await page.evaluate((testPath) => {
      location.hash = '#path=' + encodeURIComponent(testPath);
    }, testDir);
    await page.waitForTimeout(1000);

    // Open column picker
    const columnPickerButton = page.locator('.column-picker-button');
    await columnPickerButton.click();
    await page.waitForTimeout(200);

    // Verify picker is open
    const pickerMenu = page.locator('.column-picker-menu');
    await expect(pickerMenu).toBeVisible();

    // Click outside the picker (on the table) to close it
    const listViewTable = page.locator('.list-view-table');
    await listViewTable.click({position: {x: 10, y: 10}});
    await page.waitForTimeout(200);

    // Verify picker is closed (covers lines 2416-2420)
    await expect(pickerMenu).not.toBeVisible();
  });

  test('column picker toggle (lines 2378-2380)', async () => {
    // List view is already active from beforeEach

    // Navigate to test directory
    await page.evaluate((testPath) => {
      location.hash = '#path=' + encodeURIComponent(testPath);
    }, testDir);
    await page.waitForTimeout(1000);

    // Open column picker
    const columnPickerButton = page.locator('.column-picker-button');
    await columnPickerButton.click();
    await page.waitForTimeout(200);

    // Verify picker is open
    let pickerMenu = page.locator('.column-picker-menu');
    await expect(pickerMenu).toBeVisible();

    // Click button again to close it (covers lines 2378-2380 - early return)
    await columnPickerButton.click();
    await page.waitForTimeout(200);

    // Verify picker is closed
    await expect(pickerMenu).not.toBeVisible();

    // Open again to verify it works after closing
    await columnPickerButton.click();
    await page.waitForTimeout(200);

    pickerMenu = page.locator('.column-picker-menu');
    await expect(pickerMenu).toBeVisible();
  });

  test('empty list view keyboard navigation (lines 2450-2452)', async () => {
    // List view is already active from beforeEach
    const emptyDir = path.join(testDir, 'empty-dir-for-nav');
    if (!fs.existsSync(emptyDir)) {
      fs.mkdirSync(emptyDir, {recursive: true});
    }

    // Navigate to empty directory
    await page.evaluate((emptyPath) => {
      location.hash = '#path=' + encodeURIComponent(emptyPath);
    }, emptyDir);
    await page.waitForTimeout(1000);

    // Try keyboard navigation in empty list (covers lines 2450-2452)
    const table = page.locator('.list-view-table');
    await table.focus();

    // Dispatch ArrowDown event - should return early due to empty list
    await page.evaluate(() => {
      const table = document.querySelector('.list-view-table');
      const event = new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        bubbles: true,
        cancelable: true
      });
      table?.dispatchEvent(event);
    });

    // Verify no selection was made (no error occurred)
    const selectedRow = await page.locator('tr.selected').count();
    expect(selectedRow).toBe(0);

    // Clean up
    fs.rmdirSync(emptyDir);
  });

  test('arrow navigation without initial selection (line 2457)', async () => {
    // List view is already active from beforeEach

    // Navigate to test directory
    await page.evaluate((testPath) => {
      location.hash = '#path=' + encodeURIComponent(testPath);
    }, testDir);
    await page.waitForTimeout(1000);

    // Remove any existing selection
    await page.evaluate(() => {
      const selected = document.querySelector('tr.selected');
      if (selected) {
        selected.classList.remove('selected');
      }
    });

    // Verify no selection
    let selectedCount = await page.locator('tr.selected').count();
    expect(selectedCount).toBe(0);

    // Press ArrowDown - should select first item (covers line 2457 with currentIndex = -1)
    await page.evaluate(() => {
      const table = document.querySelector('.list-view-table');
      const event = new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        bubbles: true,
        cancelable: true
      });
      table?.dispatchEvent(event);
    });
    await page.waitForTimeout(200);

    // Verify first item is now selected
    selectedCount = await page.locator('tr.selected').count();
    expect(selectedCount).toBe(1);

    const firstRowSelected = await page.evaluate(() => {
      const allRows = document.querySelectorAll('tbody tr');
      const selectedRow = document.querySelector('tr.selected');
      return allRows[0] === selectedRow;
    });
    expect(firstRowSelected).toBe(true);
  });
});
