/* eslint-disable chai-expect-keywords/no-unsupported-keywords -- Not Chai */
import {existsSync} from 'node:fs';
// eslint-disable-next-line no-shadow -- Okimport { existsSync } from 'node:fs'
import {expect, test} from '@playwright/test';
import {_electron as electron} from 'playwright';

test('Successfully launches the app with @playwright/test.', async () => {
  // See https://playwright.dev/docs/api/class-electronapplication for ElectronApplication documentation.
  const electronApplication = await electron.launch({
    args: ['./instrumented/src/main.js', '--no-sandbox']
  });

  const {appPath, isPackaged} = await electronApplication.evaluate(({
    app
  }) => {
    return {appPath: app.getAppPath(), isPackaged: app.isPackaged};
  });

  expect(appPath.endsWith('instrumented/src')).toBe(true);
  expect(isPackaged).toBe(false);

  const initialScreenshotPath = 'test/screenshots/initial.png';

  // eslint-disable-next-line no-shadow -- Ok
  const window = await electronApplication.firstWindow();
  await window.screenshot({path: initialScreenshotPath});

  // eslint-disable-next-line n/no-sync -- Non-deprecated
  expect(existsSync(initialScreenshotPath)).toBe(true);

  // Which title is this as its not being found?
  // expect(await window.title()).toBe('Filebrowser');

  // Route electron console to CLI.
  // eslint-disable-next-line no-console -- Testing
  window.on('console', console.log);

  await electronApplication.close();
});
