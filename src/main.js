// Modules to control application life and create native browser window
// eslint-disable-next-line @stylistic/max-len -- Long
// eslint-disable-next-line n/no-unpublished-import -- electron-forge requires electron as devDep.
import {app, BrowserWindow} from 'electron';

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.

/** @type {BrowserWindow|null} */
let mainWindow;

/**
 *
 * @returns {void}
 */
function createWindow () {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 800, height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      additionalArguments: process.argv
    }
  });

  // Set the headers for the main window's webContents
  mainWindow.webContents.session.webRequest.onHeadersReceived(
    // eslint-disable-next-line promise/prefer-await-to-callbacks -- API
    (details, callback) => {
      // eslint-disable-next-line promise/prefer-await-to-callbacks -- API
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Cross-Origin-Opener-Policy': ['same-origin'],
          'Cross-Origin-Embedder-Policy': ['require-corp']
        }
      });
    }
  );

  // and load the index.html of the app.
  mainWindow.loadFile(
    // eslint-disable-next-line n/no-process-env -- Customary
    process.env.NODE_ENV === 'test'
      ? import.meta.dirname + '/../index.instrumented.html'
      /* c8 ignore next -- Not testing */
      : import.meta.dirname + '/../index.html'
  );

  // Open the DevTools.
  // mainWindow.webContents.openDevTools()

  // Emitted when the window is closed.
  mainWindow.on('closed', function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null;
  });
}

// Quit when all windows are closed.
app.on('window-all-closed', function () {
  /* c8 ignore next 5 -- Mac testing envt */
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// eslint-disable-next-line @stylistic/max-len -- Long
// eslint-disable-next-line unicorn/prefer-top-level-await -- Electron main process requires IIFE wrapper
(async () => {
// Some APIs can only be used after this event occurs.
await app.whenReady();
createWindow();

app.on('activate', function () {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  /* c8 ignore next 3 -- Not null in tests */
  if (mainWindow === null) {
    createWindow();
  }
});
})();

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
