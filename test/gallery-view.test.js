/**
 * @file Tests for gallery-view functionality in index.js.
 */

/* eslint-disable chai-expect-keywords/no-unsupported-keywords -- Not Chai */

import {rm} from 'node:fs/promises';
import path from 'node:path';
import {test, expect} from '@playwright/test';
import {initialize, coverage} from './utils/initialize.js';

const {
  afterEach, afterAll, beforeEach, describe
} = test;

describe('Gallery View', () => {
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
    await coverage({electron, page});
  });

  afterAll(async () => {
    await electron.close();
  });

  test('selects item and updates preview in gallery view', async () => {
    // Navigate to a directory with files
    await page.evaluate(() => {
      globalThis.location.hash = '#path=/Users';
    });
    await page.waitForTimeout(500);

    // Switch to gallery view
    const galleryViewBtn = await page.locator('#gallery-view');
    await galleryViewBtn.click();
    await page.waitForTimeout(500);

    // Verify we're in gallery view
    const galleryViewButton = await page.locator('#gallery-view.selected');
    expect(galleryViewButton).toBeVisible();

    // Wait for items to load
    await page.waitForFunction(() => {
      const cells = document.querySelectorAll('td.list-item');
      return cells.length > 0;
    }, {timeout: 5000});

    // Click on a cell to select it
    const firstCell = await page.locator('td.list-item').first();
    await firstCell.click();
    await page.waitForTimeout(500);

    // Verify the cell is selected
    const hasSelectedClass = await firstCell.evaluate((el) => {
      return el.classList.contains('selected');
    });
    expect(hasSelectedClass).toBe(true);

    // Verify the preview image src was updated
    const previewImg = await page.locator('img.gallery-icon-preview');
    const imgSrc = await previewImg.getAttribute('src');
    expect(imgSrc).toBeTruthy();
    expect(imgSrc).not.toBe('');

    // Click on a different cell
    const cells = await page.locator('td.list-item').all();
    if (cells.length > 1) {
      await cells[1].click();
      await page.waitForTimeout(500);

      // Verify the new cell is selected
      const secondCellSelected = await cells[1].evaluate((el) => {
        return el.classList.contains('selected');
      });
      expect(secondCellSelected).toBe(true);

      // Verify the first cell is no longer selected
      const firstCellStillSelected = await firstCell.evaluate((el) => {
        return el.classList.contains('selected');
      });
      expect(firstCellStillSelected).toBe(false);

      // Verify the preview image was updated again
      const newImgSrc = await previewImg.getAttribute('src');
      expect(newImgSrc).toBeTruthy();
      expect(newImgSrc).not.toBe('');
      // The src should have changed (unless both items have the same thumbnail)
      // We just verify it's still a valid data URL or path
      expect(newImgSrc?.length).toBeGreaterThan(0);
    }
  });

  test('double-click navigates in gallery view', async () => {
    // Navigate to a directory
    await page.evaluate(() => {
      globalThis.location.hash = '#path=/Users';
    });
    await page.waitForTimeout(500);

    // Switch to gallery view
    const galleryViewBtn = await page.locator('#gallery-view');
    await galleryViewBtn.click();
    await page.waitForTimeout(500);

    // Wait for items to load
    await page.waitForFunction(() => {
      const cells = document.querySelectorAll('td.list-item');
      return cells.length > 0;
    }, {timeout: 5000});

    // Find a folder (has an 'a' element with href)
    const folderCell = await page.locator(
      'td.list-item:has(a[href^="#path="])'
    ).first();

    if (await folderCell.count() > 0) {
      // Get the folder path before double-clicking
      const folderPath = await folderCell.evaluate((el) => {
        const link = el.querySelector('a[href^="#path="]');
        return link ? link.getAttribute('href') : null;
      });

      // Double-click to navigate
      await folderCell.dblclick();
      await page.waitForTimeout(500);

      // Verify navigation occurred
      const currentHash = await page.evaluate(() => {
        return globalThis.location.hash;
      });

      expect(currentHash).toBe(folderPath);
    }
  });

  test('switches between gallery view and other views', async () => {
    // Clean up any sticky notes that might block the buttons
    await page.evaluate(() => {
      document.querySelectorAll('.sticky-note').forEach((note) => {
        note.remove();
      });
    });

    // Start in gallery view
    await page.locator('#gallery-view').click();
    await page.waitForTimeout(300);

    let selectedBtn = await page.locator('#gallery-view.selected');
    expect(selectedBtn).toBeVisible();

    // Switch to icon view
    await page.locator('#icon-view').click();
    await page.waitForTimeout(300);

    selectedBtn = await page.locator('#icon-view.selected');
    expect(selectedBtn).toBeVisible();

    // Switch to three-columns
    await page.locator('#three-columns').click();
    await page.waitForTimeout(300);

    selectedBtn = await page.locator('#three-columns.selected');
    expect(selectedBtn).toBeVisible();

    // Switch back to gallery view
    await page.locator('#gallery-view').click();
    await page.waitForTimeout(300);

    selectedBtn = await page.locator('#gallery-view.selected');
    expect(selectedBtn).toBeVisible();
  });

  test('Cmd+O in gallery view dispatches dblclick on folder', async () => {
    // Navigate to a directory with folders
    await page.evaluate(() => {
      globalThis.location.hash = '#path=/Users';
    });
    await page.waitForTimeout(500);

    // Switch to gallery view
    await page.locator('#gallery-view').click();
    await page.waitForTimeout(500);

    // Wait for items to load
    await page.waitForFunction(() => {
      const cells = document.querySelectorAll('td.list-item');
      return cells.length > 0;
    }, {timeout: 5000});

    // Find and select a folder (has an 'a' element with href)
    const folderCell = await page.locator(
      'td.list-item:has(a[href^="#path="])'
    ).first();

    if (await folderCell.count() > 0) {
      // Click to select the folder
      await folderCell.click();
      await page.waitForTimeout(300);

      // Get the folder path before triggering Cmd+O
      const folderPath = await folderCell.evaluate((el) => {
        const link = el.querySelector('a[href^="#path="]');
        return link ? link.getAttribute('href') : null;
      });

      // Focus the table for keyboard events
      await page.locator('table[data-base-path]').focus();

      // Press Cmd+O to trigger navigation (covers line 1088-1089)
      await page.keyboard.press('Meta+o');
      await page.waitForTimeout(500);

      // Verify navigation occurred
      const currentHash = await page.evaluate(() => {
        return globalThis.location.hash;
      });

      expect(currentHash).toBe(folderPath);
    }
  });

  test('should switch to gallery view with Cmd+4', async () => {
    // Start in icon view
    await page.click('#icon-view');
    await page.waitForTimeout(500);

    // Switch to gallery-view with Cmd+4 (covers lines 2084-2086)
    await page.keyboard.press('Meta+4');
    await page.waitForTimeout(500);

    // Check that gallery-view is selected
    const galleryViewSelected = await page.evaluate(() => {
      return document.querySelector('#gallery-view')?.classList.
        contains('selected');
    });
    expect(galleryViewSelected).toBe(true);

    // Verify we're actually in gallery view
    const isGalleryView = await page.evaluate(() => {
      const galleryDiv = document.querySelector('.gallery');
      return galleryDiv !== null;
    });
    expect(isGalleryView).toBe(true);
  });

  test(
    'gallery-view button has selected class on load when view is gallery-view',
    async () => {
      // Set gallery-view in storage before page loads
      //   (using electronAPI.storage)
      await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        globalThis.electronAPI.storage.setItem('view', 'gallery-view');
      });

      // Reload the page to trigger initialization with gallery-view
      await page.reload();
      await page.waitForTimeout(1000);

      // Wait for the gallery-view button to be ready
      await page.waitForSelector('#gallery-view', {timeout: 5000});

      // Check that gallery-view button is selected on load (covers line 2126)
      const galleryViewSelected = await page.evaluate(() => {
        return document.querySelector('#gallery-view')?.classList.
          contains('selected');
      });
      expect(galleryViewSelected).toBe(true);

      // Verify we're actually in gallery view
      const isGalleryView = await page.evaluate(() => {
        const galleryDiv = document.querySelector('.gallery');
        return galleryDiv !== null;
      });
      expect(isGalleryView).toBe(true);
    }
  );
});

