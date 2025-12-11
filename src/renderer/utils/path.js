/* eslint-disable n/no-sync -- Needed for performance */

import {isMacApp} from '../macApp/macApp.js';

// Get Node APIs from the preload script
const {
  fs: {readdirSync, lstatSync},
  path,
  // eslint-disable-next-line no-shadow -- Different process
  process
} = globalThis.electronAPI;

/**
 * Get the base path from URL hash or command line arguments.
 * @returns {string}
 */
export function getBasePath () {
  if (!location.hash.length && process.argv.length) {
    const idx = process.argv.findIndex((arg) => {
      return arg === '--path' || arg === 'p';
    });
    /* c8 ignore next -- App with arguments */
    return idx === -1 ? '/' : process.argv[idx + 1];
  }

  const params = new URLSearchParams(location.hash.slice(1));
  return path.normalize(
    params.has('path') ? params.get('path') + '/' : '/'
  );
}

/**
 * @typedef {[isDir: boolean, childDir: string, title: string]} Result
 */

/**
 * Read a directory and return sorted entries.
 * @param {string} basePath
 * @returns {Result[]}
 */
export function readDirectory (basePath) {
  // macOS redirects /Applications/Utilities to /System/Applications/Utilities
  let actualPath = basePath;
  if (basePath === '/Applications/Utilities' ||
      basePath === '/Applications/Utilities/') {
    const systemPath = '/System/Applications/Utilities';
    try {
      // Check if system path exists and has content
      const systemContents = readdirSync(systemPath);
      if (systemContents.length > 1 ||
          (systemContents.length === 1 &&
           systemContents[0] !== '.localized')) {
        actualPath = systemPath;
      }
    } catch {
      // If system path doesn't exist, use original path
    }
  }

  return readdirSync(actualPath).
    map((fileOrDir) => {
      const fileOrDirPath = path.join(actualPath, fileOrDir);
      const stat = lstatSync(fileOrDirPath);
      const isDir = stat.isDirectory() && !isMacApp(fileOrDirPath);
      return /** @type {Result} */ (
        [isDir || stat.isSymbolicLink(), actualPath, fileOrDir]
      );
    }).toSorted(([, , a], [, , b]) => {
      return a.localeCompare(b, undefined, {sensitivity: 'base'});
    });
}
