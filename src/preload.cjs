/* eslint-disable n/no-sync, n/no-unpublished-require, unicorn/prefer-module,
  @stylistic/max-len -- Preload must use CommonJS */
'use strict';

const {contextBridge, ipcRenderer, shell} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

// With sandbox: false and contextIsolation: true, we can require Node.js modules
// in the preload and expose them synchronously via contextBridge

contextBridge.exposeInMainWorld('electronAPI', {
  fs: {
    mkdirSync: (...args) => fs.mkdirSync(...args),
    readdirSync: (...args) => fs.readdirSync(...args),
    writeFileSync: (...args) => fs.writeFileSync(...args),
    existsSync: (...args) => fs.existsSync(...args),
    renameSync: (...args) => fs.renameSync(...args),
    lstatSync: (...args) => {
      const stat = fs.lstatSync(...args);
      // contextBridge strips methods from objects, so return a plain object
      // with functions that return the method call results
      return {
        isDirectory: () => stat.isDirectory(),
        isSymbolicLink: () => stat.isSymbolicLink(),
        isFile: () => stat.isFile()
      };
    },
    rmSync: (...args) => fs.rmSync(...args)
  },
  path: {
    join: (...args) => path.join(...args),
    resolve: (...args) => path.resolve(...args),
    dirname: (...args) => path.dirname(...args),
    basename: (...args) => path.basename(...args),
    extname: (...args) => path.extname(...args),
    normalize: (p) => path.normalize(p),
    sep: path.sep
  },
  process: {
    platform: process.platform,
    cwd: () => process.cwd(),
    argv: process.argv,
    versions: process.versions
  },
  spawnSync: (...args) => spawnSync(...args),
  shell: {
    openPath: (pathToOpen) => shell.openPath(pathToOpen),
    showItemInFolder: (fullPath) => shell.showItemInFolder(fullPath),
    openExternal: (url) => shell.openExternal(url)
  },
  getOpenWithApps: (filePath) => ipcRenderer.invoke('getOpenWithApps', filePath),
  getAppIcons: (appPaths) => ipcRenderer.invoke('getAppIcons', appPaths),
  getIconDataURLForFile: (filePath) => ipcRenderer.invoke('getIconDataURLForFile', filePath),
  parcelWatcher: {
    subscribe: async (dir, callback) => {
      const watcherId = await ipcRenderer.invoke('parcelWatcher:subscribe', dir);
      const listener = (_event, data) => {
        if (data.error) {
          // eslint-disable-next-line promise/prefer-await-to-callbacks -- API
          callback(new Error(data.error), null);
        } else {
          // eslint-disable-next-line promise/prefer-await-to-callbacks -- API
          callback(null, data.events);
        }
      };
      ipcRenderer.on(`parcelWatcher:callback:${watcherId}`, listener);
      return {
        unsubscribe: async () => {
          ipcRenderer.removeListener(`parcelWatcher:callback:${watcherId}`, listener);
          await ipcRenderer.invoke('parcelWatcher:unsubscribe', watcherId);
        }
      };
    }
  }
});
