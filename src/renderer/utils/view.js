// eslint-disable-next-line no-shadow -- Importing storage as `localStorage`
import {localStorage} from './storage.js';

/**
 * Get the current view mode.
 * @returns {string}
 */
export const getCurrentView = () => {
  return localStorage.getItem('view') ?? 'icon-view';
};
