/**
 * @typedef {[isDir: boolean, childDir: string, title: string]} Result
 */

/** @type {JQuery} */
export let $columns;

export let isDeleting = false;
export let isCreating = false;
export let isCopyingOrMoving = false;
export const isRefreshing = false;
export let isWatcherRefreshing = false;

// Tree view in list view
// Initialize from storage on module load, but re-check on access
let listViewTreeMode =
  localStorage.getItem('list-view-tree-mode') === 'true';

/**
 * Set the $columns value.
 * @param {JQuery} value
 */
export const set$columns = (value) => {
  $columns = value;
};

/**
 * Set the isDeleting flag.
 * @param {boolean} value
 */
export const setIsDeleting = (value) => {
  isDeleting = value;
};

/**
 * Set the isCreating flag.
 * @param {boolean} value
 */
export const setIsCreating = (value) => {
  isCreating = value;
};

/**
 * Set the isCopyingOrMoving flag.
 * @param {boolean} value
 */
export const setIsCopyingOrMoving = (value) => {
  isCopyingOrMoving = value;
};

/**
 * Get the isCopyingOrMoving flag.
 * @returns {boolean}
 */
export const getIsCopyingOrMoving = () => isCopyingOrMoving;

/**
 * Set the isWatcherRefreshing flag.
 * @param {boolean} value
 */
export const setIsWatcherRefreshing = (value) => {
  isWatcherRefreshing = value;
};

/**
 * Get the list view tree mode flag.
 * @returns {boolean}
 */
export const getListViewTreeMode = () => {
  // Re-sync with storage on every access to handle cleared storage
  const stored = localStorage.getItem('list-view-tree-mode');
  listViewTreeMode = stored === 'true';
  return listViewTreeMode;
};

/**
 * Toggle the list view tree mode.
 * @param {boolean} [value] - Optional value to set
 * @returns {boolean} - The new value
 */
export const toggleListViewTreeMode = (value) => {
  /* c8 ignore next -- boolean not currently in use */
  listViewTreeMode = typeof value === 'boolean' ? value : !listViewTreeMode;
  localStorage.setItem('list-view-tree-mode', listViewTreeMode.toString());
  return listViewTreeMode;
};

// Export for testing
// @ts-ignore
globalThis.__getIsCreatingForTest = () => isCreating;
