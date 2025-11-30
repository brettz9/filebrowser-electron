/* eslint-disable chai-expect-keywords/no-unsupported-keywords -- Not Chai */
import {existsSync} from 'node:fs';
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
  return await coverage({electron, page});
});

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

  // describe('stickies (global)', () => {
  //   test('creates a global sticky and retains it upon refresh', async () => {
  //     expect(await page.locator('button#create-global-sticky'));
  //   });
  // });
});
