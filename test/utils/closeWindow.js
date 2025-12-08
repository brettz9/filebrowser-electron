/* eslint-disable n/no-sync -- For performance */
import {spawnSync} from 'node:child_process';

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
 * @param {string} windowName
 */
export function closeWindow (windowName) {
  const escapedWindowName = escapeAppleScript(windowName);
  const appleScript = `
    set TheNameOfTheWindowYouSeek to "${escapedWindowName}"
    tell application "Finder"
      set allwindows to every window
      repeat with i in allwindows
        if name of i is TheNameOfTheWindowYouSeek then
          close i
          exit repeat -- Stop after closing the target window
        end if
      end repeat
    end tell
`;
  // eslint-disable-next-line sonarjs/no-os-command-from-path -- Testing
  spawnSync('osascript', ['-e', appleScript], {
    // stdio: 'inherit'
  });
}
