/**
 * Query selector that returns a single element.
 * @param {string} sel
 * @returns {HTMLElement}
 */
export const $ = (sel) => {
  return /** @type {HTMLElement} */ (document.querySelector(sel));
};

/**
 * Query selector that returns all matching elements.
 * @param {string} sel
 * @returns {HTMLElement[]}
 */
export const $$ = (sel) => {
  return /** @type {HTMLElement[]} */ ([...document.querySelectorAll(sel)]);
};

/**
 * Get elements matching selector, but only from non-collapsed columns.
 * In three-columns view, collapsed columns contain stale copies of elements.
 *
 * @param {string} sel
 * @returns {HTMLElement[]}
 */
export const $$active = (sel) => {
  const elements = $$(sel);
  return elements.filter((el) => {
    const column = el.closest('.miller-column');
    return !column || !column.classList.contains('miller-collapse');
  });
};
