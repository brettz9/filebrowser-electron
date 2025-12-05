// Get Node APIs from the preload script
const {storage} = globalThis.electronAPI;

// Use persistent storage instead of localStorage (synchronous via IPC)
// eslint-disable-next-line no-shadow -- Intentionally shadowing global
export const localStorage = storage;
