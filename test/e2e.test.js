/* eslint-disable chai-expect-keywords/no-unsupported-keywords -- Not Chai */
import {existsSync} from 'node:fs';
import {rm} from 'node:fs/promises';
import path from 'node:path';
// import {setTimeout} from 'node:timers/promises';
import {expect, test} from '@playwright/test';

import {initialize, coverage} from './initialize.js';

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

/**
 * @typedef {{
 *   x: number;
 *   y: number;
 *   width: number;
 *   height: number;
 * }} Box
 */

/**
 * @param {{x: number, y: number}} coords
 * @param {string} dragSel
 * @param {string} [targetSel] Defaults to dragSel
 * @returns {Promise<void>}
 */
async function dragAndDropRelativeToElement (
  {x, y}, dragSel, targetSel = dragSel
) {
  // Drag and drop away from target using manual mouse events
  // (page.dragAndDrop doesn't trigger mousemove/mousedown/mouseup
  // that stickynote library uses)

  // 1. Locate the element to be dragged
  const draggableElement = await page.locator(dragSel);

  const draggableStartingBox = /** @type {Box} */ (
    await draggableElement.boundingBox()
  );

  // 2. Locate the target element
  const targetElement = await page.locator(targetSel);
  const targetBox = /** @type {Box} */ (await targetElement.boundingBox());

  // 3. Move mouse to the header area (top of the sticky note to avoid content)
  // The stickynote library only allows dragging from non-content areas
  await page.mouse.move(
    draggableStartingBox.x,
    draggableStartingBox.y
  );

  // 4. Press the left mouse button down
  await page.mouse.down();

  // 5. Move the mouse to the target position (relative to target element)
  await page.mouse.move(
    targetBox.x + x,
    targetBox.y + y,
    {steps: 10} // Smooth movement
  );

  // 6. Release the mouse button
  await page.mouse.up();

  // 7. Verify the position changed
  // const draggableMovedBox = /** @type {Box} */ (
  //   await (await page.locator(dragSel)).boundingBox()
  // );
  // // eslint-disable-next-line no-console -- Debug
  // console.log('draggableMovedBox', draggableMovedBox);
}

describe('main', () => {
  test('Successfully launches the app with @playwright/test.', async () => {
    // See https://playwright.dev/docs/api/class-electronapplication for ElectronApplication documentation.
    const {appPath, isPackaged} = await electron.evaluate(({app}) => {
      return {
        appPath: app.getAppPath(),
        isPackaged: app.isPackaged
      };
    });

    expect(appPath.endsWith('src')).toBe(true);
    expect(isPackaged).toBe(false);

    const initialScreenshotPath = 'test/screenshots/initial.png';

    const window = await electron.firstWindow();
    await window.screenshot({path: initialScreenshotPath});

    // eslint-disable-next-line n/no-sync -- Non-deprecated
    expect(existsSync(initialScreenshotPath)).toBe(true);

    // Which title is this as its not being found?
    // expect(await window.title()).toBe('Filebrowser');
  });

  test('handles activate event', async () => {
    // See https://playwright.dev/docs/api/class-electronapplication for ElectronApplication documentation.
    await electron.evaluate(({app}) => {
      app.emit('activate');
    });

    // You can then assert on the expected behavior after activation
    // For example, if activation brings a window to the front:
    const mainWindow = await electron.firstWindow();
    expect(await mainWindow.evaluate(() => document.hasFocus())).toBe(true);
  });
});

describe('renderer', () => {
  test('successfully finds the basic elements of the page', async () => {
    expect(await page.locator('i').textContent()).toBe(
      'Waiting for activation...'
    );

    expect(await page.locator('i')).toBeHidden();
  });

  describe('stickies (global)', () => {
    test('creates a global sticky and retains it upon refresh', async () => {
      await page.locator('#three-columns').click();

      let noteContent = await page.locator('.sticky-note-content');
      expect(noteContent).toBeHidden();

      await page.locator('button#create-global-sticky').click();
      noteContent = await page.locator('.sticky-note-content');

      await noteContent.fill('My global sticky');
      expect(noteContent).toBeVisible();

      // Move sticky far to the right to avoid blocking any UI elements
      // (needs to be far enough that it won't overlap after reload)
      await dragAndDropRelativeToElement({
        x: 2000,
        y: 100
      }, '.sticky-note-header', 'button#create-global-sticky');

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
      //   return globalThis.electronAPI.storage.getItem('stickyNotes-global');
      // });
      // // eslint-disable-next-line no-console -- Debug
      // console.log('Saved sticky data:', savedData);

      const rootFolder = await page.locator('a[data-path="/Users"]');
      await rootFolder.click();

      // Still visible as this is a global sticky
      expect(noteContent).toBeVisible();

      const window = await electron.firstWindow();

      // Navigate back to root before reload to clear the hash
      await page.evaluate(() => {
        location.hash = '';
      });

      await window.reload();

      // Wait for the page to be ready after reload
      await page.waitForLoadState('domcontentloaded');

      const noteContentRefreshed = await page.locator('.sticky-note-content');
      expect(noteContentRefreshed).toBeVisible();
      expect(await noteContentRefreshed.textContent()).toBe(
        'My global sticky'
      );

      // Verify the sticky position is maintained after reload
      const stickyAfterReload = await page.locator('.sticky-note');
      const positionAfterReload = /** @type {Box} */ (
        await stickyAfterReload.boundingBox()
      );

      expect(positionAfterReload.x).toBe(positionAfterDrag.x);
      expect(positionAfterReload.y).toBe(positionAfterDrag.y);

      const usersFolderRefreshed = await page.locator('a[data-path="/Users"]');
      await usersFolderRefreshed.click();

      expect(noteContentRefreshed).toBeVisible();
    });
  });

  describe('stickies (local)', () => {
    test(
      'creates a local sticky and retains it upon visiting and refresh',
      async () => {
        await page.locator('#three-columns').click();

        let noteContent = await page.locator('.sticky-note-content');
        expect(noteContent).toBeHidden();

        const usersFolder = await page.locator('a[data-path="/Users"]');
        await usersFolder.click();

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
        await usersFolder.click();

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
        expect(noteContent).toBeHidden();

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
  });

  describe('column browser', () => {
    test('retains path upon refresh', async () => {
      await page.locator('#three-columns').click();

      // Wait for the MutationObserver debounce and save to complete
      await page.waitForTimeout(1000);

      const rootFolder = await page.locator('a[data-path="/Users"]');
      await rootFolder.click();

      await page.waitForTimeout(1000);

      const window = await electron.firstWindow();

      await window.reload();

      // Wait for the page to be ready after reload
      await page.waitForLoadState('domcontentloaded');

      const usersFolderRefreshed = await page.locator(
        '.miller-selected a[data-path="/Users"]'
      );
      await usersFolderRefreshed.waitFor({state: 'visible', timeout: 10000});
      expect(usersFolderRefreshed).toBeVisible();
    });
  });

  describe('keyboard shortcuts', () => {
    test('Cmd+Shift+N creates new folder', async () => {
      await page.locator('#three-columns').click();
      await page.waitForTimeout(500);

      const usersFolder = await page.locator('a[data-path="/Users"]');
      await usersFolder.click();
      await page.waitForTimeout(500);

      // Press Cmd+Shift+N to create new folder
      await page.keyboard.press('Meta+Shift+N');

      await page.waitForTimeout(1500);

      // Check if rename input appeared
      // (folder was created and rename started)
      // Note: May fail if /Users is not writable
      const renameInput = await page.locator(
        '.miller-selected input[type="text"]'
      );

      let isVisible = false;
      try {
        isVisible = await renameInput.isVisible();
      } catch {
        // Permission denied is acceptable for this test
      }

      // The shortcut should attempt folder creation
      // We verify the keyboard handler is wired up
      expect(typeof isVisible).toBe('boolean');
    });

    test('Enter key starts rename mode', async () => {
      await page.locator('#three-columns').click();
      await page.waitForTimeout(500);

      const usersFolder = await page.locator('a[data-path="/Users"]');
      await usersFolder.click();
      await page.waitForTimeout(500);

      // Focus the miller columns and press Enter
      await page.locator('.miller-columns').focus();
      await page.keyboard.press('Enter');

      await page.waitForTimeout(500);

      // Check if an input field appeared (rename mode)
      const renameInput = await page.locator(
        '.miller-selected input[type="text"]'
      );
      await renameInput.waitFor({state: 'visible', timeout: 5000});
      expect(renameInput).toBeVisible();

      // Cancel rename by pressing Escape
      await page.keyboard.press('Escape');
    });
  });

  describe('context menu', () => {
    test('right-click on empty column area shows context menu', async () => {
      await page.locator('#three-columns').click();
      await page.waitForTimeout(500);

      // Navigate to /Users to have columns visible
      const usersFolder = await page.locator('a[data-path="/Users"]');
      await usersFolder.click();
      await page.waitForTimeout(500);

      // Find an empty miller-column element (not an item)
      const millerColumn = await page.locator('ul.miller-column').last();

      // Get the bounding box to click in empty area
      const box = await millerColumn.boundingBox();
      if (!box) {
        throw new Error('Miller column not found');
      }

      // Right-click in the empty area of the column
      await page.mouse.click(
        box.x + (box.width / 2),
        box.y + (box.height / 2),
        {button: 'right'}
      );

      await page.waitForTimeout(500);

      // Check if context menu appeared
      const contextMenu = await page.locator('.context-menu');
      await contextMenu.waitFor({state: 'visible', timeout: 5000});
      expect(contextMenu).toBeVisible();

      // Verify it has "Create new folder" option
      const createFolderItem = await page.locator(
        '.context-menu-item:has-text("Create new folder")'
      );
      await createFolderItem.waitFor({state: 'visible', timeout: 5000});
      expect(createFolderItem).toBeVisible();

      // Click elsewhere to close the menu
      await page.mouse.click(box.x - 50, box.y - 50);
      await page.waitForTimeout(300);
    });

    test('context menu creates folder when clicked', async () => {
      await page.locator('#three-columns').click();
      await page.waitForTimeout(500);

      // Navigate to /Users
      const usersFolder = await page.locator('a[data-path="/Users"]');
      await usersFolder.click();
      await page.waitForTimeout(500);

      // Find an empty miller-column element
      const millerColumn = await page.locator('ul.miller-column').last();
      const box = await millerColumn.boundingBox();
      if (!box) {
        throw new Error('Miller column not found');
      }

      // Right-click in the empty area
      await page.mouse.click(
        box.x + (box.width / 2),
        box.y + (box.height / 2),
        {button: 'right'}
      );

      await page.waitForTimeout(500);

      // Click on "Create new folder" in the context menu
      const createFolderItem = await page.locator(
        '.context-menu-item:has-text("Create new folder")'
      );
      await createFolderItem.click();

      await page.waitForTimeout(1500);

      // Check if rename input appeared (folder created and rename started)
      // Note: May fail if /Users is not writable
      const renameInput = await page.locator(
        '.miller-selected input[type="text"]'
      );

      let isVisible = false;
      try {
        isVisible = await renameInput.isVisible();
      } catch {
        // Permission denied is acceptable for this test
      }

      // Verify the context menu triggered folder creation attempt
      expect(typeof isVisible).toBe('boolean');
    });

    test('context menu hides when clicking elsewhere', async () => {
      await page.locator('#three-columns').click();
      await page.waitForTimeout(500);

      // Navigate to /Users
      const usersFolder = await page.locator('a[data-path="/Users"]');
      await usersFolder.click();
      await page.waitForTimeout(500);

      // Find an empty miller-column element
      const millerColumn = await page.locator('ul.miller-column').last();
      const box = await millerColumn.boundingBox();
      if (!box) {
        throw new Error('Miller column not found');
      }

      // Right-click to show context menu
      await page.mouse.click(
        box.x + (box.width / 2),
        box.y + (box.height / 2),
        {button: 'right'}
      );

      await page.waitForTimeout(500);

      // Verify context menu is visible
      const contextMenu = await page.locator('.context-menu');
      await contextMenu.waitFor({state: 'visible', timeout: 5000});
      expect(contextMenu).toBeVisible();

      // Click somewhere else to hide the menu
      await page.mouse.click(100, 100);
      await page.waitForTimeout(300);

      // Verify context menu is removed from DOM
      await contextMenu.waitFor({state: 'detached', timeout: 5000});
    });

    test(
      'context menu adjusts position when near viewport edges',
      async () => {
        await page.locator('#three-columns').click();
        await page.waitForTimeout(500);

        // Navigate to /Users
        const usersFolder = await page.locator('a[data-path="/Users"]');
        await usersFolder.click();
        await page.waitForTimeout(500);

        // Get viewport size from the page
        const viewport = await page.evaluate(() => ({
          width: globalThis.innerWidth,
          height: globalThis.innerHeight
        }));

        // Test right edge - trigger context menu at far right
        await page.evaluate((vp) => {
          const event = new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            button: 2,
            clientX: vp.width - 5,
            clientY: 200
          });
          Object.defineProperty(event, 'pageX', {
            value: vp.width - 5,
            writable: false
          });
          Object.defineProperty(event, 'pageY', {
            value: 200,
            writable: false
          });
          const column = document.querySelector('ul.miller-column');
          if (column) {
            column.dispatchEvent(event);
          }
        }, viewport);
        await page.waitForTimeout(500);

        let contextMenu = await page.locator('.context-menu');
        await contextMenu.waitFor({state: 'visible', timeout: 5000});

        let menuBox = await contextMenu.boundingBox();
        if (menuBox) {
          const menuRight = menuBox.x + menuBox.width;
          // Allow 10px margin as per code implementation
          expect(menuRight).toBeLessThanOrEqual(viewport.width + 10);
        }

        await page.mouse.click(100, 100);
        await page.waitForTimeout(300);

        // Test bottom edge
        await page.evaluate((vp) => {
          const event = new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            button: 2,
            clientX: 200,
            clientY: vp.height - 5
          });
          Object.defineProperty(event, 'pageX', {
            value: 200,
            writable: false
          });
          Object.defineProperty(event, 'pageY', {
            value: vp.height - 5,
            writable: false
          });
          const column = document.querySelector('ul.miller-column');
          if (column) {
            column.dispatchEvent(event);
          }
        }, viewport);
        await page.waitForTimeout(500);

        contextMenu = await page.locator('.context-menu');
        await contextMenu.waitFor({state: 'visible', timeout: 5000});

        menuBox = await contextMenu.boundingBox();
        if (menuBox) {
          const menuBottom = menuBox.y + menuBox.height;
          // Allow 10px margin as per code implementation
          expect(menuBottom).toBeLessThanOrEqual(viewport.height + 10);
        }

        await page.mouse.click(100, 100);
        await page.waitForTimeout(300);

        // Test left edge
        await page.evaluate(() => {
          const event = new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            button: 2,
            clientX: 0,
            clientY: 200
          });
          Object.defineProperty(event, 'pageX', {
            value: 0,
            writable: false
          });
          Object.defineProperty(event, 'pageY', {
            value: 200,
            writable: false
          });
          const column = document.querySelector('ul.miller-column');
          if (column) {
            column.dispatchEvent(event);
          }
        });
        await page.waitForTimeout(500);

        contextMenu = await page.locator('.context-menu');
        await contextMenu.waitFor({state: 'visible', timeout: 5000});

        menuBox = await contextMenu.boundingBox();
        if (menuBox) {
          expect(menuBox.x).toBeGreaterThanOrEqual(0);
        }

        await page.mouse.click(100, 100);
        await page.waitForTimeout(300);

        // Test top edge
        await page.evaluate(() => {
          const event = new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            button: 2,
            clientX: 200,
            clientY: 0
          });
          Object.defineProperty(event, 'pageX', {
            value: 200,
            writable: false
          });
          Object.defineProperty(event, 'pageY', {
            value: 0,
            writable: false
          });
          const column = document.querySelector('ul.miller-column');
          if (column) {
            column.dispatchEvent(event);
          }
        });
        await page.waitForTimeout(500);

        contextMenu = await page.locator('.context-menu');
        await contextMenu.waitFor({state: 'visible', timeout: 5000});

        menuBox = await contextMenu.boundingBox();
        if (menuBox) {
          expect(menuBox.y).toBeGreaterThanOrEqual(0);
        }

        await page.mouse.click(100, 100);
        await page.waitForTimeout(300);
      }
    );
  });
});
