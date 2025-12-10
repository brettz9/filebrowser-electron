/* eslint-disable n/no-sync -- Needed for performance */
import plist from 'plist';

// Get Node APIs from the preload script
const {
  fs: {existsSync, readFileSync, lstatSync},
  path,
  getLocalizedUTIDescription
} = globalThis.electronAPI;

/**
 * @param {string} folderPath
 * @returns {boolean}
 */
export function isMacApp (folderPath) {
  try {
    const stats = lstatSync(folderPath);

    if (!stats.isDirectory()) {
      return false; // Not a directory, so not an app bundle
    }

    const contentsPath = path.join(folderPath, 'Contents');
    const macOSPath = path.join(contentsPath, 'MacOS');
    const infoPlistPath = path.join(contentsPath, 'Info.plist');

    // Check for the presence of key directories and files
    const contentsExists = lstatSync(contentsPath).isDirectory();
    const macOSExists = lstatSync(macOSPath).isDirectory();
    const infoPlistExists = lstatSync(infoPlistPath).isFile();

    return contentsExists && macOSExists && infoPlistExists;
  } catch (error) {
    // Handle errors like path not found
    return false;
  }
}

/**
 * Get the category of a specified Mac application.
 * @param {string} appPath - The path of the application (e.g.,
 *   "/Applications/Google Chrome.app").
 * @returns {string|null} The application category or null if not found.
 */
export function getMacAppCategory (appPath) {
  const appName = path.dirname(appPath);
  const infoPlistPath = path.join(appPath, 'Contents', 'Info.plist');

  /* c8 ignore next 5 -- Unusual circumstance */
  if (!existsSync(infoPlistPath)) {
    // eslint-disable-next-line no-console -- Debugging
    console.error(`Info.plist not found for ${appName}`);
    return null;
  }

  try {
    const plistContent = readFileSync(infoPlistPath, 'utf8');
    const parsedPlist = plist.parse(plistContent);
    const category = parsedPlist.LSApplicationCategoryType;

    if (category) {
      // Get localized version
      // (e.g., "public.app-category.productivity" -> "Productivity")
      return getLocalizedUTIDescription(category);
    /* c8 ignore next 6 -- Unusual circumstance */
    }
    // eslint-disable-next-line no-console -- Debugging
    console.log(
      `LSApplicationCategoryType not found in ${appName}'s Info.plist`
    );
    return null;
  /* c8 ignore next 7 -- Unusual circumstance */
  } catch (error) {
    // eslint-disable-next-line no-console -- Debugging
    console.error(
      `Error reading or parsing plist for ${appName}:`, error.message
    );
    return null;
  }
}
