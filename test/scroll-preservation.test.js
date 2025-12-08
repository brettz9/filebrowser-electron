/* eslint-disable chai-expect-keywords/no-unsupported-keywords -- Not Chai */
/* eslint-disable n/no-sync -- Testing */
/* eslint-disable sonarjs/publicly-writable-directories -- Safe usages
    as deleting own files */

import {test, expect} from '@playwright/test';
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
  return await coverage({electron, page});
});

describe('renderer', () => {
  describe('scroll position preservation on refresh', () => {
    test(
      'maintains scroll position when external file changes trigger refresh',
      async () => {
        // Create test directory with many files
        await page.evaluate(() => {
          // @ts-expect-error - electronAPI available via preload
          const {fs, path} = globalThis.electronAPI;
          const testDir = '/tmp/test-scroll-preservation';
          const subdir = path.join(testDir, 'many-files');

          // Clean up if exists
          try {
            fs.rmSync(testDir, {recursive: true});
          } catch (e) {
            // Ignore
          }

          // Create structure with many files
          fs.mkdirSync(testDir);
          fs.mkdirSync(subdir);
          for (let i = 1; i <= 80; i++) {
            fs.writeFileSync(
              path.join(subdir, `file-${String(i).padStart(3, '0')}.txt`),
              `content ${i}`
            );
          }
        });

        // Switch to three columns view
        await page.locator('#three-columns').click();
        await page.waitForTimeout(300);

        // Navigate to the test directory
        await page.evaluate(() => {
          globalThis.location.hash = '#path=/tmp/test-scroll-preservation';
        });
        await page.waitForTimeout(1500);

        // Click on the folder to view its contents
        const folderLink = await page.locator(
          'a[data-path="/tmp/test-scroll-preservation/many-files"]'
        );
        await folderLink.click();
        await page.waitForTimeout(1000);

        // Scroll down in the rightmost column to view files in the middle
        await page.evaluate(() => {
          const columns = [...document.querySelectorAll('.miller-column')];
          const lastColumn = columns.at(-1);
          if (lastColumn) {
            lastColumn.scrollTop = 800; // Scroll down significantly
          }
        });
        await page.waitForTimeout(300);

        // Select a file that's visible in the middle of the viewport
        const file50Link = await page.locator(
          'span[data-path=' +
          '"/tmp/test-scroll-preservation/many-files/file-050.txt"]'
        );
        await file50Link.click();
        await page.waitForTimeout(300);

        // Get the scroll position and item position before refresh
        const beforeState = await page.evaluate(() => {
          const columns = [...document.querySelectorAll('.miller-column')];
          const lastColumn = columns.at(-1);
          const selectedItem = document.querySelector(
            'li.miller-selected'
          );

          if (!lastColumn || !selectedItem) {
            return null;
          }

          const itemRect = selectedItem.getBoundingClientRect();
          const columnRect = lastColumn.getBoundingClientRect();

          return {
            scrollTop: lastColumn.scrollTop,
            itemTop: itemRect.top,
            columnTop: columnRect.top,
            viewportPosition: itemRect.top - columnRect.top
          };
        });

        expect(beforeState).not.toBeNull();

        // Trigger an external file change to cause refresh
        // Delete a file that's before the selected one in the list
        await page.evaluate(() => {
          // @ts-expect-error - electronAPI available via preload
          const {fs, path} = globalThis.electronAPI;
          const folder = '/tmp/test-scroll-preservation/many-files';
          // Delete file-010 (before file-050)
          fs.rmSync(path.join(folder, 'file-010.txt'));
        });

        // Wait for watcher to detect change and trigger refresh
        await page.waitForTimeout(2500);

        // Get the scroll position and item position after refresh
        const afterState = await page.evaluate(() => {
          const columns = [...document.querySelectorAll('.miller-column')];
          const lastColumn = columns.at(-1);
          const selectedItem = document.querySelector(
            'li.miller-selected'
          );

          if (!lastColumn || !selectedItem) {
            return null;
          }

          const itemRect = selectedItem.getBoundingClientRect();
          const columnRect = lastColumn.getBoundingClientRect();

          return {
            scrollTop: lastColumn.scrollTop,
            itemTop: itemRect.top,
            columnTop: columnRect.top,
            viewportPosition: itemRect.top - columnRect.top
          };
        });

        expect(beforeState).not.toBeNull();
        expect(afterState).not.toBeNull();

        // The viewport position should be very close to the original
        // (within a few pixels due to the deleted item)
        const viewportDiff = Math.abs(
          (afterState?.viewportPosition ?? 0) -
          (beforeState?.viewportPosition ?? 0)
        );
        expect(viewportDiff).toBeLessThan(50);

        // The item should still be visible in the viewport
        expect(afterState?.viewportPosition ?? 0).toBeGreaterThan(0);
        expect(afterState?.viewportPosition ?? 0).toBeLessThan(600);

        // Clean up
        await page.evaluate(() => {
          // @ts-expect-error - electronAPI available
          const {fs} = globalThis.electronAPI;
          fs.rmSync('/tmp/test-scroll-preservation', {
            recursive: true,
            force: true
          });
        });
      }
    );

    test(
      'maintains scroll position when file is added before selected item',
      async () => {
        // Create test directory with files
        await page.evaluate(() => {
          // @ts-expect-error - electronAPI available via preload
          const {fs, path} = globalThis.electronAPI;
          const testDir = '/tmp/test-scroll-add';
          const subdir = path.join(testDir, 'folder');

          // Clean up if exists
          try {
            fs.rmSync(testDir, {recursive: true});
          } catch (e) {
            // Ignore
          }

          // Create structure with numbered files
          fs.mkdirSync(testDir);
          fs.mkdirSync(subdir);
          for (let i = 20; i <= 80; i += 10) {
            fs.writeFileSync(
              path.join(subdir, `file-${String(i).padStart(3, '0')}.txt`),
              `content ${i}`
            );
          }
        });

        // Switch to three columns view and navigate
        await page.locator('#three-columns').click();
        await page.waitForTimeout(300);

        await page.evaluate(() => {
          globalThis.location.hash = '#path=/tmp/test-scroll-add';
        });
        await page.waitForTimeout(1500);

        // Click on the folder
        const folderLink = await page.locator(
          'a[data-path="/tmp/test-scroll-add/folder"]'
        );
        await folderLink.click();
        await page.waitForTimeout(1000);

        // Scroll down and select a file
        await page.evaluate(() => {
          const columns = [...document.querySelectorAll('.miller-column')];
          const lastColumn = columns.at(-1);
          if (lastColumn) {
            lastColumn.scrollTop = 200;
          }
        });
        await page.waitForTimeout(300);

        const file60Link = await page.locator(
          'span[data-path="/tmp/test-scroll-add/folder/file-060.txt"]'
        );
        await file60Link.click();
        await page.waitForTimeout(300);

        // Get viewport position before
        const beforeViewportPos = await page.evaluate(() => {
          const selectedItem = document.querySelector('li.miller-selected');
          const column = selectedItem?.closest('.miller-column');
          if (!selectedItem || !column) {
            return null;
          }
          const itemRect = selectedItem.getBoundingClientRect();
          const columnRect = column.getBoundingClientRect();
          return itemRect.top - columnRect.top;
        });

        // Add a new file before the selected one
        await page.evaluate(() => {
          // @ts-expect-error - electronAPI available via preload
          const {fs, path} = globalThis.electronAPI;
          const folder = '/tmp/test-scroll-add/folder';
          fs.writeFileSync(
            path.join(folder, 'file-015.txt'),
            'new file'
          );
        });

        // Wait for refresh
        await page.waitForTimeout(2500);

        // Get viewport position after
        const afterViewportPos = await page.evaluate(() => {
          const selectedItem = document.querySelector('li.miller-selected');
          const column = selectedItem?.closest('.miller-column');
          if (!selectedItem || !column) {
            return null;
          }
          const itemRect = selectedItem.getBoundingClientRect();
          const columnRect = column.getBoundingClientRect();
          return itemRect.top - columnRect.top;
        });

        expect(beforeViewportPos).not.toBeNull();
        expect(afterViewportPos).not.toBeNull();

        // Viewport position should be maintained
        const diff = Math.abs(
          (afterViewportPos ?? 0) - (beforeViewportPos ?? 0)
        );
        expect(diff).toBeLessThan(50);

        // Clean up
        await page.evaluate(() => {
          // @ts-expect-error - electronAPI available
          const {fs} = globalThis.electronAPI;
          fs.rmSync('/tmp/test-scroll-add', {recursive: true, force: true});
        });
      }
    );
  });
});
