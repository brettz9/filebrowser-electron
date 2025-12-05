/* eslint-disable jsdoc/reject-any-type -- Generic */
/**
 * Split an array into chunks of a specified size.
 * @param {any[]} arr
 * @param {number} n
 * @returns {any[][]}
 */
export const chunk = (arr, n) => Array.from({
  length: Math.ceil(arr.length / n)
}, (_, i) => arr.slice(n * i, n + (n * i)));
/* eslint-enable jsdoc/reject-any-type -- Generic */
