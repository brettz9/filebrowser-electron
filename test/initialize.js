import {join} from 'node:path';
import {_electron} from 'playwright';

/**
 * @typedef {{
 *   electron: import('playwright').ElectronApplication,
 *   main: import('playwright').Page
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

  return {
    electron: electronApplication,
    main: window
  };
};

/**
 * @param {App} app
 */
export const close = async (app) => {
  await app.electron.close();
};
