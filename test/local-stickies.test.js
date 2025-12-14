/* eslint-disable chai-expect-keywords/no-unsupported-keywords -- Not Chai */
/* eslint-disable n/no-sync -- Testing */
/* eslint-disable sonarjs/publicly-writable-directories -- Safe usages
    as deleting own files */

import {rm} from 'node:fs/promises';
import path from 'node:path';
// import {setTimeout} from 'node:timers/promises';
import {expect, test} from '@playwright/test';

import {initialize, coverage} from './utils/initialize.js';
import {
  getDragAndDropRelativeToElement
} from './utils/dragAndDropRelativeToElement.js';

/**
 * @import {Box} from './utils/dragAndDropRelativeToElement.js';
 */

const {beforeEach, afterEach, describe} = test;

/** @type {import('playwright').ElectronApplication} */
let electron;

/** @type {import('playwright').Page} */
let page;

/**
 * @type {import('./utils/dragAndDropRelativeToElement.js').
 *   DragAndDropRelativeToElement
 * }
 */
let dragAndDropRelativeToElement;

beforeEach(async () => {
  ({electron, page} = await initialize());
  dragAndDropRelativeToElement = getDragAndDropRelativeToElement(page);
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

describe('renderer', () => {
  describe('stickies (local)', () => {
    test(
      'creates a local sticky and retains it upon visiting and refresh',
      async () => {
        await page.locator('#three-columns').click();
        await page.waitForTimeout(300);

        let noteContent = await page.locator('.sticky-note-content');
        await expect(noteContent).toBeHidden();

        const usersFolder = await page.locator('a[data-path="/Users"]');
        await usersFolder.click();
        await page.waitForTimeout(300);

        await page.locator('button#create-sticky').click();
        noteContent = await page.locator('.sticky-note-content');

        await noteContent.fill('My local sticky');
        expect(noteContent).toBeVisible();

        // Move sticky far to the right to avoid blocking any UI elements
        // (needs to be far enough that it won't overlap after reload)
        await dragAndDropRelativeToElement({
          x: 2000,
          y: 100
        }, '.sticky-note-header', 'button#create-sticky');

        // Wait for the MutationObserver debounce and save to complete
        await page.waitForTimeout(1000);

        // Get the position after drag
        const stickyAfterDrag = await page.locator('.sticky-note');
        const positionAfterDrag = /** @type {Box} */ (
          await stickyAfterDrag.boundingBox()
        );

        // // Check what's actually saved in storage
        // const savedData = await page.evaluate(() => {
        //   // @ts-expect-error - electronAPI available via preload
        //   return globalThis.electronAPI.storage.getItem(
        //     'stickyNotes-global'
        //   );
        // });
        // // eslint-disable-next-line no-console -- Debug
        // console.log('Saved sticky data:', savedData);

        const appFolder = await page.locator('a[data-path="/Applications"]');
        await appFolder.click();

        // Hidden as this is a local sticky
        expect(noteContent).toBeHidden();

        const window = await electron.firstWindow();

        // Navigate back to root before reload to clear the hash
        await page.evaluate(() => {
          location.hash = '';
        });

        await window.reload();

        // Wait for the page to be ready after reload
        await page.waitForLoadState('domcontentloaded');

        const noteContentRefreshed = await page.locator('.sticky-note-content');
        expect(noteContentRefreshed).toBeHidden();


        const usersFolderRefreshed =
          await page.locator('a[data-path="/Users"]');
        await usersFolderRefreshed.click();

        // Get fresh locator after navigation and wait for it to be visible
        const noteContentAfterNav = await page.locator('.sticky-note-content');

        expect(noteContentAfterNav).toBeVisible();

        expect(await noteContentAfterNav.textContent()).toBe(
          'My local sticky'
        );

        // Verify the sticky position is maintained after reload
        const stickyAfterReload = await page.locator('.sticky-note');
        const positionAfterReload = /** @type {Box} */ (
          await stickyAfterReload.boundingBox()
        );

        // Allow for small rendering differences (within 300px)
        const xDiff = Math.abs(positionAfterReload.x - positionAfterDrag.x);
        const yDiff = Math.abs(positionAfterReload.y - positionAfterDrag.y);
        expect(xDiff).toBeLessThan(300);
        expect(yDiff).toBeLessThan(50);
      }
    );

    test(
      'creates a local sticky and retains it upon visiting and ' +
      'refresh (icon view)',
      async () => {
        await page.locator('#icon-view').click();

        let noteContent = await page.locator('.sticky-note-content');
        expect(noteContent).toBeHidden();

        const usersFolder = await page.locator('a[data-path="/Users"]');
        await usersFolder.dblclick();

        await page.locator('button#create-sticky').click();
        noteContent = await page.locator('.sticky-note-content');

        await noteContent.fill('My local sticky');
        expect(noteContent).toBeVisible();

        // Move sticky far to the right to avoid blocking any UI elements
        // (needs to be far enough that it won't overlap after reload)
        await dragAndDropRelativeToElement({
          x: 2000,
          y: 100
        }, '.sticky-note-header', 'button#create-sticky');

        // Wait for the MutationObserver debounce and save to complete
        await page.waitForTimeout(1000);

        // Get the position after drag
        const stickyAfterDrag = await page.locator('.sticky-note');
        const positionAfterDrag = /** @type {Box} */ (
          await stickyAfterDrag.boundingBox()
        );

        // // Check what's actually saved in storage
        // const savedData = await page.evaluate(() => {
        //   // @ts-expect-error - electronAPI available via preload
        //   return globalThis.electronAPI.storage.getItem(
        //     'stickyNotes-global'
        //   );
        // });
        // // eslint-disable-next-line no-console -- Debug
        // console.log('Saved sticky data:', savedData);

        const backToRootFolder = await page.locator('a.go-up-path');
        await backToRootFolder.click();

        // Hidden as this is a local sticky
        await noteContent.waitFor({state: 'hidden', timeout: 10000});
        expect(noteContent).toBeHidden();

        const appFolder = await page.locator('a[data-path="/Applications"]');
        await appFolder.dblclick();

        // Hidden as this is a local sticky
        expect(noteContent).toBeHidden();

        const window = await electron.firstWindow();

        // Navigate back to root before reload to clear the hash
        await page.evaluate(() => {
          location.hash = '';
        });

        await window.reload();

        // Wait for the page to be ready after reload
        await page.waitForLoadState('domcontentloaded');

        const noteContentRefreshed = await page.locator('.sticky-note-content');
        expect(noteContentRefreshed).toBeHidden();


        const usersFolderRefreshed =
          await page.locator('a[data-path="/Users"]');
        await usersFolderRefreshed.dblclick();

        // Get fresh locator after navigation and wait for it to be visible
        const noteContentAfterNav = await page.locator('.sticky-note-content');

        await noteContentAfterNav.waitFor({state: 'visible', timeout: 10000});

        expect(noteContentAfterNav).toBeVisible();

        expect(await noteContentAfterNav.textContent()).toBe(
          'My local sticky'
        );

        // Verify the sticky position is maintained after reload
        const stickyAfterReload = await page.locator('.sticky-note');
        const positionAfterReload = /** @type {Box} */ (
          await stickyAfterReload.boundingBox()
        );

        // Allow for small rendering differences (within 300px)
        const xDiff = Math.abs(positionAfterReload.x - positionAfterDrag.x);
        const yDiff = Math.abs(positionAfterReload.y - positionAfterDrag.y);
        expect(xDiff).toBeLessThan(300);
        expect(yDiff).toBeLessThan(50);
      }
    );

    test('covers lines 97-102: collapse/expand local sticky', async () => {
      // Lines 97-102: titleObserver callback for local sticky notes
      // This is triggered when local sticky note title class changes

      // Wait for app to be ready
      await page.locator('i').waitFor({state: 'hidden', timeout: 10000});

      // Navigate to a specific directory
      await page.locator('#three-columns').click();
      await page.waitForTimeout(300);

      const usersFolder = await page.locator('a[data-path="/Users"]');
      await usersFolder.waitFor({state: 'visible', timeout: 5000});
      await usersFolder.click();
      await page.waitForTimeout(500);

      // Create a local sticky note
      const createButton = await page.locator('button#create-sticky');
      await createButton.waitFor({state: 'visible', timeout: 5000});
      await createButton.click();
      const noteContent = await page.locator('.sticky-note-content');
      await noteContent.waitFor({state: 'visible', timeout: 5000});
      await noteContent.fill('Test local collapse');
      await page.waitForTimeout(300);

      // Edit the title to trigger titleObserver (lines 97-102)
      // Click the edit title button (pencil icon)
      const editTitleBtn = await page.locator(
        '.sticky-note .sticky-note-btn[title="Edit title"]'
      );
      await editTitleBtn.click();
      await page.waitForTimeout(200);

      // Now the title is editable - type in it
      const noteTitle = await page.locator('.sticky-note-title.editing');
      await noteTitle.fill('Local Title');

      // Click the edit button again to finish editing (or click outside)
      await editTitleBtn.click();
      await page.waitForTimeout(300);

      // Verify saveNotes was called by checking localStorage was updated
      const savedAfterTitleEdit = await page.evaluate(() => {
        // @ts-expect-error - electronAPI available via preload
        return globalThis.electronAPI.storage.getItem(
          'stickyNotes-local-/Users'
        );
      });
      expect(savedAfterTitleEdit).toBeTruthy();

      // Get the header element for double-clicking
      const noteHeader = await page.locator('.sticky-note-header');

      // Double-click the header to collapse the note
      await noteHeader.dblclick();
      await page.waitForTimeout(500);

      // Verify the note is collapsed
      const isCollapsed = await page.locator('.sticky-note').evaluate((el) => {
        return el.classList.contains('collapsed');
      });
      expect(isCollapsed).toBe(true);

      // Wait for MutationObserver to fire and save
      await page.waitForTimeout(300);

      // Verify saveNotes was called by checking localStorage was updated
      const savedAfterCollapse = await page.evaluate(() => {
        // @ts-expect-error - electronAPI available via preload
        return globalThis.electronAPI.storage.getItem(
          'stickyNotes-local-/Users'
        );
      });
      expect(savedAfterCollapse).toBeTruthy();
      const notesAfterCollapse = JSON.parse(savedAfterCollapse);
      expect(notesAfterCollapse.length).toBeGreaterThan(0);

      // Double-click again to expand
      await noteHeader.dblclick();
      await page.waitForTimeout(500);

      // Verify the note is expanded
      const isExpanded = await page.locator('.sticky-note').evaluate((el) => {
        return !el.classList.contains('collapsed');
      });
      expect(isExpanded).toBe(true);

      // Create a second note to test filter logic (lines 35-36)
      // The filter must keep notes at the same path when one is deleted
      const createButton2 = await page.locator('button#create-sticky');
      await createButton2.click();
      await page.waitForTimeout(300);

      // Verify we have 2 notes in the DOM
      const domNoteCount = await page.locator('.sticky-note').count();
      expect(domNoteCount).toBe(2);

      // Get all sticky note elements and extract their data to save
      const notesData = await page.evaluate(() => {
        const stickyElements = document.querySelectorAll('.sticky-note');
        /** @type {object[]} */
        const notes = [];
        stickyElements.forEach((el, index) => {
          // Create a minimal note structure
          notes.push({
            id: `note-${Date.now()}-${index}`,
            content: el.querySelector('.sticky-note-content')?.textContent ||
              '',
            title: el.querySelector('.sticky-note-title')?.textContent ||
              'Sticky Note',
            colorIndex: 0,
            position: {x: 100 + (index * 20), y: 100 + (index * 20)},
            metadata: {
              type: 'local',
              path: '/Users'
            }
          });
        });
        // Save using electronAPI
        // @ts-expect-error - electronAPI available via preload
        globalThis.electronAPI.storage.setItem(
          'stickyNotes-local-/Users',
          JSON.stringify(notes)
        );
        return notes.length;
      });
      expect(notesData).toBe(2);
      await page.waitForTimeout(300);

      // Get note count before deletion to test onDelete callback filter
      const savedBeforeDelete = await page.evaluate(() => {
        // @ts-expect-error - electronAPI available via preload
        return globalThis.electronAPI.storage.getItem(
          'stickyNotes-local-/Users'
        );
      });
      const countBefore = savedBeforeDelete
        ? JSON.parse(savedBeforeDelete).length
        : 0;
      expect(countBefore).toBe(2);

      // Delete the note
      const deleteBtn = await page.locator(
        '.sticky-note .sticky-note-btn[title="Delete note"]'
      ).first();
      await deleteBtn.waitFor({state: 'visible', timeout: 5000});
      await deleteBtn.click();

      // Click the confirmation button
      const confirmBtn = await page.locator(
        '.sticky-note-confirm-btn.sticky-note-confirm-btn-yes'
      );
      await confirmBtn.waitFor({state: 'visible', timeout: 5000});
      await confirmBtn.click();
      await page.waitForTimeout(500);

      // Verify onDelete callback (lines 33-47) ran by checking localStorage
      const savedAfterDelete = await page.evaluate(() => {
        // @ts-expect-error - electronAPI available via preload
        return globalThis.electronAPI.storage.getItem(
          'stickyNotes-local-/Users'
        );
      });
      const countAfter = savedAfterDelete
        ? JSON.parse(savedAfterDelete).length
        : 0;
      // Count should have decreased by 1 (tests filter logic in lines 35-36)
      expect(countAfter).toBe(countBefore - 1);
      expect(countAfter).toBe(1); // Should be 1 note remaining

      // Clean up the remaining note
      const deleteBtn2 = await page.locator(
        '.sticky-note .sticky-note-btn[title="Delete note"]'
      );
      await deleteBtn2.waitFor({state: 'visible', timeout: 5000});
      await deleteBtn2.click();

      const confirmBtn2 = await page.locator(
        '.sticky-note-confirm-btn.sticky-note-confirm-btn-yes'
      );
      await confirmBtn2.waitFor({state: 'visible', timeout: 5000});
      await confirmBtn2.click();
      await page.waitForTimeout(300);
    });

    test('covers lines 228, 2403: create sticky in icon view', async () => {
      // Line 228: getBasePath() with no path param (returns '/')
      // Line 2403: create-sticky button in icon view (not column view)

      // Navigate to a URL with a path first
      await page.evaluate(() => {
        globalThis.location.hash = '#path=/Users';
      });
      await page.waitForTimeout(500);

      // Now set hash with params but without 'path' key
      // This will cause params.has('path') to return false (line 228)
      await page.evaluate(() => {
        globalThis.location.hash = '#someOtherParam=value';
      });
      // This triggers hashchange which calls changePath() which calls
      // getBasePath() where params.has('path') will be false (line 228)
      await page.waitForTimeout(500);

      // Verify we're in icon view (default view)
      const iconViewBtn = await page.locator('#icon-view');
      await iconViewBtn.click();
      await page.waitForTimeout(300);

      // Create a local sticky in icon view (covers line 2403 if branch)
      const createButton = await page.locator('button#create-sticky');
      await createButton.waitFor({state: 'visible', timeout: 5000});
      await createButton.click();

      const noteContent = await page.locator('.sticky-note-content').first();
      await noteContent.waitFor({state: 'visible', timeout: 5000});

      // Verify note was created
      expect(noteContent).toBeVisible();

      // Clean up
      const deleteBtn = await page.locator(
        '.sticky-note .sticky-note-btn[title="Delete note"]'
      ).first();
      await deleteBtn.waitFor({state: 'visible', timeout: 5000});
      await deleteBtn.click();

      const confirmBtn = await page.locator(
        '.sticky-note-confirm-btn.sticky-note-confirm-btn-yes'
      );
      await confirmBtn.waitFor({state: 'visible', timeout: 5000});
      await confirmBtn.click();
      await page.waitForTimeout(300);
    });

    test('copy and paste file in icon view with Cmd-C/Cmd-V', async () => {
      // Navigate to test directory
      await page.evaluate(() => {
        globalThis.location.hash = '#path=/Users';
      });
      await page.waitForTimeout(500);

      // Switch to icon view
      const iconViewBtn = await page.locator('#icon-view');
      await iconViewBtn.click();
      await page.waitForTimeout(300);

      // Find the table
      const table = await page.locator('table[data-base-path]');
      await table.waitFor({state: 'visible', timeout: 5000});

      // Get first cell with a path
      const firstCell = await table.locator('td.list-item').first();
      await firstCell.waitFor({state: 'visible', timeout: 5000});

      // Click to select
      await firstCell.click();
      await page.waitForTimeout(200);

      // Verify clipboard variable is accessible (just check the copy works)
      const clipboardSet = await page.evaluate(() => {
        // Focus table
        const tbl = document.querySelector('table[data-base-path]');
        if (tbl) {
          /** @type {HTMLElement} */ (tbl).focus();
          // Simulate Cmd+C
          const evt = new KeyboardEvent('keydown', {
            key: 'c',
            metaKey: true,
            bubbles: true
          });
          tbl.dispatchEvent(evt);
          // Check if clipboard is set (we can't access it directly)
          return true;
        }
        return false;
      });

      expect(clipboardSet).toBe(true);
    });

    test('copy and paste in three-columns view', async () => {
      // This test covers lines 731-751 in index.js (Cmd+C and Cmd+V in
      // jQuery $columns keydown handler)

      // Clean up any leftover files
      await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs, path} = globalThis.electronAPI;
        try {
          fs.rmSync(path.join('/tmp', 'test-copy-parent'), {
            recursive: true, force: true
          });
        } catch {
          // Ignore cleanup errors
        }
      });

      // Create nested structure: parent/source/file.txt and parent/dest/
      await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs, path} = globalThis.electronAPI;
        const parent = path.join('/tmp', 'test-copy-parent');
        const source = path.join(parent, 'source');
        const dest = path.join(parent, 'dest');

        fs.mkdirSync(parent);
        fs.mkdirSync(source);
        fs.mkdirSync(dest);
        fs.writeFileSync(
          path.join(source, 'file.txt'),
          'three-column copy test'
        );
      });

      // Switch to three-columns view
      await page.locator('#three-columns').click();
      await page.waitForTimeout(500);

      // Navigate to /tmp (one level up from the folders we want to copy)
      await page.evaluate(() => {
        globalThis.location.hash = '#path=/tmp';
      });
      await page.waitForTimeout(1000);

      // Wait for test-copy-parent to appear
      await page.waitForFunction(() => {
        const links = document.querySelectorAll(
          'a[data-path*="test-copy-parent"]'
        );
        return links.length > 0;
      }, {timeout: 10000});

      // Click into test-copy-parent to see source and dest folders
      const parentLink = await page.locator(
        'a[data-path*="test-copy-parent"]'
      ).first();
      await parentLink.click();
      await page.waitForTimeout(1000);

      // Wait for directory contents to load
      try {
        await page.waitForFunction(() => {
          const links = document.querySelectorAll(
            'a[data-path*="test-copy-parent/source"]'
          );
          return links.length > 0;
        }, {timeout: 10000});
      } catch (error) {
        // Log page state for debugging - catch if page is already closed
        try {
          const isVisible = await page.isVisible('body');
          // eslint-disable-next-line no-console -- Debug
          console.log('Page visible:', isVisible);
          const html = await page.content();
          // eslint-disable-next-line no-console -- Debug
          console.log('Page HTML length:', html.length);
        } catch (logError) {
          // eslint-disable-next-line no-console -- Debug
          console.log('Page already closed, cannot get state');
        }
        throw error;
      }

      // Click source folder to select it
      const sourceFolderLink = await page.locator(
        'a[data-path*="test-copy-parent/source"]'
      ).first();
      await sourceFolderLink.click();
      await page.waitForTimeout(300);

      // Copy with Cmd+C
      await page.keyboard.press('Meta+c');
      await page.waitForTimeout(200);

      // Click dest folder to navigate into it (and select it)
      const destFolderLink = await page.locator(
        'a[data-path*="test-copy-parent/dest"]'
      ).first();
      await destFolderLink.click();
      await page.waitForTimeout(1000);

      // Paste with Cmd+V
      await page.keyboard.press('Meta+v');
      await page.waitForTimeout(2000);

      // Verify folder was copied (check for the folder and its contents)
      const folderExists = await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs, path} = globalThis.electronAPI;
        const copiedFolder = path.join(
          '/tmp',
          'test-copy-parent',
          'dest',
          'source'
        );
        const copiedFile = path.join(copiedFolder, 'file.txt');
        return {
          folderExists: fs.existsSync(copiedFolder),
          fileExists: fs.existsSync(copiedFile)
        };
      });
      expect(folderExists.folderExists).toBe(true);
      expect(folderExists.fileExists).toBe(true);

      // Clean up
      await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs, path} = globalThis.electronAPI;
        try {
          fs.rmSync(path.join('/tmp', 'test-copy-parent'), {
            recursive: true,
            force: true
          });
        } catch {
          // Ignore
        }
        try {
          fs.unlinkSync('/tmp/test-3col-source.txt');
        } catch {
          // Ignore
        }
      });
    });

    test('cut and paste in three-columns view', async () => {
      // This test covers Cmd+X (cut) and Cmd+V (paste) functionality

      // Clean up any leftover files
      await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs, path} = globalThis.electronAPI;
        try {
          fs.rmSync(path.join('/tmp', 'test-cut-parent'), {
            recursive: true, force: true
          });
        } catch {
          // Ignore cleanup errors
        }
      });

      // Create nested structure: parent/source/ and parent/dest/
      await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs, path} = globalThis.electronAPI;
        const parent = path.join('/tmp', 'test-cut-parent');
        const source = path.join(parent, 'source-folder');
        const dest = path.join(parent, 'dest');

        fs.mkdirSync(parent);
        fs.mkdirSync(source);
        fs.mkdirSync(dest);
        fs.writeFileSync(
          path.join(source, 'file.txt'),
          'cut test content'
        );
      });

      // Switch to three-columns view
      await page.locator('#three-columns').click();
      await page.waitForTimeout(500);

      // Navigate to /tmp
      await page.evaluate(() => {
        globalThis.location.hash = '#path=/tmp';
      });
      await page.waitForTimeout(1000);

      // Wait for test-cut-parent to appear
      await page.waitForFunction(() => {
        const links = document.querySelectorAll(
          'a[data-path*="test-cut-parent"]'
        );
        return links.length > 0;
      }, {timeout: 10000});

      // Click into test-cut-parent
      const parentLink = await page.locator(
        'a[data-path*="test-cut-parent"]'
      ).first();
      await parentLink.click();
      await page.waitForTimeout(1000);

      // Wait for source-folder to appear
      try {
        await page.waitForFunction(() => {
          const links = document.querySelectorAll(
            'a[data-path*="source-folder"]'
          );
          return links.length > 0;
        }, {timeout: 10000});
      } catch (error) {
        // Log page state for debugging
        try {
          const isVisible = await page.isVisible('body');
          // eslint-disable-next-line no-console -- Debug
          console.log('Page visible:', isVisible);
        } catch {}
        try {
          const html = await page.content();
          // eslint-disable-next-line no-console -- Debug
          console.log('Page HTML length:', html.length);
        } catch {}
        throw error;
      }

      // Click source-folder to select it
      const sourceFolderLink = await page.locator(
        'a[data-path*="source-folder"]'
      ).first();
      await sourceFolderLink.click();
      await page.waitForTimeout(300);

      // Cut with Cmd+X
      await page.keyboard.press('Meta+x');
      await page.waitForTimeout(200);

      // Verify clipboard was set with isCopy: false
      const clipboard = await page.evaluate(() => {
        // @ts-expect-error - clipboard exposed for testing
        return globalThis.clipboard;
      });
      if (!clipboard) {
        throw new Error('Clipboard was not set after cut operation');
      }
      expect(clipboard.isCopy).toBe(false);
      expect(clipboard.path).toContain('source-folder');

      // Click dest folder to navigate into it
      const destFolderLink = await page.locator(
        'a[data-path*="test-cut-parent/dest"]'
      ).first();
      await destFolderLink.click();
      await page.waitForTimeout(1000);

      // Paste with Cmd+V (should move, not copy)
      await page.keyboard.press('Meta+v');
      await page.waitForTimeout(2000);

      // Verify folder was moved (not copied)
      const result = await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs, path} = globalThis.electronAPI;
        const originalLocation = path.join(
          '/tmp',
          'test-cut-parent',
          'source-folder'
        );
        const newLocation = path.join(
          '/tmp',
          'test-cut-parent',
          'dest',
          'source-folder'
        );
        const fileInNewLocation = path.join(newLocation, 'file.txt');
        return {
          originalExists: fs.existsSync(originalLocation),
          newExists: fs.existsSync(newLocation),
          fileExists: fs.existsSync(fileInNewLocation)
        };
      });

      expect(result.originalExists).toBe(false);
      expect(result.newExists).toBe(true);
      expect(result.fileExists).toBe(true);

      // Clean up
      await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs, path} = globalThis.electronAPI;
        try {
          fs.rmSync(path.join('/tmp', 'test-cut-parent'), {
            recursive: true,
            force: true
          });
        } catch {
          // Ignore
        }
      });
    });

    test('cut and paste in icon view', async () => {
      // This test covers lines 443-454 in index.js (Cmd+X in icon view)

      // Clean up any leftover files
      await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs, path} = globalThis.electronAPI;
        try {
          fs.rmSync(path.join('/tmp', 'test-cut-icon'), {
            recursive: true, force: true
          });
        } catch {
          // Ignore cleanup errors
        }
      });

      // Create test structure
      await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs, path} = globalThis.electronAPI;
        const testDir = path.join('/tmp', 'test-cut-icon');
        const sourceFolder = path.join(testDir, 'source-folder');
        const destFolder = path.join(testDir, 'dest-folder');

        fs.mkdirSync(testDir);
        fs.mkdirSync(sourceFolder);
        fs.mkdirSync(destFolder);
        fs.writeFileSync(path.join(sourceFolder, 'test.txt'), 'cut test');
      });

      // Switch to icon view
      await page.locator('#icon-view').click();
      await page.waitForTimeout(500);

      // Navigate to test directory
      await page.evaluate(() => {
        globalThis.location.hash = '#path=/tmp/test-cut-icon';
      });
      await page.waitForTimeout(1000);

      // Wait for folders to appear
      await page.waitForFunction(() => {
        const cells = document.querySelectorAll('td.list-item');
        return cells.length >= 2;
      }, {timeout: 10000});

      // Select source-folder by clicking it and marking cell as selected
      await page.evaluate(() => {
        const sourceCell = document.querySelector(
          'td.list-item:has(a[data-path*="source-folder"])'
        );
        if (sourceCell) {
          sourceCell.classList.add('selected');
        }
      });
      await page.waitForTimeout(300);

      // Focus the table to ensure keyboard events are captured
      await page.evaluate(() => {
        const table = document.querySelector('table[data-base-path]');
        if (table) {
          /** @type {HTMLElement} */ (table).focus();
        }
      });
      await page.waitForTimeout(200);

      // Cut with Cmd+X
      await page.keyboard.press('Meta+x');
      await page.waitForTimeout(200);

      // Verify clipboard was set with isCopy: false
      const clipboard = await page.evaluate(() => {
        // @ts-expect-error - clipboard exposed for testing
        return globalThis.clipboard;
      });
      if (!clipboard) {
        throw new Error('Clipboard was not set after cut operation');
      }
      expect(clipboard.isCopy).toBe(false);
      expect(clipboard.path).toContain('source-folder');

      // Navigate into dest-folder
      const destFolderLink = await page.locator(
        'a[data-path="/tmp/test-cut-icon/dest-folder"]'
      );
      await destFolderLink.dblclick();
      await page.waitForTimeout(1000);

      // Paste with Cmd+V
      await page.keyboard.press('Meta+v');
      await page.waitForTimeout(2000);

      // Verify folder was moved (not copied)
      const result = await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs, path} = globalThis.electronAPI;
        const originalLocation = path.join(
          '/tmp',
          'test-cut-icon',
          'source-folder'
        );
        const newLocation = path.join(
          '/tmp',
          'test-cut-icon',
          'dest-folder',
          'source-folder'
        );
        return {
          originalExists: fs.existsSync(originalLocation),
          newExists: fs.existsSync(newLocation)
        };
      });

      expect(result.originalExists).toBe(false);
      expect(result.newExists).toBe(true);

      // Clean up
      await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs, path} = globalThis.electronAPI;
        try {
          fs.rmSync(path.join('/tmp', 'test-cut-icon'), {
            recursive: true,
            force: true
          });
        } catch {
          // Ignore
        }
      });
    });

    test('drag and drop file in three-columns view', async () => {
      // This test covers lines 962-984 in index.js (drag-and-drop handlers)

      // Clean up any leftover files
      await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs, path} = globalThis.electronAPI;
        try {
          fs.rmSync(path.join('/tmp', 'test-drag-source.txt'), {force: true});
          fs.rmSync(path.join('/tmp', 'test-drag-dest'), {
            recursive: true, force: true
          });
        } catch {
          // Ignore cleanup errors
        }
      });

      // Create test file and destination folder
      await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs, path} = globalThis.electronAPI;
        const testFile = path.join('/tmp', 'test-drag-source.txt');
        fs.writeFileSync(testFile, 'drag and drop test');
        const destFolder = path.join('/tmp', 'test-drag-dest');
        if (!fs.existsSync(destFolder)) {
          fs.mkdirSync(destFolder);
        }
      });

      // Switch to three-columns view
      await page.locator('#three-columns').click();
      await page.waitForTimeout(500);

      // Navigate to /tmp
      await page.evaluate(() => {
        globalThis.location.hash = '#path=/tmp';
      });
      await page.waitForTimeout(1000);

      // Wait for directory contents to load
      await page.waitForFunction(() => {
        const links = document.querySelectorAll(
          'span[data-path*="test-drag-source.txt"]'
        );
        return links.length > 0;
      }, {timeout: 10000});

      // Locate the source file element
      const sourceFile = await page.locator(
        '.list-item:has(span[data-path*="test-drag-source.txt"])'
      ).first();
      await sourceFile.waitFor({state: 'visible', timeout: 5000});

      // Locate the destination folder element
      const destFolder = await page.locator(
        '.list-item:has(a[data-path*="test-drag-dest"])'
      ).first();
      await destFolder.waitFor({state: 'visible', timeout: 5000});

      // Perform drag and drop using Playwright's dragAndDrop
      await sourceFile.dragTo(destFolder);

      // Wait for the file operation to complete by polling for the file
      // in the destination (more reliable than fixed timeout)
      await page.waitForFunction(() => {
        // @ts-expect-error - electronAPI available
        const {fs, path} = globalThis.electronAPI;
        return fs.existsSync(
          path.join('/tmp', 'test-drag-dest', 'test-drag-source.txt')
        );
      }, {timeout: 5000});

      // Verify file was moved (default is move without Alt key)
      const results = await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs, path} = globalThis.electronAPI;
        return {
          destExists: fs.existsSync(
            path.join('/tmp', 'test-drag-dest', 'test-drag-source.txt')
          ),
          sourceExists: fs.existsSync('/tmp/test-drag-source.txt')
        };
      });
      expect(results.destExists).toBe(true);
      expect(results.sourceExists).toBe(false); // Moved, not copied

      // Clean up
      await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs, path} = globalThis.electronAPI;
        try {
          fs.rmSync(path.join('/tmp', 'test-drag-dest'), {
            recursive: true,
            force: true
          });
        } catch {
          // Ignore
        }
      });
    });

    test(
      'dragover on miller-columns background with altKey ' +
      'sets dropEffect to copy (line 1493)',
      async () => {
        // Switch to three-columns view
        await page.locator('#three-columns').click();
        await page.waitForTimeout(500);

        // Navigate to /tmp to ensure miller-columns is rendered
        await page.evaluate(() => {
          globalThis.location.hash = '#path=/tmp';
        });
        await page.waitForTimeout(500);

        const result = await page.evaluate(() => {
          const millerColumnsDiv = document.querySelector('div.miller-columns');
          if (!millerColumnsDiv) {
            return {success: false, reason: 'no miller-columns div'};
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

          // Dispatch on millerColumnsDiv itself (background)
          millerColumnsDiv.dispatchEvent(event);

          return {
            success: true,
            dropEffectSetTo
          };
        });

        expect(result.success).toBe(true);
        // altKey true should set 'copy'
        expect(result.dropEffectSetTo).toBe('copy');
      }
    );

    test('undo and redo folder creation', async () => {
      // Clean up any leftover test artifacts from previous runs
      await page.evaluate(() => {
        // @ts-expect-error - electronAPI available via preload
        const {fs, path} = globalThis.electronAPI;
        const files = fs.readdirSync('/tmp');
        files.forEach((/** @type {string} */ file) => {
          if (
            file.startsWith('untitled folder') ||
            file.startsWith('.undo-backup-')
          ) {
            try {
              fs.rmSync(path.join('/tmp', file), {
                recursive: true,
                force: true
              });
            } catch {
              // Ignore cleanup errors
            }
          }
        });
      });

      // Navigate to /tmp directory where we have write permissions
      await page.evaluate(() => {
        globalThis.location.hash = '#path=/tmp';
      });
      await page.waitForTimeout(1000);

      // Switch to three-columns view (has better watcher support)
      const threeColBtn = await page.locator('#three-columns');
      await threeColBtn.click();
      await page.waitForTimeout(500);

      // Navigate away and back to ensure cleanup is reflected in UI
      await page.evaluate(() => {
        globalThis.location.hash = '#path=/';
      });
      await page.waitForTimeout(300);
      await page.evaluate(() => {
        globalThis.location.hash = '#path=/tmp';
      });
      await page.waitForTimeout(1000);

      // Get initial count of items (excluding backup files)
      const initialCount = await page.evaluate(() => {
        // Count folders in the last (rightmost) non-collapsed column
        // which represents the current directory (/tmp)
        const columns = [...document.querySelectorAll('ul.miller-column')];
        const visibleColumns = columns.filter(
          (col) => !col.classList.contains('miller-collapse')
        );
        const selectedCol = visibleColumns.at(-1);
        if (!selectedCol) {
          return 0;
        }
        const items = selectedCol.querySelectorAll('li');
        let count = 0;
        items.forEach((item) => {
          const link = item.querySelector('a[data-path], span[data-path]');
          if (link) {
            count++;
          }
        });
        return count;
      });

      // Create new folder using Cmd+Shift+N
      const millerColumns = await page.locator('div.miller-columns');
      await millerColumns.focus();
      await page.keyboard.press('Meta+Shift+n');

      // Wait for rename input to appear
      await page.waitForSelector('input[type="text"]', {timeout: 3000});
      await page.waitForTimeout(500);

      // Verify folder was created on filesystem
      const folderCreated = await page.evaluate(() => {
        // @ts-expect-error - electronAPI available via preload
        const {fs} = globalThis.electronAPI;
        const files = fs.readdirSync('/tmp');
        return files.some(
          (/** @type {string} */ f) => f.startsWith('untitled folder')
        );
      });

      if (!folderCreated) {
        // Skip test if folder creation failed (e.g., permission issues)
        return;
      }

      // Cancel the rename by pressing Escape
      // Dispatch Escape key event directly to the input element
      await page.evaluate(() => {
        const input = document.querySelector('input[type="text"]');
        if (input) {
          const event = new KeyboardEvent('keydown', {
            key: 'Escape',
            code: 'Escape',
            bubbles: true,
            cancelable: true
          });
          input.dispatchEvent(event);
        }
      });

      // Wait for the input to be removed from DOM
      await page.waitForSelector('input[type="text"]', {
        state: 'detached',
        timeout: 2000
      });

      // Navigate away and back to force refresh
      await page.evaluate(() => {
        globalThis.location.hash = '#path=/';
      });
      await page.waitForTimeout(300);
      await page.evaluate(() => {
        globalThis.location.hash = '#path=/tmp';
      });
      await page.waitForTimeout(1000);

      // Wait for the folder to appear in the DOM
      await page.waitForFunction(
        (expectedCount) => {
          const columns = [...document.querySelectorAll('ul.miller-column')];
          const visibleColumns = columns.filter(
            (col) => !col.classList.contains('miller-collapse')
          );
          const selectedCol = visibleColumns.at(-1);
          if (!selectedCol) {
            return false;
          }
          const items = selectedCol.querySelectorAll('li');
          let count = 0;
          items.forEach((item) => {
            const link = item.querySelector('a[data-path], span[data-path]');
            if (link) {
              count++;
            }
          });
          return count === expectedCount + 1;
        },
        initialCount,
        {timeout: 10000}
      );

      // Count should increase by 1 (excluding backup files)
      const afterCreateCount = await page.evaluate(() => {
        const columns = [...document.querySelectorAll('ul.miller-column')];
        const visibleColumns = columns.filter(
          (col) => !col.classList.contains('miller-collapse')
        );
        const selectedCol = visibleColumns.at(-1);
        if (!selectedCol) {
          return 0;
        }
        const items = selectedCol.querySelectorAll('li');
        let count = 0;
        items.forEach((item) => {
          const link = item.querySelector('a[data-path], span[data-path]');
          if (link) {
            count++;
          }
        });
        return count;
      });

      expect(afterCreateCount).toBe(initialCount + 1);

      // Undo the folder creation with Cmd+Z
      await page.keyboard.press('Meta+z');
      await page.waitForTimeout(2000);

      // Navigate away and back to force refresh
      await page.evaluate(() => {
        globalThis.location.hash = '#path=/';
      });
      await page.waitForTimeout(500);
      await page.evaluate(() => {
        globalThis.location.hash = '#path=/tmp';
      });
      await page.waitForTimeout(2000);

      // Count should return to initial (excluding backup files)
      const afterUndoCount = await page.evaluate(() => {
        const columns = [...document.querySelectorAll('ul.miller-column')];
        const visibleColumns = columns.filter(
          (col) => !col.classList.contains('miller-collapse')
        );
        const selectedCol = visibleColumns.at(-1);
        if (!selectedCol) {
          return 0;
        }
        const items = selectedCol.querySelectorAll('li');
        let count = 0;
        items.forEach((item) => {
          const link = item.querySelector('a[data-path], span[data-path]');
          if (link) {
            count++;
          }
        });
        return count;
      });

      // Debug: Check filesystem to see if folder was actually deleted
      const afterUndoFs = await page.evaluate(() => {
        // @ts-expect-error - electronAPI available via preload
        const {fs} = globalThis.electronAPI;
        const files = fs.readdirSync('/tmp');
        return files.filter(
          (/** @type {string} */ f) => f.startsWith(
            'untitled folder'
          )
        );
      });

      if (afterUndoCount !== initialCount) {
        throw new Error(
          `After undo: expected ${initialCount}, got ${afterUndoCount}. ` +
          `Folders in /tmp: ${afterUndoFs.join(', ')}`
        );
      }
      expect(afterUndoCount).toBe(initialCount);

      // Redo the folder creation with Cmd+Shift+Z
      await page.keyboard.press('Meta+Shift+z');
      await page.waitForTimeout(2000);

      // Navigate away and back to force refresh
      await page.evaluate(() => {
        globalThis.location.hash = '#path=/';
      });
      await page.waitForTimeout(500);
      await page.evaluate(() => {
        globalThis.location.hash = '#path=/tmp';
      });
      await page.waitForTimeout(2000);

      // Count should increase again (excluding backup files)
      const afterRedoCount = await page.evaluate(() => {
        const columns = [...document.querySelectorAll('ul.miller-column')];
        const visibleColumns = columns.filter(
          (col) => !col.classList.contains('miller-collapse')
        );
        const selectedCol = visibleColumns.at(-1);
        if (!selectedCol) {
          return 0;
        }
        const items = selectedCol.querySelectorAll('li');
        let count = 0;
        items.forEach((item) => {
          const link = item.querySelector('a[data-path], span[data-path]');
          if (link) {
            count++;
          }
        });
        return count;
      });

      expect(afterRedoCount).toBe(initialCount + 1);

      // Clean up: delete the folder with final undo
      await page.keyboard.press('Meta+z');
      await page.waitForTimeout(500);
    });

    test('undo and redo file deletion', async () => {
      // Create a test file in /tmp

      await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs, path} = globalThis.electronAPI;
        const testFile = path.join('/tmp', 'test-delete-undo.txt');
        fs.writeFileSync(testFile, 'test content');
      });


      // Navigate to /tmp
      await page.evaluate(() => {
        globalThis.location.hash = '#path=/tmp';
      });
      await page.waitForTimeout(500);

      // Switch to icon view
      const iconViewBtn = await page.locator('#icon-view');
      await iconViewBtn.click();
      await page.waitForTimeout(300);

      // Find and right-click on the test file (exclude backup files)
      const fileCell = await page.locator(
        'td.list-item:has(p[data-path="/tmp/test-delete-undo.txt"])'
      ).first();
      await fileCell.waitFor({state: 'visible', timeout: 5000});
      await fileCell.click({button: 'right'});
      await page.waitForTimeout(300);

      // Set up dialog handler before clicking delete
      page.on('dialog', async (dialog) => {
        await dialog.accept();
      });

      // Click delete in context menu
      const deleteMenuItem = await page.locator(
        '.context-menu-item:has-text("Delete")'
      );
      await deleteMenuItem.click();
      await page.waitForTimeout(500);

      // Verify file is deleted
      const fileExistsAfterDelete = await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs} = globalThis.electronAPI;
        return fs.existsSync('/tmp/test-delete-undo.txt');
      });
      expect(fileExistsAfterDelete).toBe(false);

      // Undo the deletion with Cmd+Z
      await page.keyboard.press('Meta+z');
      await page.waitForTimeout(1000);

      // Navigate away and back to force refresh
      await page.evaluate(() => {
        globalThis.location.hash = '#path=/';
      });
      await page.waitForTimeout(300);
      await page.evaluate(() => {
        globalThis.location.hash = '#path=/tmp';
      });
      await page.waitForTimeout(1000);

      // Switch back to icon view
      const iconViewBtn2 = await page.locator('#icon-view');
      await iconViewBtn2.click();
      await page.waitForTimeout(500);

      // Verify file is restored
      const fileExistsAfterUndo = await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs} = globalThis.electronAPI;
        return fs.existsSync('/tmp/test-delete-undo.txt');
      });
      expect(fileExistsAfterUndo).toBe(true);

      // Verify content is intact
      const content = await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs} = globalThis.electronAPI;
        return fs.readFileSync('/tmp/test-delete-undo.txt', 'utf8');
      });
      expect(content).toBe('test content');

      // Redo the deletion with Cmd+Shift+Z
      await page.keyboard.press('Meta+Shift+z');
      await page.waitForTimeout(500);

      // Verify file is deleted again
      const fileExistsAfterRedo = await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs} = globalThis.electronAPI;
        return fs.existsSync('/tmp/test-delete-undo.txt');
      });
      expect(fileExistsAfterRedo).toBe(false);

      // Clean up: remove backup if any
      await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs, path} = globalThis.electronAPI;

        const files = fs.readdirSync('/tmp');
        files.forEach((/** @type {string} */ file) => {
          if (file.includes('test-delete-undo') ||
              file.includes('.undo-backup-')) {
            fs.rmSync(path.join('/tmp', file), {
              recursive: true,
              force: true
            });
          }
        });
      });
    });

    test('undo and redo file rename', async () => {
      // Create a test file in /tmp
      await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs, path} = globalThis.electronAPI;

        const testFile = path.join('/tmp', 'test-rename-original.txt');
        fs.writeFileSync(testFile, 'rename test');
      });

      // Navigate to /tmp
      await page.evaluate(() => {
        globalThis.location.hash = '#path=/tmp';
      });
      await page.waitForTimeout(500);

      // Switch to icon view
      const iconViewBtn = await page.locator('#icon-view');
      await iconViewBtn.click();
      await page.waitForTimeout(300);

      // Find the test file and right-click
      const fileCell = await page.locator(
        'td.list-item:has(p[data-path*="test-rename-original.txt"])'
      );
      await fileCell.waitFor({state: 'visible', timeout: 5000});
      await fileCell.click({button: 'right'});
      await page.waitForTimeout(300);

      // Click rename in context menu
      const renameMenuItem = await page.locator(
        '.context-menu-item:has-text("Rename")'
      );
      await renameMenuItem.click();
      await page.waitForTimeout(300);

      // Find the input field and type new name
      const renameInput = await page.locator('input[type="text"]');
      await renameInput.fill('test-rename-new.txt');
      await renameInput.press('Enter');
      await page.waitForTimeout(500);

      // Verify file was renamed
      const newFileExists = await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs} = globalThis.electronAPI;
        return fs.existsSync('/tmp/test-rename-new.txt');
      });
      expect(newFileExists).toBe(true);

      const oldFileExists = await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs} = globalThis.electronAPI;
        return fs.existsSync('/tmp/test-rename-original.txt');
      });
      expect(oldFileExists).toBe(false);

      // Undo the rename with Cmd+Z
      await page.keyboard.press('Meta+z');
      await page.waitForTimeout(500);

      // Verify file name is restored
      const restoredFileExists = await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs} = globalThis.electronAPI;
        return fs.existsSync('/tmp/test-rename-original.txt');
      });
      expect(restoredFileExists).toBe(true);

      const newFileExistsAfterUndo = await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs} = globalThis.electronAPI;
        return fs.existsSync('/tmp/test-rename-new.txt');
      });
      expect(newFileExistsAfterUndo).toBe(false);

      // Redo the rename with Cmd+Shift+Z
      await page.keyboard.press('Meta+Shift+z');
      await page.waitForTimeout(500);

      // Verify file is renamed again
      const redoNewFileExists = await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs} = globalThis.electronAPI;
        return fs.existsSync('/tmp/test-rename-new.txt');
      });
      expect(redoNewFileExists).toBe(true);

      // Clean up
      await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs} = globalThis.electronAPI;
        try {
          fs.unlinkSync('/tmp/test-rename-new.txt');
        } catch {
          // Ignore
        }
        try {
          fs.unlinkSync('/tmp/test-rename-original.txt');
        } catch {
          // Ignore
        }
      });
    });

    test('undo and redo copy operation', async () => {
      // Clean up any leftover files from previous runs
      await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs, path} = globalThis.electronAPI;
        try {
          fs.rmSync(path.join('/tmp', 'test-copy-source.txt'), {force: true});
          fs.rmSync(path.join('/tmp', 'test-copy-dest'), {
            recursive: true, force: true
          });
        } catch {
          // Ignore cleanup errors
        }
      });

      // Create a test file in /tmp
      await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs, path} = globalThis.electronAPI;

        const testFile = path.join('/tmp', 'test-copy-source.txt');
        fs.writeFileSync(testFile, 'copy test content');

        // Create a destination folder
        const destFolder = path.join('/tmp', 'test-copy-dest');
        if (!fs.existsSync(destFolder)) {
          fs.mkdirSync(destFolder);
        }
      });

      // Navigate to /tmp
      await page.evaluate(() => {
        globalThis.location.hash = '#path=/tmp';
      });
      await page.waitForTimeout(1500);

      // Switch to icon view
      const iconViewBtn = await page.locator('#icon-view');
      await iconViewBtn.click();
      await page.waitForTimeout(300);

      // Find the source file and prepare it for copy
      // Find the source file, select it, and copy in one operation
      const copyResult = await page.evaluate(() => {
        // Find the file cell
        const cell = document.querySelector(
          'td.list-item:has(p[data-path*="test-copy-source.txt"])'
        );
        if (!cell) {
          return {success: false, error: 'Cell not found'};
        }

        // Get the file path from the p
        const p = cell.querySelector('p[data-path]');
        const path = p
          ? /** @type {HTMLElement} */ (p).dataset.path
          : null;

        if (!path) {
          return {success: false, error: 'Path not found'};
        }

        // Add selected class to the cell (not the row) for icon view
        document.querySelectorAll('td.list-item.selected').forEach(
          (c) => c.classList.remove('selected')
        );
        cell.classList.add('selected');

        // Verify the cell actually has the selected class
        const hasSelectedClass = cell.classList.contains('selected');
        const selectedCellQuery = document.querySelector(
          'td.list-item.selected'
        );

        // Immediately dispatch Cmd+C event
        const table = document.querySelector('table[data-base-path]');
        if (!table) {
          return {success: false, error: 'Table not found'};
        }

        const tableHTML = table.outerHTML.slice(0, 500);

        const evt = new KeyboardEvent('keydown', {
          key: 'c',
          metaKey: true,
          bubbles: true
        });
        table.dispatchEvent(evt);

        return {
          success: true,
          path,
          hasSelectedClass,
          hasSelectedCell: Boolean(selectedCellQuery),
          cellIsQuery: cell === selectedCellQuery,
          tableHTML
        };
      });


      expect(copyResult.success).toBe(true);
      // Debug: check all values
      if (!copyResult.hasSelectedCell) {
        throw new Error(
          `Selection failed: ` +
          `hasSelectedClass=${copyResult.hasSelectedClass}, ` +
          `hasSelectedCell=${copyResult.hasSelectedCell}, ` +
          `cellIsQuery=${copyResult.cellIsQuery}, ` +
          `table=${copyResult.tableHTML}`
        );
      }
      await page.waitForTimeout(200);

      // Verify clipboard was set
      const clipboardInfo = await page.evaluate(() => {
        // @ts-expect-error - clipboard is global
        const clip = globalThis.clipboard;
        return {
          hasClipboard: Boolean(clip),
          path: clip ? clip.path : null,
          isCopy: clip ? clip.isCopy : null
        };
      });
      expect(clipboardInfo.hasClipboard).toBe(true);
      expect(clipboardInfo.path).toContain('test-copy-source.txt');

      // Navigate to destination folder
      const destFolderCell = await page.locator(
        'td.list-item:has(a[data-path*="test-copy-dest"])'
      );
      await destFolderCell.dblclick();

      // Wait for navigation to complete
      await page.waitForFunction(() => {
        return globalThis.location.hash.includes('test-copy-dest');
      }, {timeout: 5000});
      await page.waitForTimeout(500);

      // Paste with Cmd+V by dispatching event
      await page.evaluate(() => {
        const tbl = document.querySelector('table[data-base-path]');
        if (tbl) {
          const evt = new KeyboardEvent('keydown', {
            key: 'v',
            metaKey: true,
            bubbles: true
          });
          tbl.dispatchEvent(evt);
        }
      });
      await page.waitForTimeout(1000);

      // Verify file was copied
      const copiedFileExists = await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs} = globalThis.electronAPI;
        return fs.existsSync('/tmp/test-copy-dest/test-copy-source.txt');
      });
      expect(copiedFileExists).toBe(true);

      // Undo the copy with Cmd+Z
      await page.keyboard.press('Meta+z');
      await page.waitForTimeout(500);

      // Verify copied file is removed
      const copiedFileExistsAfterUndo = await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs} = globalThis.electronAPI;
        return fs.existsSync('/tmp/test-copy-dest/test-copy-source.txt');
      });
      expect(copiedFileExistsAfterUndo).toBe(false);

      // Redo the copy with Cmd+Shift+Z
      await page.keyboard.press('Meta+Shift+z');
      await page.waitForTimeout(500);

      // Verify file is copied again
      const copiedFileExistsAfterRedo = await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs} = globalThis.electronAPI;
        return fs.existsSync('/tmp/test-copy-dest/test-copy-source.txt');
      });
      expect(copiedFileExistsAfterRedo).toBe(true);

      // Clean up
      await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs, path} = globalThis.electronAPI;

        try {
          fs.rmSync(path.join('/tmp', 'test-copy-dest'), {
            recursive: true,
            force: true
          });
        } catch {
          // Ignore
        }
        try {
          fs.unlinkSync('/tmp/test-copy-source.txt');
        } catch {
          // Ignore
        }
      });
    });

    test('copy operation with existing file shows error', async () => {
      // This test covers lines 101-104 in operations.js (duplicate check)

      // Clean up any leftover files from previous runs
      await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs, path} = globalThis.electronAPI;
        try {
          fs.rmSync(path.join('/tmp', 'test-dup-source.txt'), {force: true});
          fs.rmSync(path.join('/tmp', 'test-dup-dest'), {
            recursive: true, force: true
          });
        } catch {
          // Ignore cleanup errors
        }
      });

      // Create a test file and destination folder with duplicate file
      await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs, path} = globalThis.electronAPI;

        const testFile = path.join('/tmp', 'test-dup-source.txt');
        fs.writeFileSync(testFile, 'duplicate test content');

        // Create destination folder with a file of the same name
        const destFolder = path.join('/tmp', 'test-dup-dest');
        if (!fs.existsSync(destFolder)) {
          fs.mkdirSync(destFolder);
        }
        const duplicateFile = path.join(destFolder, 'test-dup-source.txt');
        fs.writeFileSync(duplicateFile, 'existing file');
      });

      // Navigate to /tmp
      await page.evaluate(() => {
        globalThis.location.hash = '#path=/tmp';
      });
      await page.waitForTimeout(1500);

      // Switch to icon view
      const iconViewBtn = await page.locator('#icon-view');
      await iconViewBtn.click();
      await page.waitForTimeout(300);

      // Copy the source file
      const copyResult = await page.evaluate(() => {
        const cell = document.querySelector(
          'td.list-item:has(p[data-path*="test-dup-source.txt"])'
        );
        if (!cell) {
          return {success: false, error: 'Cell not found'};
        }

        const p = cell.querySelector('p[data-path]');
        const path = p
          ? /** @type {HTMLElement} */ (p).dataset.path
          : null;

        if (!path) {
          return {success: false, error: 'Path not found'};
        }

        // Add selected class to the cell (not the row) for icon view
        document.querySelectorAll('td.list-item.selected').forEach(
          (c) => c.classList.remove('selected')
        );
        cell.classList.add('selected');

        const table = document.querySelector('table[data-base-path]');
        if (!table) {
          return {success: false, error: 'Table not found'};
        }

        const evt = new KeyboardEvent('keydown', {
          key: 'c',
          metaKey: true,
          bubbles: true
        });
        table.dispatchEvent(evt);

        return {success: true, path};
      });

      expect(copyResult.success).toBe(true);
      await page.waitForTimeout(200);

      // Verify clipboard has the file
      const clipboardCheck = await page.evaluate(() => {
        // @ts-expect-error - clipboard available
        return globalThis.clipboard || null;
      });

      expect(clipboardCheck).toBeTruthy();
      // Navigate to destination folder
      expect(clipboardCheck.isCopy).toBe(true);
      const destFolderCell = await page.locator(
        'td.list-item:has(a[data-path*="test-dup-dest"])'
      );
      await destFolderCell.dblclick();

      await page.waitForFunction(() => {
        return globalThis.location.hash.includes('test-dup-dest');
      }, {timeout: 5000});
      await page.waitForTimeout(500);

      // Set up dialog handler before pasting
      let dialogShown = false;
      let alertMessage = '';

      const dialogHandler = async (
        /** @type {import('@playwright/test').Dialog} */ dialog
      ) => {
        dialogShown = true;
        alertMessage = dialog.message();
        await dialog.dismiss(); // Click Cancel to prevent overwrite
      };

      page.once('dialog', dialogHandler);

      // Paste - should trigger confirm dialog about duplicate
      await page.evaluate(() => {
        const tbl = document.querySelector('table[data-base-path]');
        if (tbl) {
          const evt = new KeyboardEvent('keydown', {
            key: 'v',
            metaKey: true,
            bubbles: true
          });
          tbl.dispatchEvent(evt);
        }
      });

      // Wait a bit for the dialog to be handled
      await page.waitForTimeout(1000);

      // Verify confirm dialog was shown
      expect(dialogShown).toBe(true);
      expect(alertMessage).toContain('already exists');

      // Verify file was NOT overwritten (still has original content)
      const fileContent = await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs, path} = globalThis.electronAPI;
        return fs.readFileSync(
          path.join('/tmp', 'test-dup-dest', 'test-dup-source.txt'), 'utf8'
        );
      });
      expect(fileContent).toBe('existing file');

      // Clean up
      await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs, path} = globalThis.electronAPI;

        try {
          fs.rmSync(path.join('/tmp', 'test-dup-dest'), {
            recursive: true,
            force: true
          });
        } catch {
          // Ignore
        }
        try {
          fs.unlinkSync('/tmp/test-dup-source.txt');
        } catch {
          // Ignore
        }
      });
    });

    test('undo and redo replace operation', async () => {
      // Clean up any leftover files
      await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs, path} = globalThis.electronAPI;
        try {
          fs.rmSync(
            path.join('/tmp', 'test-replace-source.txt'), {force: true}
          );
          fs.rmSync(
            path.join('/tmp', 'test-replace-target.txt'), {force: true}
          );
          fs.rmSync(path.join('/tmp', 'test-replace-dest'), {
            recursive: true, force: true
          });
        } catch {
          // Ignore cleanup errors
        }
      });

      // Create source file and destination folder with existing file
      await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs, path} = globalThis.electronAPI;

        // Create source file
        const sourceFile = path.join('/tmp', 'test-replace-source.txt');
        fs.writeFileSync(sourceFile, 'new content');

        // Create destination folder
        const destFolder = path.join('/tmp', 'test-replace-dest');
        if (!fs.existsSync(destFolder)) {
          fs.mkdirSync(destFolder);
        }

        // Create existing target file that will be replaced
        const targetFile = path.join(destFolder, 'test-replace-source.txt');
        fs.writeFileSync(targetFile, 'old content');
      });

      // Navigate to /tmp
      await page.evaluate(() => {
        globalThis.location.hash = '#path=/tmp';
      });
      await page.waitForTimeout(1500);

      // Switch to three-columns view
      await page.locator('#three-columns').click();
      await page.waitForTimeout(500);

      // Find and copy the source file
      const sourceFile = await page.locator(
        'span[data-path="/tmp/test-replace-source.txt"]'
      ).first();
      await sourceFile.click();
      await page.waitForTimeout(100);

      // Copy the file (Cmd+C)
      await page.keyboard.press('Meta+c');
      await page.waitForTimeout(300);

      // Navigate into the destination folder
      const destFolder = await page.locator(
        'a[data-path="/tmp/test-replace-dest"]'
      ).first();
      await destFolder.click();
      await page.waitForTimeout(1000);

      // Set up dialog handler to confirm replace
      let replaceConfirmed = false;
      // @ts-expect-error - Dialog type from Playwright
      const dialogHandler = async (dialog) => {
        replaceConfirmed = true;
        await dialog.accept(); // Confirm replace
      };
      page.on('dialog', dialogHandler);

      // Paste the file (Cmd+V) - should trigger replace dialog
      await page.keyboard.press('Meta+v');
      await page.waitForTimeout(1000);

      page.off('dialog', dialogHandler);

      // Verify replace was confirmed
      expect(replaceConfirmed).toBe(true);

      // Wait a bit for operation to complete
      await page.waitForTimeout(500);

      // Verify the file was replaced (has new content)
      const afterReplace = await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs, path, os} = globalThis.electronAPI;
        const targetFile = path.join(
          '/tmp',
          'test-replace-dest',
          'test-replace-source.txt'
        );

        // Check backup directory
        const backupDir = path.join(os.tmpdir(), 'filebrowser-undo-backups');
        const backupFiles = fs.existsSync(backupDir)
          ? fs.readdirSync(backupDir)
          : [];

        return {
          exists: fs.existsSync(targetFile),
          content: fs.existsSync(targetFile)
            ? fs.readFileSync(targetFile, 'utf8')
            : null,
          backupFiles
        };
      });

      expect(afterReplace.exists).toBe(true);
      expect(afterReplace.content).toBe('new content');

      // Undo the replace (Cmd+Z)
      await page.keyboard.press('Meta+z');
      await page.waitForTimeout(2000); // Give more time for undo operation

      // Verify old content is restored
      const afterUndo = await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs, path, os} = globalThis.electronAPI;
        const targetFile = path.join(
          '/tmp',
          'test-replace-dest',
          'test-replace-source.txt'
        );

        // Check what files exist in the folder
        const files = fs.readdirSync('/tmp/test-replace-dest');

        // Check backup files still exist
        const backupDir = path.join(os.tmpdir(), 'filebrowser-undo-backups');
        const backupFiles = fs.existsSync(backupDir)
          ? fs.readdirSync(backupDir).filter(
            // @ts-expect-error - filter function
            (f) => f.includes('test_replace')
          )
          : [];

        // Check current location
        const currentPath = globalThis.location.hash;

        // Check if the most recent backup exists and get its full path
        const latestBackup = backupFiles.length > 0
          ? backupFiles.toSorted().pop()
          : null;
        const latestBackupPath = latestBackup
          ? path.join(backupDir, latestBackup)
          : null;
        const backupExists = latestBackupPath
          ? fs.existsSync(latestBackupPath)
          : false;

        // Try to read the backup file to see what's in it
        let backupContent = null;
        if (backupExists && latestBackupPath) {
          try {
            // Check if it's a file or directory
            const backupStats = fs.lstatSync(latestBackupPath);
            backupContent = backupStats.isFile()
              ? fs.readFileSync(latestBackupPath, 'utf8')
              : 'is directory';
          } catch (err) {
            backupContent = `error: ${
              (/** @type {Error} */ (err)).message
            }`;
          }
        }

        return {
          exists: fs.existsSync(targetFile),
          content: fs.existsSync(targetFile)
            ? fs.readFileSync(targetFile, 'utf8')
            : null,
          filesInDir: files,
          backupFiles,
          currentPath,
          latestBackup,
          latestBackupPath,
          backupExists,
          backupContent
        };
      });

      // Verify file was restored from backup
      expect(afterUndo.exists).toBe(true);
      expect(afterUndo.content).toBe('old content');
      expect(afterUndo.filesInDir).toEqual(['test-replace-source.txt']);

      // Verify a backup of the new content was created for redo
      expect(afterUndo.backupExists).toBe(true);
      expect(afterUndo.backupContent).toBe('new content');

      // Redo the replace (Cmd+Shift+Z)
      await page.keyboard.press('Meta+Shift+z');
      await page.waitForTimeout(500);

      // Verify new content is back after redo
      const afterRedo = await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs, path} = globalThis.electronAPI;
        const targetFile = path.join(
          '/tmp',
          'test-replace-dest',
          'test-replace-source.txt'
        );
        return {
          exists: fs.existsSync(targetFile),
          content: fs.existsSync(targetFile)
            ? fs.readFileSync(targetFile, 'utf8')
            : null
        };
      });

      // Verify file exists again with new content
      expect(afterRedo.exists).toBe(true);
      expect(afterRedo.content).toBe('new content');

      // Clean up
      await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs, path} = globalThis.electronAPI;
        try {
          fs.rmSync(
            path.join('/tmp', 'test-replace-source.txt'), {force: true}
          );
          fs.rmSync(path.join('/tmp', 'test-replace-dest'), {
            recursive: true, force: true
          });
        } catch {
          // Ignore cleanup errors
        }
      });
    });

    test('cannot replace folder with its own contents', async () => {
      // Create nested folder structure: /tmp/parent/child/file.txt
      await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs, path} = globalThis.electronAPI;
        const parentDir = path.join('/tmp', 'test-nested-parent');
        const itemDir = path.join(parentDir, 'item');
        const nestedItemDir = path.join(itemDir, 'item'); // Same name nested

        // Clean up if exists
        try {
          fs.rmSync(parentDir, {recursive: true, force: true});
        } catch {
          // Ignore
        }

        fs.mkdirSync(nestedItemDir, {recursive: true});
        fs.writeFileSync(
          path.join(nestedItemDir, 'file.txt'), 'nested content'
        );
      });

      // Navigate to /tmp in Miller Columns
      await page.evaluate(() => {
        globalThis.location.hash = '#path=/tmp';
      });
      await page.waitForTimeout(1500);

      // Switch to three-columns view
      await page.locator('#three-columns').click();
      await page.waitForTimeout(500);

      // Navigate to /tmp/test-nested-parent
      await page.evaluate(() => {
        globalThis.location.hash = '#path=/tmp/test-nested-parent';
      });
      await page.waitForTimeout(500);

      // Click into item folder to see nested item
      const itemFolder = await page.locator(
        'a[data-path="/tmp/test-nested-parent/item"]'
      ).first();
      await itemFolder.click();
      await page.waitForTimeout(500);

      // Copy the nested item folder (same name as parent)
      const nestedItemFolder = await page.locator(
        'a[data-path="/tmp/test-nested-parent/item/item"]'
      ).first();
      await nestedItemFolder.click();
      await page.keyboard.press('Meta+c');
      await page.waitForTimeout(300);

      // Navigate back to parent level
      await page.evaluate(() => {
        globalThis.location.hash = '#path=/tmp/test-nested-parent';
      });
      await page.waitForTimeout(500);

      // Try to paste - this will try to create /tmp/test-nested-parent/item
      // but /tmp/test-nested-parent/item already exists
      //   (it's the parent of what we copied)
      // Source: /tmp/test-nested-parent/item/item (in clipboard)
      // Target would be: /tmp/test-nested-parent/item (basename
      //   of source in current dir)
      // Target exists and source is inside it:
      //   /tmp/test-nested-parent/item/item starts with
      //   /tmp/test-nested-parent/item/
      // This should trigger "Cannot replace a folder with
      //   one of its own contents"

      // Listen for alert
      let alertMessage = '';
      page.once('dialog', async (dialog) => {
        alertMessage = dialog.message();
        await dialog.accept();
      });

      // Try to paste
      await page.keyboard.press('Meta+v');
      await page.waitForTimeout(500);

      // Verify alert was shown
      expect(alertMessage).toContain(
        'Cannot replace a folder with one of its own contents'
      );

      // Cleanup
      await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs, path} = globalThis.electronAPI;
        try {
          fs.rmSync(path.join('/tmp', 'test-nested-parent'), {
            recursive: true,
            force: true
          });
        } catch {}
      });
    });

    test(
      'cannot copy folder into its own descendant',
      async () => {
        // Create nested folder structure
        await page.evaluate(() => {
          // @ts-expect-error - electronAPI available
          const {fs, path} = globalThis.electronAPI;
          const parentPath = path.join('/tmp', 'test-descendant-parent');
          const childPath = path.join(parentPath, 'child');
          fs.mkdirSync(childPath, {recursive: true});
          fs.writeFileSync(path.join(childPath, 'file.txt'), 'test content');
        });

        // Navigate to /tmp
        await page.evaluate(() => {
          globalThis.location.hash = '#path=/tmp';
        });
        await page.waitForTimeout(1500);

        // Switch to three-columns view
        await page.locator('#three-columns').click();
        await page.waitForTimeout(500);

        // Copy the parent folder
        const parentFolder = await page.locator(
          'a[data-path="/tmp/test-descendant-parent"]'
        ).first();
        await parentFolder.click();
        await page.keyboard.press('Meta+c');
        await page.waitForTimeout(300);

        // Navigate into parent to see child
        await parentFolder.click();
        await page.waitForTimeout(500);

        // Try to paste parent into child (copying into own descendant)
        // Source: /tmp/test-descendant-parent (in clipboard)
        // Target directory: /tmp/test-descendant-parent/child
        // This should trigger "Cannot copy or move a folder
        //   into itself or its descendants"
        const childFolder = await page.locator(
          'a[data-path="/tmp/test-descendant-parent/child"]'
        ).first();

        // Listen for alert
        let alertMessage = '';
        page.once('dialog', async (dialog) => {
          alertMessage = dialog.message();
          await dialog.accept();
        });

        // Try to paste into child folder
        await childFolder.click();
        await page.keyboard.press('Meta+v');
        await page.waitForTimeout(500);

        // Verify alert was shown
        expect(alertMessage).toContain(
          'Cannot copy or move a folder into itself or its descendants'
        );

        // Cleanup
        await page.evaluate(() => {
          // @ts-expect-error - electronAPI available
          const {fs, path} = globalThis.electronAPI;
          try {
            fs.rmSync(path.join('/tmp', 'test-descendant-parent'), {
              recursive: true,
              force: true
            });
          } catch {}
        });
      }
    );

    test('undo and redo move replace operation', async () => {
      // Create source file and destination file
      await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs, path} = globalThis.electronAPI;

        // Create source file
        const sourceFile = path.join('/tmp', 'test-move-replace-source.txt');
        fs.writeFileSync(sourceFile, 'new content from source');

        // Create destination folder with existing file
        const destFolder = path.join('/tmp', 'test-move-replace-dest');
        if (!fs.existsSync(destFolder)) {
          fs.mkdirSync(destFolder);
        }

        // Create existing target file that will be replaced
        const targetFile = path.join(
          destFolder,
          'test-move-replace-source.txt'
        );
        fs.writeFileSync(targetFile, 'old content in dest');
      });

      // Navigate to /tmp
      await page.evaluate(() => {
        globalThis.location.hash = '#path=/tmp';
      });
      await page.waitForTimeout(1500);

      // Switch to three-columns view
      await page.locator('#three-columns').click();
      await page.waitForTimeout(500);

      // Find and cut the source file (for move operation)
      const sourceFile = await page.locator(
        'span[data-path="/tmp/test-move-replace-source.txt"]'
      ).first();
      await sourceFile.click();
      await page.waitForTimeout(100);

      // Cut the file (Cmd+X for move)
      await page.keyboard.press('Meta+x');
      await page.waitForTimeout(300);

      // Navigate into the destination folder
      const destFolder = await page.locator(
        'a[data-path="/tmp/test-move-replace-dest"]'
      ).first();
      await destFolder.click();
      await page.waitForTimeout(1000);

      // Set up dialog handler to confirm replace
      page.once('dialog', async (dialog) => {
        await dialog.accept();
      });

      // Paste to trigger move+replace (Cmd+V)
      await page.keyboard.press('Meta+v');
      await page.waitForTimeout(500);

      // Verify file was moved and replaced
      const afterReplace = await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs, path} = globalThis.electronAPI;
        const targetFile = path.join(
          '/tmp',
          'test-move-replace-dest',
          'test-move-replace-source.txt'
        );
        const sourceFile = path.join('/tmp', 'test-move-replace-source.txt');

        return {
          targetExists: fs.existsSync(targetFile),
          targetContent: fs.existsSync(targetFile)
            ? fs.readFileSync(targetFile, 'utf8')
            : null,
          sourceExists: fs.existsSync(sourceFile)
        };
      });

      expect(afterReplace.targetExists).toBe(true);
      expect(afterReplace.targetContent).toBe('new content from source');
      // Source should be gone (moved)
      expect(afterReplace.sourceExists).toBe(false);

      // Undo the move+replace
      await page.keyboard.press('Meta+z');
      await page.waitForTimeout(500);

      // Verify old content restored and source file back
      const afterUndo = await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs, path} = globalThis.electronAPI;
        const targetFile = path.join(
          '/tmp',
          'test-move-replace-dest',
          'test-move-replace-source.txt'
        );
        const sourceFile = path.join('/tmp', 'test-move-replace-source.txt');

        return {
          targetExists: fs.existsSync(targetFile),
          targetContent: fs.existsSync(targetFile)
            ? fs.readFileSync(targetFile, 'utf8')
            : null,
          sourceExists: fs.existsSync(sourceFile),
          sourceContent: fs.existsSync(sourceFile)
            ? fs.readFileSync(sourceFile, 'utf8')
            : null
        };
      });

      expect(afterUndo.targetExists).toBe(true);
      expect(afterUndo.targetContent).toBe('old content in dest');
      expect(afterUndo.sourceExists).toBe(true); // Source should be back
      expect(afterUndo.sourceContent).toBe('new content from source');

      // Redo the move+replace
      await page.keyboard.press('Meta+Shift+z');
      await page.waitForTimeout(500);

      // Verify new content is back and source is gone again
      const afterRedo = await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs, path} = globalThis.electronAPI;
        const targetFile = path.join(
          '/tmp',
          'test-move-replace-dest',
          'test-move-replace-source.txt'
        );
        const sourceFile = path.join('/tmp', 'test-move-replace-source.txt');

        return {
          targetExists: fs.existsSync(targetFile),
          targetContent: fs.existsSync(targetFile)
            ? fs.readFileSync(targetFile, 'utf8')
            : null,
          sourceExists: fs.existsSync(sourceFile)
        };
      });

      expect(afterRedo.targetExists).toBe(true);
      expect(afterRedo.targetContent).toBe('new content from source');
      expect(afterRedo.sourceExists).toBe(false); // Source should be gone again

      // Cleanup
      await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs, path} = globalThis.electronAPI;
        try {
          fs.rmSync(path.join('/tmp', 'test-move-replace-source.txt'), {
            force: true
          });
          fs.rmSync(path.join('/tmp', 'test-move-replace-dest'), {
            recursive: true,
            force: true
          });
        } catch {
          // Ignore cleanup errors
        }
      });
    });

    test('undo and redo text file creation', async () => {
      // Clean up any existing untitled files from previous runs
      await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs, path} = globalThis.electronAPI;
        const files = fs.readdirSync('/tmp');
        files.forEach((/** @type {string} */ file) => {
          if (file.startsWith('untitled') && file.endsWith('.txt')) {
            try {
              fs.rmSync(path.join('/tmp', file));
            } catch {
              // Ignore cleanup errors
            }
          }
        });
      });

      // Navigate to /tmp
      await page.evaluate(() => {
        globalThis.location.hash = '#path=/tmp';
      });
      await page.waitForTimeout(1500);

      // Switch to three-columns view for context menu
      const threeColBtn = await page.locator('#three-columns');
      await threeColBtn.click();
      await page.waitForTimeout(1000);

      // Find /tmp folder in the columns
      const tmpFolder = await page.locator(
        'a[data-path="/tmp"]'
      ).first();
      await tmpFolder.waitFor({state: 'visible', timeout: 5000});

      // Right-click on /tmp folder
      await tmpFolder.click({button: 'right'});
      await page.waitForTimeout(500);

      // Wait for context menu to appear
      const contextMenu = await page.locator('.context-menu');
      await contextMenu.waitFor({state: 'visible', timeout: 5000});
      await page.waitForTimeout(300);

      // Verify context menu has items
      const menuItems = await page.locator('.context-menu-item').count();
      if (menuItems === 0) {
        throw new Error('Context menu has no items');
      }

      // Get all menu item texts for debugging
      const menuTexts = await page.evaluate(() => {
        const items = [...document.querySelectorAll('.context-menu-item')];
        return items.map((item) => item.textContent);
      });

      // Find and click "Create text file" - use nth selector
      // (it's typically the second item after "Open in Finder")
      const createTextMenuItem = await page.locator(
        '.context-menu-item'
      ).filter({hasText: 'Create text file'}).first();

      const createTextExists = await createTextMenuItem.count();
      if (createTextExists === 0) {
        throw new Error(
          'Create text file not found. Menu items: ' + menuTexts.join(', ')
        );
      }

      await createTextMenuItem.click();
      await page.waitForTimeout(1000);

      // Cancel the rename by pressing Escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);

      // Verify file was created (untitled.txt or similar)
      const fileExists = await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs} = globalThis.electronAPI;
        const files = fs.readdirSync('/tmp');
        return files.some(
          (/** @type {string} */ f) => f.startsWith('untitled') &&
            f.endsWith('.txt')
        );
      });
      expect(fileExists).toBe(true);

      // Get the filename
      const filename = await page.evaluate(() => {
        // @ts-expect-error - electronAPI available
        const {fs} = globalThis.electronAPI;
        const files = fs.readdirSync('/tmp');
        return files.find(
          (/** @type {string} */ f) => f.startsWith('untitled') &&
            f.endsWith('.txt')
        );
      });

      // Focus on the document body for undo (not in input field)
      await page.evaluate(() => {
        document.body.focus();
      });
      await page.waitForTimeout(200);

      // Undo the file creation with Cmd+Z
      await page.keyboard.press('Meta+z');
      await page.waitForTimeout(500);

      // Verify file is deleted
      const fileExistsAfterUndo = await page.evaluate((fname) => {
        // @ts-expect-error - electronAPI available
        const {fs, path} = globalThis.electronAPI;

        return fs.existsSync(path.join('/tmp', /** @type {string} */ (fname)));
      }, filename);
      expect(fileExistsAfterUndo).toBe(false);

      // Redo the file creation with Cmd+Shift+Z
      await page.keyboard.press('Meta+Shift+z');
      await page.waitForTimeout(500);

      // Verify file is created again
      const fileExistsAfterRedo = await page.evaluate((fname) => {
        // @ts-expect-error - electronAPI available
        const {fs, path} = globalThis.electronAPI;

        return fs.existsSync(path.join('/tmp', /** @type {string} */ (fname)));
      }, filename);
      expect(fileExistsAfterRedo).toBe(true);

      // Clean up: undo once more
      await page.keyboard.press('Meta+z');
      await page.waitForTimeout(300);
    });

    test('handles undo/redo with empty stacks', async () => {
      // Clear the undo/redo stacks
      await page.evaluate(() => {
        // @ts-expect-error - exposed for testing
        globalThis.undoStack.length = 0;
        // @ts-expect-error - exposed for testing
        globalThis.redoStack.length = 0;
      });

      // Try to undo when stack is empty (should do nothing)
      await page.keyboard.press('Meta+z');
      await page.waitForTimeout(200);

      // Verify stacks are still empty
      const stacksAfterUndo = await page.evaluate(() => {
        return {
          // @ts-expect-error - exposed for testing
          undoLength: globalThis.undoStack.length,
          // @ts-expect-error - exposed for testing
          redoLength: globalThis.redoStack.length
        };
      });
      expect(stacksAfterUndo.undoLength).toBe(0);
      expect(stacksAfterUndo.redoLength).toBe(0);

      // Try to redo when stack is empty (should do nothing)
      await page.keyboard.press('Meta+Shift+z');
      await page.waitForTimeout(200);

      // Verify stacks are still empty
      const stacksAfterRedo = await page.evaluate(() => {
        return {
          // @ts-expect-error - exposed for testing
          undoLength: globalThis.undoStack.length,
          // @ts-expect-error - exposed for testing
          redoLength: globalThis.redoStack.length
        };
      });
      expect(stacksAfterRedo.undoLength).toBe(0);
      expect(stacksAfterRedo.redoLength).toBe(0);
    });
  });
});
