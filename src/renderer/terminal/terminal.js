/* eslint-disable n/no-sync -- For performance */

// Get Node APIs from the preload script
const {
  spawnSync
  // @ts-expect-error Ok
} = globalThis.electronAPI;

/**
 * Escape a string for safe use in AppleScript string literals.
 * @param {string} str - The string to escape
 * @returns {string} The escaped string
 */
function escapeAppleScript (str) {
  // Escape backslashes first, then quotes
  return str.replaceAll('\\', '\\\\').
    replaceAll('"', String.raw`\"`);
}

/**
 * Escape a string for safe use in shell commands.
 * @param {string} str - The string to escape
 * @returns {string} The escaped string safe for shell
 */
function escapeShell (str) {
  // Use single quotes and escape any single quotes in the string
  return `'${str.replaceAll("'", String.raw`'\''`)}'`;
}

/**
 * Sets the Finder comment for a specific file on macOS synchronously.
 * @param {string} filePath - The absolute path to the file.
 * @param {string} commentText - The comment to set.
 */
export function setFinderComment (filePath, commentText) {
  // Escape the file path and comment text for the shell and AppleScript
  const escapedPath = JSON.stringify(filePath);
  const escapedComment = JSON.stringify(commentText);

  const appleScript = `
    set filepath to POSIX file ${escapedPath}
    set the_File to filepath as alias
    tell application "Finder" to set the comment of the_File to ${
      escapedComment
    }
  `;

  // We pass the script as arguments to osascript
  const result = spawnSync(
    'osascript', ['-e', appleScript], {encoding: 'utf8', stdio: 'inherit'}
  );

  /* c8 ignore next 4 -- Guard */
  if (result.status !== 0) {
    // eslint-disable-next-line no-console -- Debugging
    console.error(`Error setting comment: ${result.stderr}`);
  }
}

/**
 * @param {string} executable
 * @param {string} scriptPath - Path to the script
 * @param {string} arg - Argument to pass to the script
 * @returns {void}
 */
export function openNewTerminalWithCommand (executable, scriptPath, arg) {
  // Properly escape both arguments for shell
  const shellCommand = `${executable} ${
    escapeShell(scriptPath)
  } ${
    escapeShell(arg)
  }`;
  // Then escape the whole command for AppleScript
  const escapedCommand = escapeAppleScript(shellCommand);
  const appleScript = `
    tell application "Terminal"
        do script "${escapedCommand}"
        activate
    end tell
  `;

  spawnSync('osascript', ['-e', appleScript], {
    stdio: 'inherit'
  });
}
