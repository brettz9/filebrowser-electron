// Clipboard for copy/paste operations
/** @type {{path: string, isCopy: boolean} | null} */
let clipboard = null;

// Expose clipboard for testing via getter/setter
Object.defineProperty(globalThis, 'clipboard', {
  get () {
    return clipboard;
  },
  set (value) {
    clipboard = value;
  }
});

/**
 * Get the current clipboard value.
 * @returns {{path: string, isCopy: boolean} | null}
 */
export const getClipboard = () => clipboard;

/**
 * Set the clipboard value.
 * @param {{path: string, isCopy: boolean} | null} value
 */
export const setClipboard = (value) => {
  clipboard = value;
};
