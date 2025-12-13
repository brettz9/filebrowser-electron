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

const attributeName = 'data-middle-ellipsis';
const clamp = (
  val, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY
) => Math.max(min, Math.min(max, val));
const ellipsis = '…';
const map = new Map();

/**
 * @see {@link https://stackoverflow.com/a/49349813/271577}
 * @param {HTMLElement[]} elems
 */
export function middleEllipsis (elems) {
  elems.forEach((elm) => {
    // do not recalculate variables a second time
    const mapped = map.get(elm);
    let {
      text, textLength, from, multiplier, font, textWidth, elementWidth
    } = mapped || {};
    // first time
    if (!mapped) {
      text = elm.textContent;
      textLength = text.length;
      from = Number.parseFloat(elm.getAttribute(attributeName)) || 50;
      multiplier = from > 0 && from / 100;
      const computedStyle = globalThis.getComputedStyle(elm, null);
      font = `${computedStyle.getPropertyValue('font-weight')} ${
        computedStyle.getPropertyValue('font-size')
      } ${computedStyle.getPropertyValue('font-family')}`;
      textWidth = getTextWidth(text, font);
      elementWidth = elm.offsetWidth;
      map.set(elm, {
        text, textLength, from, multiplier, font, textWidth, elementWidth
      });
    }

    const {offsetWidth} = elm;
    const widthChanged = !mapped || elementWidth !== offsetWidth;
    if (mapped && widthChanged) {
      mapped.elementWidth = elementWidth = offsetWidth;
    }
    //
    if (widthChanged && textWidth > elementWidth) {
      elm.setAttribute('title', text);
      let smallerText = text;
      let smallerWidth = elementWidth;
      while (smallerText.length > 3) {
        const smallerTextLength = smallerText.length;
        const half = (multiplier &&
          clamp(
            Math.trunc(multiplier * smallerTextLength), 1, smallerTextLength - 2
          )) || Math.max(smallerTextLength + from - 1, 1);
        const half1 = smallerText.slice(0, Math.max(0, half)).replace(/\s*$/v, '');
        const half2 = smallerText.slice(half + 1).replace(/^\s*/v, '');
        smallerText = half1 + half2;
        smallerWidth = getTextWidth(smallerText + ellipsis, font);
        if (smallerWidth < elementWidth) {
          elm.textContent = half1 + ellipsis + half2;
          break;
        }
      }
    }
  });
}

/**
 * Get the text width.
 * @param {string} text
 * @param {string} font
 * @returns {number}
 */
function getTextWidth (text, font) {
  // eslint-disable-next-line prefer-destructuring -- TS
  let context = /** @type {CanvasRenderingContext2D} */ (
    getTextWidth.context
  );
  if (!context) {
    const canvas = document.createElement('canvas');
    context = canvas.getContext('2d');
    getTextWidth.context = context;
  }
  context.font = font;
  const metrics = context.measureText(text);
  return metrics.width;
}
