/**
 * Create and show an info window for a file or folder.
 *
 * @param {object} deps - Dependencies
 * @param {import('jamilih').jml} deps.jml - jamilih jml function
 * @param {string} deps.itemPath - Path to the file or folder
 * @returns {void}
 */
export function showInfoWindow ({jml, itemPath}) {
  // Create a draggable info window
  const infoWindow = jml('div', {
    class: 'info-window'
  }, [
    // Title bar with close button
    ['div', {
      class: 'info-window-header'
    }, [
      ['h3', ['Info']],
      ['button', {
        class: 'info-window-close',
        $on: {
          click () {
            infoWindow.remove();
          }
        }
      }, ['×']]
    ]],
    // Content area (to be populated with metadata)
    ['div', {
      class: 'info-window-content',
      dataset: {
        path: itemPath
      }
    }, [
      ['p', ['Loading metadata...']]
    ]]
  ], document.body);

  // Make the window draggable
  const header = infoWindow.querySelector('.info-window-header');
  let isDragging = false;
  let currentX;
  let currentY;
  let initialX;
  let initialY;

  header.addEventListener('mousedown', (e) => {
    isDragging = true;
    initialX = e.clientX - infoWindow.offsetLeft;
    initialY = e.clientY - infoWindow.offsetTop;
    infoWindow.style.cursor = 'move';
  });

  document.addEventListener('mousemove', (e) => {
    if (isDragging) {
      e.preventDefault();
      currentX = e.clientX - initialX;
      currentY = e.clientY - initialY;
      infoWindow.style.left = currentX + 'px';
      infoWindow.style.top = currentY + 'px';
    }
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
    infoWindow.style.cursor = 'default';
  });

  // Bring window to front when clicked
  infoWindow.addEventListener('mousedown', () => {
    // Find max z-index of all info windows
    const allInfoWindows = document.querySelectorAll('.info-window');
    let maxZ = 10000;
    allInfoWindows.forEach((win) => {
      const z = Number.parseInt(win.style.zIndex || '10000');
      if (z > maxZ) {
        maxZ = z;
      }
    });
    infoWindow.style.zIndex = (maxZ + 1).toString();
  });

  // Offset each new window slightly
  const existingWindows = document.querySelectorAll('.info-window');
  if (existingWindows.length > 1) {
    const offset = (existingWindows.length - 1) * 30;
    infoWindow.style.left = (100 + offset) + 'px';
    infoWindow.style.top = (100 + offset) + 'px';
  }
}
