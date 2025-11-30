/* eslint-disable chai-expect-keywords/no-unsupported-keywords -- Not Chai */
import {existsSync, mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
// import {setTimeout} from 'node:timers/promises';
import {expect, test} from '@playwright/test';
import {close, initialize} from './initialize.js';

/** @type {import('./initialize.js').App} */
let app;
test.beforeEach(async () => {
  app = await initialize();
});

test.afterEach(async () => {
  if (app?.main) {
    try {
      // Get V8 coverage from Playwright (renderer process)
      const v8Coverage = await app.main.coverage.stopJSCoverage();

      if (v8Coverage && v8Coverage.length > 0) {
        // Save V8 coverage to coverage/v8
        const v8OutputDir = join(process.cwd(), 'coverage', 'v8');
        // eslint-disable-next-line n/no-sync -- Test cleanup
        if (!existsSync(v8OutputDir)) {
          // eslint-disable-next-line n/no-sync -- Test cleanup
          mkdirSync(v8OutputDir, {recursive: true});
        }

        const timestamp = Date.now();
        // Using random for unique test coverage files (not security-sensitive)
        // eslint-disable-next-line sonarjs/pseudo-random -- Just testing
        const random = Math.random().toString(36).slice(2);
        const v8CoverageFile = join(
          v8OutputDir,
          `coverage-${timestamp}-${random}.json`
        );

        // Save in V8 format
        // eslint-disable-next-line n/no-sync -- Test cleanup
        writeFileSync(
          v8CoverageFile,
          JSON.stringify({result: v8Coverage}, null, 2)
        );
        // eslint-disable-next-line no-console -- Testing
        console.log('V8 coverage files:', v8Coverage.length);
      }
    } catch (error) {
      // eslint-disable-next-line no-console -- Testing
      console.error('Failed to save coverage:', error);
    }
  }
  await close(app);
});

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

test('handles activate event', async () => {
  // See https://playwright.dev/docs/api/class-electronapplication for ElectronApplication documentation.
  await app.electron.evaluate(({
    app: application
  }) => {
    application.emit('activate');
  });

  // You can then assert on the expected behavior after activation
  // For example, if activation brings a window to the front:
  const mainWindow = await app.electron.firstWindow();
  expect(await mainWindow.evaluate(() => document.hasFocus())).toBe(true);
});

test('successfully finds the basic elements of the page', async () => {
  expect(await app.main.locator('i').textContent()).toBe(
    'Waiting for activation...'
  );

  expect(await app.main.locator('i')).toBeHidden();
});
