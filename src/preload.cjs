/* eslint-disable n/no-sync, n/no-unpublished-require, unicorn/prefer-module,
  @stylistic/max-len -- Preload must use CommonJS */
// @ts-nocheck Too many APIs and not much else
'use strict';

const {contextBridge, ipcRenderer, shell} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawnSync} = require('node:child_process');
const mdls = require('mdls-ts');

// Try to directly load the native binding for mdls-ts
let mdlsNative = null;
try {
  const mdlsPath = require.resolve('mdls-ts');
  const mdlsDir = path.dirname(mdlsPath);
  const nativePath = path.join(mdlsDir, 'build', 'Release', 'mdls_native.node');
  mdlsNative = require(nativePath);
  console.log('Successfully loaded native mdls binding directly');
} catch (err) {
  console.log('Failed to load native mdls binding:', err.message);
}

// With sandbox: false and contextIsolation: true, we can require Node.js modules
// in the preload and expose them synchronously via contextBridge

contextBridge.exposeInMainWorld('electronAPI', {
  fs: {
    mkdirSync: (...args) => fs.mkdirSync(...args),
    readdirSync: (...args) => fs.readdirSync(...args),
    readFileSync: (...args) => fs.readFileSync(...args),
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
        isFile: () => stat.isFile(),
        mtimeMs: stat.mtimeMs,
        birthtimeMs: stat.birthtimeMs,
        size: stat.size
      };
    },
    rmSync: (...args) => fs.rmSync(...args),
    realpathSync: (...args) => fs.realpathSync(...args)
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
  os: {
    tmpdir: () => os.tmpdir()
  },
  process: {
    platform: process.platform,
    cwd: () => process.cwd(),
    argv: process.argv,
    versions: process.versions
  },
  spawnSync: (...args) => spawnSync(...args),
  getFileMetadata: (filePath) => {
    const metadata = mdls.mdlsSync(
      filePath,
      '-name kMDItemLastUsedDate -name kMDItemDateAdded -name kMDItemVersion -name kMDItemFinderComment'
    );

    console.log('metadata', metadata);

    // This returns an object like:
    // {
    //   ItemLastUsedDate: Date | null,
    //   ItemDateAdded: Date | null,
    //   ItemVersion: string | null,
    //   ItemFinderComment: string | null
    // }
    return metadata;
  },
  getFileKind: (filePath) => {
    // Get the "Kind" string as shown in Finder (e.g., "Folder", "PNG Image")
    try {
      // Get the UTI (Uniform Type Identifier) for the file
      const uti = mdlsNative ? mdlsNative.getUTI(filePath) : mdls.getUTI(filePath);

      if (uti) {
        // Use native method to get localized description from NSWorkspace
        if (mdlsNative && mdlsNative.getLocalizedDescription) {
          const localizedDesc = mdlsNative.getLocalizedDescription(uti);
          if (localizedDesc) {
            return localizedDesc;
          }
        }
      }

      // Fallback to kMDItemKind for system-provided descriptions
      const kindResult = spawnSync('mdls', [
        '-name', 'kMDItemKind', '-raw', filePath
      ], {
        encoding: 'utf8'
      });

      if (kindResult.status === 0 && kindResult.stdout && kindResult.stdout !== '(null)') {
        return kindResult.stdout.trim();
      }

      // Final fallback: use file extension for basic kind detection
      const ext = path.extname(filePath).toLowerCase();
      const stat = fs.lstatSync(filePath);
      if (stat.isDirectory()) {
        return 'Folder';
      }
      if (stat.isSymbolicLink()) {
        return 'Alias';
      }
      // Basic extension mapping as fallback
      const extMap = {
        '.txt': 'Plain Text',
        '.js': 'JavaScript Source',
        '.cjs': 'JavaScript Source',
        '.mjs': 'JavaScript Source',
        '.json': 'JSON File',
        '.md': 'Markdown Document',
        '.html': 'HTML Document',
        '.css': 'CSS File',
        '.sh': 'Shell Script',
        '.jpg': 'JPEG Image',
        '.jpeg': 'JPEG Image',
        '.png': 'PNG Image',
        '.gif': 'GIF Image',
        '.pdf': 'PDF Document'
      };
      return extMap[ext] || 'Document';
    } catch (err) {
      console.log('err', err);
      return 'Unknown';
    }
  },
  getLocalizedUTIDescription: (uti) => {
    // Get localized description for any UTI (file types, app categories, etc.)
    try {
      if (mdlsNative && mdlsNative.getLocalizedDescription) {
        return mdlsNative.getLocalizedDescription(uti);
      }
      // Fallback: return the UTI as-is if native binding not available
      return uti;
    } catch (err) {
      console.log('Error getting localized UTI description:', err);
      return uti;
    }
  },
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
        /* c8 ignore next 8 -- Error callback difficult to test: would require
           forcing parcel-watcher to fail, which is implementation-dependent */
        if (data.error) {
          // eslint-disable-next-line promise/prefer-await-to-callbacks -- API
          callback(new Error(data.error), null);
        } else {
          // eslint-disable-next-line promise/prefer-await-to-callbacks -- API
          callback(null, data.events);
        }
      };
      ipcRenderer.on(`parcelWatcher:callback:${watcherId}`, listener);
      /* c8 ignore next 7 -- Unsubscribe not called in tests: watchers
         persist for app lifetime, cleanup happens on app close */
      return {
        unsubscribe: async () => {
          ipcRenderer.removeListener(`parcelWatcher:callback:${watcherId}`, listener);
          await ipcRenderer.invoke('parcelWatcher:unsubscribe', watcherId);
        }
      };
    }
  },
  // Synchronous storage API (replacement for localStorage)
  storage: {
    getItem: (key) => ipcRenderer.sendSync('storage:getItem', key),
    setItem: (key, value) => ipcRenderer.sendSync('storage:setItem', key, value),
    removeItem: (key) => ipcRenderer.sendSync('storage:removeItem', key),
    clear: () => ipcRenderer.sendSync('storage:clear')
  }
});
