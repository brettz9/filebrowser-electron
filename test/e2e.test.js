/* eslint-disable chai-expect-keywords/no-unsupported-keywords -- Not Chai */
import {existsSync} from 'node:fs';
import {expect, test} from '@playwright/test';
import {close, initialize} from './initialize.js';

/** @type {import('./initialize.js').App} */
let app;
test.beforeEach(async () => {
  app = await initialize();
});

test.afterEach(async () => await close(app));

test('Successfully launches the app with @playwright/test.', async () => {
  // See https://playwright.dev/docs/api/class-electronapplication for ElectronApplication documentation.
  const {appPath, isPackaged} = await app.electron.evaluate(({
    app: application
  }) => {
    return {
      appPath: application.getAppPath(),
      isPackaged: application.isPackaged
    };
  });

  expect(appPath.endsWith('src')).toBe(true);
  expect(isPackaged).toBe(false);

  const initialScreenshotPath = 'test/screenshots/initial.png';

  const window = await app.electron.firstWindow();
  await window.screenshot({path: initialScreenshotPath});

  // eslint-disable-next-line n/no-sync -- Non-deprecated
  expect(existsSync(initialScreenshotPath)).toBe(true);

  // Which title is this as its not being found?
  // expect(await window.title()).toBe('Filebrowser');
});

test('successfully finds the basic elements of the page', async () => {
  expect(await app.main.locator('i').textContent()).toBe(
    'Waiting for activation...'
  );

  expect(await app.main.locator('i')).toBeHidden();
});
