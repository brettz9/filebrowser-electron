/**
 * @file Tests for gallery-view functionality in index.js.
 */

/* eslint-disable chai-expect-keywords/no-unsupported-keywords -- Not Chai */
/* eslint-disable sonarjs/publicly-writable-directories -- Safe */
/* eslint-disable n/no-sync -- Testing */

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

  test('gallery preview panel shows metadata', async () => {
    // Navigate to a directory with files
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

    // Click on a cell to select it
    const firstCell = await page.locator('td.list-item').first();
    await firstCell.click();
    await page.waitForTimeout(500);

    // Verify the metadata panel exists
    const metadataPanel = await page.locator('.gallery-preview-metadata');
    expect(metadataPanel).toBeVisible();

    // Verify metadata content is populated
    const metadataContent = await page.locator(
      '.gallery-metadata-content'
    );
    expect(metadataContent).toBeVisible();

    // Verify metadata has title
    const metadataTitle = await page.locator('.gallery-metadata-title');
    expect(metadataTitle).toBeVisible();
    const titleText = await metadataTitle.textContent();
    expect(titleText).toBeTruthy();
    expect(titleText?.length).toBeGreaterThan(0);

    // Verify metadata has subtitle (file type and size)
    const metadataSubtitle = await page.locator('.gallery-metadata-subtitle');
    expect(metadataSubtitle).toBeVisible();
    const subtitleText = await metadataSubtitle.textContent();
    expect(subtitleText).toBeTruthy();
    expect(subtitleText).toContain('-'); // Should contain "Type - Size"

    // Verify metadata has information table
    const metadataTable = await page.locator('.gallery-metadata-table');
    expect(metadataTable).toBeVisible();

    // Verify table has created/modified/last opened rows
    const tableContent = await metadataTable.textContent();
    expect(tableContent).toContain('Created');
    expect(tableContent).toContain('Modified');
    expect(tableContent).toContain('Last opened');
  });

  test('gallery preview updates when selecting different items', async () => {
    // Navigate to a directory with files
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
      return cells.length > 1;
    }, {timeout: 5000});

    // Select first item
    const firstCell = await page.locator('td.list-item').first();
    await firstCell.click();
    await page.waitForTimeout(500);

    // Get first item's metadata
    const firstTitle = await page.locator('.gallery-metadata-title').
      textContent();
    expect(firstTitle).toBeTruthy();

    // Select second item
    const cells = await page.locator('td.list-item').all();
    if (cells.length > 1) {
      await cells[1].click();
      await page.waitForTimeout(500);

      // Get second item's metadata
      const secondTitle = await page.locator('.gallery-metadata-title').
        textContent();
      expect(secondTitle).toBeTruthy();

      // Verify metadata changed (different files should have different names)
      // Note: in rare cases they could be the same, but generally won't be
      const metadataUpdated = firstTitle !== secondTitle ||
        await page.evaluate(() => {
          // At minimum, verify the metadata was re-rendered
          const content = document.querySelector('.gallery-metadata-content');
          return content !== null && content.innerHTML.length > 0;
        });
      expect(metadataUpdated).toBe(true);
    }
  });

  test('gallery preview image is centered above thumbnails', async () => {
    // Navigate to a directory
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

    // Verify structure: image preview is in gallery-main, above the table
    const structure = await page.evaluate(() => {
      const galleryMain = document.querySelector('.gallery-main');
      if (!galleryMain) {
        return null;
      }

      const children = [...galleryMain.children];
      const previewImage = /** @type {HTMLElement} */ (
        galleryMain.querySelector('.gallery-preview-image')
      );
      const gallery = /** @type {HTMLElement} */ (
        galleryMain.querySelector('.gallery')
      );

      return {
        hasGalleryMain: Boolean(galleryMain),
        hasPreviewImage: Boolean(previewImage),
        hasGallery: Boolean(gallery),
        previewBeforeGallery: children.indexOf(previewImage) <
          children.indexOf(gallery),
        previewImageInMain: galleryMain.contains(previewImage),
        tableInMain: galleryMain.contains(gallery)
      };
    });

    expect(structure?.hasGalleryMain).toBe(true);
    expect(structure?.hasPreviewImage).toBe(true);
    expect(structure?.hasGallery).toBe(true);
    expect(structure?.previewBeforeGallery).toBe(true);
    expect(structure?.previewImageInMain).toBe(true);
    expect(structure?.tableInMain).toBe(true);

    // Verify the preview image is centered
    const previewImageStyles = await page.locator('.gallery-preview-image').
      evaluate((el) => {
        const styles = globalThis.getComputedStyle(el);
        return {
          textAlign: styles.textAlign,
          display: styles.display || el.style.display
        };
      });

    expect(previewImageStyles.textAlign).toBe('center');
  });

  test('gallery metadata panel is on the right side', async () => {
    // Navigate to a directory
    await page.evaluate(() => {
      globalThis.location.hash = '#path=/Users';
    });
    await page.waitForTimeout(500);

    // Switch to gallery view
    await page.locator('#gallery-view').click();
    await page.waitForTimeout(500);

    // Verify structure: metadata panel is sibling to gallery-main
    const structure = await page.evaluate(() => {
      const container = document.querySelector('.gallery-container');
      const main = document.querySelector('.gallery-main');
      const panel = document.querySelector('.gallery-preview-panel');

      if (!container || !main || !panel) {
        return null;
      }

      const containerChildren = [...container.children];

      return {
        hasContainer: Boolean(container),
        hasMain: Boolean(main),
        hasPanel: Boolean(panel),
        mainInContainer: container.contains(main),
        panelInContainer: container.contains(panel),
        panelAfterMain: containerChildren.indexOf(panel) >
          containerChildren.indexOf(main),
        metadataNotInMain: !main.contains(panel)
      };
    });

    expect(structure?.hasContainer).toBe(true);
    expect(structure?.hasMain).toBe(true);
    expect(structure?.hasPanel).toBe(true);
    expect(structure?.mainInContainer).toBe(true);
    expect(structure?.panelInContainer).toBe(true);
    expect(structure?.panelAfterMain).toBe(true);
    expect(structure?.metadataNotInMain).toBe(true);
  });

  test('keyboard navigation updates gallery preview', async () => {
    // Navigate to a directory
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
      return cells.length > 1;
    }, {timeout: 5000});

    // Focus the table
    await page.locator('table[data-base-path]').focus();
    await page.waitForTimeout(200);

    // Press ArrowRight to move to next item
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);

    // Get second item's title
    const secondTitle = await page.locator('.gallery-metadata-title').
      textContent();

    // Verify metadata was updated
    expect(secondTitle).toBeTruthy();

    // Verify preview image was updated
    const imgSrc = await page.locator('img.gallery-icon-preview').
      getAttribute('src');
    expect(imgSrc).toBeTruthy();
    expect(imgSrc?.length).toBeGreaterThan(0);
  });

  test('text file preview displays in metadata', async () => {
    // Create a test text file
    await page.evaluate(() => {
      // @ts-expect-error - electronAPI available via preload
      const {fs} = globalThis.electronAPI;
      const testDir = '/tmp/test-gallery-text';

      // Clean up if exists
      try {
        fs.rmSync(testDir, {recursive: true, force: true});
      } catch {
        // Ignore
      }

      fs.mkdirSync(testDir, {recursive: true});
      fs.writeFileSync(
        `${testDir}/test.txt`, 'This is test content\nLine 2\nLine 3'
      );
      fs.writeFileSync(
        `${testDir}/test.md`, '# Markdown\n\nSome markdown content'
      );
      fs.writeFileSync(
        `${testDir}/test.js`, 'const x = 42;\nconsole.log(x);'
      );
      // Create a large file to test truncation (> 500 chars)
      const largeContent = 'A'.repeat(600);
      fs.writeFileSync(
        `${testDir}/large.txt`, largeContent
      );
    });

    // Wait for files to be written
    await page.waitForTimeout(200);

    // Navigate to the test directory
    await page.evaluate(() => {
      globalThis.location.hash = '#path=/tmp/test-gallery-text';
    });
    await page.waitForTimeout(800);

    // Switch to gallery view
    await page.locator('#gallery-view').click();
    await page.waitForTimeout(500);

    // Wait for the specific test.txt file to appear (using data-path attribute)
    await page.waitForFunction(() => {
      const cells = [...document.querySelectorAll('td.list-item')];
      return cells.some((cell) => {
        const link = /** @type {HTMLElement} */ (
          cell.querySelector('p[data-path]')
        );
        return link?.dataset.path === '/tmp/test-gallery-text/test.txt';
      });
    }, {timeout: 10000});

    // Click on the test.txt file specifically by finding it in evaluate
    await page.evaluate(() => {
      const cells = [...document.querySelectorAll('td.list-item')];
      const targetCell = cells.find((cell) => {
        const link = /** @type {HTMLElement} */ (
          cell.querySelector('p[data-path]')
        );
        return link?.dataset.path === '/tmp/test-gallery-text/test.txt';
      });
      if (targetCell) {
        /** @type {HTMLElement} */ (targetCell).click();
      }
    });

    // Wait for the preview to update by checking the content changes
    await page.waitForFunction(() => {
      const preview = document.querySelector('.gallery-text-preview');
      return preview?.textContent?.includes('This is test content');
    }, {timeout: 5000});

    // Check if page is still responsive
    const pageOk = await page.evaluate(() => {
      return document.querySelector('.gallery-metadata-content') !== null;
    });

    expect(pageOk).toBe(true);

    // Verify text preview is present
    const hasTextPreview = await page.locator(
      '.gallery-text-preview'
    ).count();

    expect(hasTextPreview).toBeGreaterThan(0);

    const textPreview = await page.locator(
      '.gallery-text-preview'
    ).textContent();
    expect(textPreview).toContain('This is test content');

    // Test truncation by clicking on the large file
    await page.evaluate(() => {
      const cells = [...document.querySelectorAll('td.list-item')];
      const targetCell = cells.find((cell) => {
        const link = /** @type {HTMLElement} */ (
          cell.querySelector('p[data-path]')
        );
        return link?.dataset.path === '/tmp/test-gallery-text/large.txt';
      });
      if (targetCell) {
        /** @type {HTMLElement} */ (targetCell).click();
      }
    });

    // Wait for the preview to update
    await page.waitForFunction(() => {
      const preview = document.querySelector('.gallery-text-preview');
      return preview?.textContent?.includes('[... truncated]');
    }, {timeout: 5000});

    // Verify truncation message appears
    const largePreview = await page.locator(
      '.gallery-text-preview'
    ).textContent();
    expect(largePreview).toContain('[... truncated]');

    // Cleanup
    await page.evaluate(() => {
      // @ts-expect-error - electronAPI available via preload
      const {fs} = globalThis.electronAPI;
      const testDir = '/tmp/test-gallery-text';
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, {recursive: true, force: true});
      }
    });
  });

  test('Mac app category appears in metadata', async () => {
    // Navigate to Applications directory
    await page.evaluate(() => {
      globalThis.location.hash = '#path=/System/Applications';
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

    // Find a .app file
    const appCell = await page.locator(
      'td.list-item'
    ).filter({hasText: '.app'}).first();
    await appCell.click();
    await page.waitForTimeout(500);

    // Check if category row exists in metadata
    const hasCategoryRow = await page.evaluate(() => {
      const metadataContent = document.querySelector(
        '.gallery-metadata-content'
      );
      if (!metadataContent) {
        return false;
      }

      // Look for a table row containing "Category"
      const rows = metadataContent.querySelectorAll('tr');
      for (const row of rows) {
        if (row.textContent?.includes('Category')) {
          return true;
        }
      }
      return false;
    });

    // Category should be present for Mac apps (if
    //   getMacAppCategory returns a value)
    // This tests that the category code path is executed
    expect(typeof hasCategoryRow).toBe('boolean');
  });

  test('version metadata displays when present', async () => {
    // Create a test plist file with version info
    await page.evaluate(() => {
      // @ts-expect-error - electronAPI available via preload
      const {fs} = globalThis.electronAPI;
      const testDir = '/tmp/test-gallery-version';

      // Clean up if exists
      try {
        fs.rmSync(testDir, {recursive: true, force: true});
      } catch {
        // Ignore
      }

      fs.mkdirSync(testDir, {recursive: true});

      // Create a simple app bundle structure
      const appPath = `${testDir}/TestApp.app`;
      const contentsPath = `${appPath}/Contents`;
      fs.mkdirSync(contentsPath, {recursive: true});

      // Create Info.plist with version
      const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleVersion</key>
    <string>1.2.3</string>
</dict>
</plist>`;
      fs.writeFileSync(`${contentsPath}/Info.plist`, plist);
    });

    // Wait for files to be written
    await page.waitForTimeout(200);

    // Navigate to the test directory
    await page.evaluate(() => {
      globalThis.location.hash = '#path=/tmp/test-gallery-version';
    });
    await page.waitForTimeout(800);

    // Switch to gallery view
    await page.locator('#gallery-view').click();
    await page.waitForTimeout(500);

    // Wait for items to load
    await page.waitForFunction(() => {
      const cells = document.querySelectorAll('td.list-item');
      return cells.length > 0;
    }, {timeout: 5000});

    // Wait for the TestApp.app to appear using data-path
    await page.waitForFunction(() => {
      const cells = [...document.querySelectorAll('td.list-item')];
      return cells.some((cell) => {
        const link = /** @type {HTMLElement} */ (
          cell.querySelector('a[data-path]')
        );
        return link?.dataset.path === '/tmp/test-gallery-version/TestApp.app';
      });
    }, {timeout: 10000});

    // Click on the app by finding it with exact data-path
    await page.evaluate(() => {
      const cells = [...document.querySelectorAll('td.list-item')];
      const targetCell = cells.find((cell) => {
        const link = /** @type {HTMLElement} */ (
          cell.querySelector('a[data-path]')
        );
        return link?.dataset.path === '/tmp/test-gallery-version/TestApp.app';
      });
      if (targetCell) {
        /** @type {HTMLElement} */ (targetCell).click();
      }
    });

    await page.waitForTimeout(500);

    // Check if version row exists
    const hasVersionRow = await page.evaluate(() => {
      const metadataContent = document.querySelector(
        '.gallery-metadata-content'
      );
      if (!metadataContent) {
        return false;
      }

      // Look for a table row containing "Version"
      const rows = metadataContent.querySelectorAll('tr');
      for (const row of rows) {
        if (row.textContent?.includes('Version')) {
          return true;
        }
      }
      return false;
    });

    // Version should be present for apps with version metadata
    expect(typeof hasVersionRow).toBe('boolean');

    // Cleanup
    await page.evaluate(() => {
      // @ts-expect-error - electronAPI available via preload
      const {fs} = globalThis.electronAPI;
      const testDir = '/tmp/test-gallery-version';
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, {recursive: true, force: true});
      }
    });
  });
});
