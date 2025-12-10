/* eslint-disable chai-expect-keywords/no-unsupported-keywords -- Not Chai */
/* eslint-disable n/no-sync -- Testing */

// @ts-check
import {expect, test} from '@playwright/test';

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
  await coverage({electron, page});
});

describe('fileSystem operations', () => {
  test('mkdir for undo backup directory (lines 21-22)', async () => {
    // Lines 21-22 execute at module initialization when operations.js loads
    // These lines cannot be captured by coverage tools because they execute
    // before renderer coverage starts. However, this test verifies the
    // behavior is correct by confirming the directory exists after init.

    const dirExists = await page.evaluate(() => {
      // @ts-expect-error - electronAPI available
      const {fs, path, os} = globalThis.electronAPI;
      const undoBackupDir = path.join(
        os.tmpdir(),
        'filebrowser-undo-backups'
      );
      return fs.existsSync(undoBackupDir);
    });

    // Directory should exist (lines 21-22 executed during module load)
    expect(dirExists).toBe(true);
  });
});
