/**
 * Formats a (metadata) date.
 * @param {number} timestamp
 * @returns {string}
 */
export function getFormattedDate (timestamp) {
  return new Date(timestamp).toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: true
  });
}
