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
  // eslint-disable-next-line n/no-sync -- Needed for performance
  return readdirSync(basePath)
    .filter((fileOrDir) => {
      // Filter out undo backup files
      return !fileOrDir.includes('.undo-backup-');
    })
    .map((fileOrDir) => {
      // eslint-disable-next-line n/no-sync -- Needed for performance
      const stat = lstatSync(path.join(basePath, fileOrDir));
      return /** @type {Result} */ (
        [stat.isDirectory() || stat.isSymbolicLink(), basePath, fileOrDir]
      );
    }).toSorted(([, , a], [, , b]) => {
      return a.localeCompare(b, undefined, {sensitivity: 'base'});
    });
}
