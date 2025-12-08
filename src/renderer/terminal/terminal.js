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
