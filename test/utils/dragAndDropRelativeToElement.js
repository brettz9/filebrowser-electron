/**
 * @typedef {{
 *   x: number;
 *   y: number;
 *   width: number;
 *   height: number;
 * }} Box
 */

/**
 * @callback DragAndDropRelativeToElement
 * @param {{x: number, y: number}} coords
 * @param {string} dragSel
 * @param {string} [targetSel] Defaults to dragSel
 * @returns {Promise<void>}
 */

/**
 * @param {import('playwright').Page} page
 */
export function getDragAndDropRelativeToElement (page) {
  /** @type {DragAndDropRelativeToElement} */
  return async function dragAndDropRelativeToElement (
    {x, y}, dragSel, targetSel = dragSel
  ) {
    // Drag and drop away from target using manual mouse events
    // (page.dragAndDrop doesn't trigger mousemove/mousedown/mouseup
    // that stickynote library uses)

    // 1. Locate the element to be dragged
    const draggableElement = await page.locator(dragSel);

    const draggableStartingBox = /** @type {Box} */ (
      await draggableElement.boundingBox()
    );

    // 2. Locate the target element
    const targetElement = await page.locator(targetSel);
    const targetBox = /** @type {Box} */ (await targetElement.boundingBox());

    // 3. Move mouse to the header area (top of the sticky note to avoid
    //     content)
    // The stickynote library only allows dragging from non-content areas
    await page.mouse.move(
      draggableStartingBox.x,
      draggableStartingBox.y
    );

    // 4. Press the left mouse button down
    await page.mouse.down();

    // 5. Move the mouse to the target position (relative to target element)
    await page.mouse.move(
      targetBox.x + x,
      targetBox.y + y,
      {steps: 10} // Smooth movement
    );

    // 6. Release the mouse button
    await page.mouse.up();

    // 7. Verify the position changed
    // const draggableMovedBox = /** @type {Box} */ (
    //   await (await page.locator(dragSel)).boundingBox()
    // );
    // // eslint-disable-next-line no-console -- Debug
    // console.log('draggableMovedBox', draggableMovedBox);
  };
}
