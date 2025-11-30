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

      const rootFolderRefreshed = await page.locator('a[data-path="/Users"]');
      await rootFolderRefreshed.click();

      expect(noteContentRefreshed).toBeVisible();
    });
  });

  test.skip(
    'creates a local sticky and retains it upon visiting and refresh', () => {
      // TODO: Implement test
    }
  );
});
