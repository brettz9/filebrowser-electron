/* eslint-disable chai-expect-keywords/no-unsupported-keywords -- Not Chai */

import {test, expect} from '@playwright/test';
import {initialize, coverage} from './utils/initialize.js';

const {
  afterEach, beforeEach, describe
} = test;

describe('renderer', () => {
  /** @type {import('@playwright/test').ElectronApplication} */
  let electron;
  /** @type {import('@playwright/test').Page} */
  let page;

  beforeEach(async () => {
    ({electron, page} = await initialize());
  });

  afterEach(async () => {
    await coverage({electron, page});
  });

  describe('navigation shortcuts', () => {
    test('Shift+Cmd+H navigates to Home in icon-view', async () => {
      // Switch to icon-view
      await page.locator('#icon-view').click();
      await page.waitForSelector('table[data-base-path]', {state: 'visible'});
      await page.waitForTimeout(500);

      // Get home directory
      const homeDir = await page.evaluate(() => {
        // @ts-expect-error - os available
        return globalThis.electronAPI.os.homedir();
      });

      // Focus the table and press shortcut
      const table = await page.locator('table[data-base-path]');
      await table.focus();

      // Press Shift+Cmd+H
      await page.keyboard.press('Shift+Meta+h');
      await page.waitForTimeout(500);

      // Verify we navigated to home directory
      const currentPath = await page.evaluate(() => {
        return decodeURIComponent(
          globalThis.location.hash.replace('#path=', '')
        );
      });

      expect(currentPath).toBe(homeDir);
    });

    test('Shift+Cmd+D navigates to Desktop in icon-view', async () => {
      // Switch to icon-view
      await page.locator('#icon-view').click();
      await page.waitForTimeout(500);

      // Get Desktop directory
      const desktopDir = await page.evaluate(() => {
        // @ts-expect-error - os and path available
        return globalThis.electronAPI.path.join(
          // @ts-expect-error - electronAPI available via preload
          globalThis.electronAPI.os.homedir(),
          'Desktop'
        );
      });

      const table = await page.locator('table[data-base-path]');
      await table.focus();

      await page.keyboard.press('Shift+Meta+d');
      await page.waitForTimeout(500);

      const currentPath = await page.evaluate(() => {
        return decodeURIComponent(
          globalThis.location.hash.replace('#path=', '')
        );
      });

      expect(currentPath).toBe(desktopDir);
    });

    test('Shift+Cmd+A navigates to Applications in icon-view', async () => {
      // Switch to icon-view
      await page.locator('#icon-view').click();
      await page.waitForSelector('table[data-base-path]', {state: 'visible'});
      await page.waitForTimeout(500);

      const table = await page.locator('table[data-base-path]');
      await table.focus();

      await page.keyboard.press('Shift+Meta+a');
      await page.waitForTimeout(500);

      const currentPath = await page.evaluate(() => {
        return decodeURIComponent(
          globalThis.location.hash.replace('#path=', '')
        );
      });

      expect(currentPath).toBe('/Applications');
    });

    test('Shift+Cmd+U navigates to Utilities in icon-view', async () => {
      // Switch to icon-view
      await page.locator('#icon-view').click();
      await page.waitForSelector('table[data-base-path]', {state: 'visible'});
      await page.waitForTimeout(500);

      const table = await page.locator('table[data-base-path]');
      await table.focus();

      await page.keyboard.press('Shift+Meta+u');
      await page.waitForTimeout(500);

      const currentPath = await page.evaluate(() => {
        return decodeURIComponent(
          globalThis.location.hash.replace('#path=', '')
        );
      });

      expect(currentPath).toBe('/Applications/Utilities');
    });

    test('Shift+Cmd+H navigates to Home in three-columns', async () => {
      // Switch to three-columns view
      await page.locator('#three-columns').click();
      await page.waitForSelector('div.miller-columns', {state: 'visible'});
      await page.waitForTimeout(500);

      const homeDir = await page.evaluate(() => {
        // @ts-expect-error - os available
        return globalThis.electronAPI.os.homedir();
      });

      const millerColumns = await page.locator('div.miller-columns');
      await millerColumns.focus();

      await page.keyboard.press('Shift+Meta+h');
      await page.waitForTimeout(500);

      const currentPath = await page.evaluate(() => {
        return decodeURIComponent(
          globalThis.location.hash.replace('#path=', '')
        );
      });

      expect(currentPath).toBe(homeDir);
    });

    test('Shift+Cmd+D navigates to Desktop in three-columns', async () => {
      await page.locator('#three-columns').click();
      await page.waitForTimeout(500);

      const desktopDir = await page.evaluate(() => {
        // @ts-expect-error - os and path available
        return globalThis.electronAPI.path.join(
          // @ts-expect-error - electronAPI available via preload
          globalThis.electronAPI.os.homedir(),
          'Desktop'
        );
      });

      const millerColumns = await page.locator('div.miller-columns');
      await millerColumns.focus();

      await page.keyboard.press('Shift+Meta+d');
      await page.waitForTimeout(500);

      const currentPath = await page.evaluate(() => {
        return decodeURIComponent(
          globalThis.location.hash.replace('#path=', '')
        );
      });

      expect(currentPath).toBe(desktopDir);
    });

    test('Shift+Cmd+A navigates to Applications in three-columns', async () => {
      await page.locator('#three-columns').click();
      await page.waitForSelector('div.miller-columns', {state: 'visible'});
      await page.waitForTimeout(500);

      const millerColumns = await page.locator('div.miller-columns');
      await millerColumns.focus();

      await page.keyboard.press('Shift+Meta+a');
      await page.waitForTimeout(500);

      const currentPath = await page.evaluate(() => {
        return decodeURIComponent(
          globalThis.location.hash.replace('#path=', '')
        );
      });

      expect(currentPath).toBe('/Applications');
    });

    test('Shift+Cmd+U navigates to Utilities in three-columns', async () => {
      await page.locator('#three-columns').click();
      await page.waitForSelector('div.miller-columns', {state: 'visible'});
      await page.waitForTimeout(500);

      const millerColumns = await page.locator('div.miller-columns');
      await millerColumns.focus();

      await page.keyboard.press('Shift+Meta+u');
      await page.waitForTimeout(500);

      const currentPath = await page.evaluate(() => {
        return decodeURIComponent(
          globalThis.location.hash.replace('#path=', '')
        );
      });

      expect(currentPath).toBe('/Applications/Utilities');
    });

    test('Cmd+[ goes back in history in icon-view', async () => {
      // Switch to icon-view
      await page.locator('#icon-view').click();
      await page.waitForSelector('table[data-base-path]', {state: 'visible'});
      await page.waitForTimeout(500);

      // Navigate to Applications
      await page.evaluate(() => {
        globalThis.location.hash = '#path=/Applications';
      });
      await page.waitForTimeout(500);

      // Navigate to Utilities
      await page.evaluate(() => {
        globalThis.location.hash = '#path=/Applications/Utilities';
      });
      await page.waitForTimeout(500);

      const table = await page.locator('table[data-base-path]');
      await table.focus();

      // Press Cmd+[ to go back
      await page.keyboard.press('Meta+[');
      await page.waitForTimeout(500);

      const currentPath = await page.evaluate(() => {
        return decodeURIComponent(
          globalThis.location.hash.replace('#path=', '')
        );
      });

      expect(currentPath).toBe('/Applications');
    });

    test('Cmd+] goes forward in history in icon-view', async () => {
      // Switch to icon-view
      await page.locator('#icon-view').click();
      await page.waitForSelector('table[data-base-path]', {state: 'visible'});
      await page.waitForTimeout(500);

      // Navigate to Applications
      await page.evaluate(() => {
        globalThis.location.hash = '#path=/Applications';
      });
      await page.waitForTimeout(500);

      // Navigate to Utilities
      await page.evaluate(() => {
        globalThis.location.hash = '#path=/Applications/Utilities';
      });
      await page.waitForTimeout(500);

      const table = await page.locator('table[data-base-path]');
      await table.focus();

      // Go back first
      await page.keyboard.press('Meta+[');
      await page.waitForTimeout(500);

      // Now press Cmd+] to go forward
      await page.keyboard.press('Meta+]');
      await page.waitForTimeout(500);

      const currentPath = await page.evaluate(() => {
        return decodeURIComponent(
          globalThis.location.hash.replace('#path=', '')
        );
      });

      expect(currentPath).toBe('/Applications/Utilities');
    });

    test('Cmd+[ goes back in history in three-columns', async () => {
      // Switch to three-columns view
      await page.locator('#three-columns').click();
      await page.waitForSelector('div.miller-columns', {state: 'visible'});
      await page.waitForTimeout(500);

      // Navigate to Applications
      await page.evaluate(() => {
        globalThis.location.hash = '#path=/Applications';
      });
      await page.waitForTimeout(500);

      // Navigate to Utilities
      await page.evaluate(() => {
        globalThis.location.hash = '#path=/Applications/Utilities';
      });
      await page.waitForTimeout(500);

      const millerColumns = await page.locator('div.miller-columns');
      await millerColumns.focus();

      // Press Cmd+[ to go back
      await page.keyboard.press('Meta+[');
      await page.waitForTimeout(500);

      const currentPath = await page.evaluate(() => {
        return decodeURIComponent(
          globalThis.location.hash.replace('#path=', '')
        );
      });

      expect(currentPath).toBe('/Applications');
    });

    test('Cmd+] goes forward in history in three-columns', async () => {
      // Switch to three-columns view
      await page.locator('#three-columns').click();
      await page.waitForSelector('div.miller-columns', {state: 'visible'});
      await page.waitForTimeout(500);

      // Navigate to Applications
      await page.evaluate(() => {
        globalThis.location.hash = '#path=/Applications';
      });
      await page.waitForTimeout(500);

      // Navigate to Utilities
      await page.evaluate(() => {
        globalThis.location.hash = '#path=/Applications/Utilities';
      });
      await page.waitForTimeout(500);

      const millerColumns = await page.locator('div.miller-columns');
      await millerColumns.focus();

      // Go back first
      await page.keyboard.press('Meta+[');
      await page.waitForTimeout(500);

      // Now press Cmd+] to go forward
      await page.keyboard.press('Meta+]');
      await page.waitForTimeout(500);

      const currentPath = await page.evaluate(() => {
        return decodeURIComponent(
          globalThis.location.hash.replace('#path=', '')
        );
      });

      expect(currentPath).toBe('/Applications/Utilities');
    });
  });
});
