// Modules to control application life and create native browser window
// eslint-disable-next-line @stylistic/max-len -- Long
// eslint-disable-next-line n/no-unpublished-import -- electron-forge requires electron as devDep.
import {app, BrowserWindow, ipcMain} from 'electron';

import {fileURLToPath} from 'node:url';

// Load native modules in main process
let openWithMe, parcelWatcher, getIconDataURLForFile;

try {
  openWithMe = await import('open-with-me');
} catch (error) {
  // eslint-disable-next-line no-console -- Main process logging
  console.error('Failed to load open-with-me:', error.message);
}

try {
  parcelWatcher = await import('@parcel/watcher');
} catch (error) {
  // eslint-disable-next-line no-console -- Main process logging
  console.error('Failed to load @parcel/watcher:', error.message);
}

try {
  const iconModule = await import(
    '../src/renderer/utils/getIconDataURLForFile.cjs'
  );
  getIconDataURLForFile =
    iconModule.default || iconModule.getIconDataURLForFile;
} catch (error) {
  // eslint-disable-next-line no-console -- Main process logging
  console.error('Failed to load getIconDataURLForFile:', error.message);
}

// IPC handlers for fs operations
ipcMain.handle('fs:mkdirSync', (_event, ...args) => fs.mkdirSync(...args));
ipcMain.handle('fs:readdirSync', (_event, ...args) => fs.readdirSync(...args));
ipcMain.handle('fs:writeFileSync', (_event, ...args) => fs.writeFileSync(...args));
ipcMain.handle('fs:existsSync', (_event, ...args) => fs.existsSync(...args));
ipcMain.handle('fs:renameSync', (_event, ...args) => fs.renameSync(...args));
ipcMain.handle('fs:lstatSync', (_event, ...args) => {
  const stat = fs.lstatSync(...args);
  // Serialize stat object for IPC (methods don't survive contextBridge)
  return {
    isDirectory: stat.isDirectory(),
    isSymbolicLink: stat.isSymbolicLink()
  };
});
ipcMain.handle('fs:rmSync', (_event, ...args) => fs.rmSync(...args));

// IPC handlers for path operations
ipcMain.handle('path:join', (_event, ...args) => path.join(...args));
ipcMain.handle('path:resolve', (_event, ...args) => path.resolve(...args));
ipcMain.handle('path:dirname', (_event, arg) => path.dirname(arg));
ipcMain.handle('path:basename', (_event, ...args) => path.basename(...args));
ipcMain.handle('path:extname', (_event, arg) => path.extname(arg));
ipcMain.handle('path:normalize', (_event, p) => path.normalize(p));
ipcMain.handle('path:sep', () => path.sep);

// IPC handler for spawnSync
ipcMain.handle('spawnSync', (_event, ...args) => spawnSync(...args));

// IPC handlers for native module functionality
ipcMain.handle('getOpenWithApps', (_event, filePath) => {
  if (!openWithMe?.getOpenWithApps) {
    return [];
  }
  return openWithMe.getOpenWithApps(filePath);
});

ipcMain.handle('getAppIcons', (_event, appPaths) => {
  if (!openWithMe?.getAppIcons) {
    return [];
  }
  return openWithMe.getAppIcons(appPaths);
});

ipcMain.handle('getIconDataURLForFile', (_event, filePath) => {
  if (!getIconDataURLForFile) {
    return null;
  }
  return getIconDataURLForFile(filePath);
});

// File watcher subscriptions stored by ID
const watchers = new Map();
let watcherId = 0;

ipcMain.handle('parcelWatcher:subscribe', async (evt, dir) => {
  if (!parcelWatcher?.subscribe) {
    throw new Error('parcelWatcher not available');
  }

  const id = watcherId++;
  const subscription = await parcelWatcher.subscribe(dir, (err, events) => {
    if (err) {
      evt.sender.send(`parcelWatcher:callback:${id}`, {error: err.message});
    } else {
      evt.sender.send(`parcelWatcher:callback:${id}`, {events});
    }
  });

  watchers.set(id, subscription);
  return id;
});

ipcMain.handle('parcelWatcher:unsubscribe', async (_event, id) => {
  const subscription = watchers.get(id);
  if (subscription) {
    await subscription.unsubscribe();
    watchers.delete(id);
  }
});

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.

/** @type {BrowserWindow|null} */
let mainWindow;

/**
 *
 * @returns {void}
 */
function createWindow () {
  const preloadPath = fileURLToPath(
    new URL('preload.cjs', import.meta.url)
  );

  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 800, height: 600,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      sandbox: false, // Allow preload to access Node.js modules synchronously
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
    import.meta.dirname + '/../index.html'
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
