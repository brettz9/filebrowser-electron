/**
 * Simple event bus for decoupling modules.
 * Allows modules to emit events and subscribe to events without
 * direct dependencies.
 */

/**
 * @callback EventCallback
 * @param {unknown} [data]
 * @returns {void}
 */

/** @type {Map<string, Set<EventCallback>>} */
const listeners = new Map();

/**
 * Subscribe to an event.
 * @param {string} eventName
 * @param {EventCallback} handler
 * @returns {() => void} Unsubscribe function
 */
export function on (eventName, handler) {
  if (!listeners.has(eventName)) {
    listeners.set(eventName, new Set());
  }
  listeners.get(eventName).add(handler);

  // Return unsubscribe function
  return () => {
    const eventListeners = listeners.get(eventName);
    if (eventListeners) {
      eventListeners.delete(handler);
    }
  };
}

/**
 * Emit an event with optional data.
 * @param {string} eventName
 * @param {unknown} [data]
 */
export function emit (eventName, data) {
  const eventListeners = listeners.get(eventName);
  if (eventListeners) {
    eventListeners.forEach((handler) => {
      try {
        handler(data);
      } catch (err) {
        // eslint-disable-next-line no-console -- Error handling
        console.error(`Error in event listener for "${eventName}":`, err);
      }
    });
  }
}

/**
 * Remove all listeners for an event.
 * @param {string} eventName
 */
export function off (eventName) {
  listeners.delete(eventName);
}

/**
 * Clear all event listeners.
 */
export function clear () {
  listeners.clear();
}
