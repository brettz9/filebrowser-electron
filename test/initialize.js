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
      NODE_ENV: 'test'
    }
  });

  const window = await electronApplication.firstWindow();

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
