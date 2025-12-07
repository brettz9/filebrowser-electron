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
