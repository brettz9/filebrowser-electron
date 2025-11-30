import {existsSync, mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {_electron} from 'playwright';

/**
 * @typedef {{
 *   electron: import('playwright').ElectronApplication,
 *   page: import('playwright').Page
 * }} App
 */

export const initialize = async () => {
  const electronApplication = await _electron.launch({
    // Sandbox needs to be disabled for CI to work with Linux (Ubuntu).
    args: [join(process.cwd(), 'src/main.js'), '--no-sandbox'],
    env: {
      NODE_ENV: 'test',
      // Gives us v8 (c8-friendly) coverage from `main`
      NODE_V8_COVERAGE: join(process.cwd(), 'coverage', 'v8')
    }
  });

  const window = await electronApplication.firstWindow();

  // Start V8 coverage for renderer process
  await window.coverage.startJSCoverage({
    resetOnNavigation: false
  });

  // eslint-disable-next-line no-console -- Testing
  window.on('console', console.log);

  electronApplication.on('console', (msg) => {
    // eslint-disable-next-line no-console -- Testing
    console.log('[ELECTRON MAIN]:', msg);
  });

  // Capture page errors
  window.on('pageerror', (error) => {
    // eslint-disable-next-line no-console -- Testing
    console.error('[PAGE ERROR]:', error.message, error.stack);
  });

  return {
    electron: electronApplication,
    page: window
  };
};

/**
 * @param {App} app
 */
const close = async (app) => {
  await app.electron.close();
};

/**
 * @param {App} app
 */
export const coverage = async (app) => {
  try {
    // Get V8 coverage from Playwright (renderer process)
    const v8Coverage = await app.page.coverage.stopJSCoverage();

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
      // // eslint-disable-next-line no-console -- Testing
      // console.log('V8 coverage files:', v8Coverage.length);
    }
  } catch (error) {
    // eslint-disable-next-line no-console -- Testing
    console.error('Failed to save coverage:', error);
  }

  await close(app);
};
