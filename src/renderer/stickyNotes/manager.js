import {StickyNote} from 'stickynote';
// eslint-disable-next-line no-shadow -- Importing storage as localStorage
import {localStorage} from '../utils/storage.js';

export const stickyNotes = new StickyNote({
  colors: ['#fff740', '#ff7eb9', '#7afcff', '#feff9c', '#a7ffeb', '#c7ceea'],
  onDelete (note) {
    const notes = stickyNotes.getAllNotes(({metadata}) => {
      return metadata.type === 'local' &&
        metadata.path === note.metadata.path;
    });
    if (note.metadata.type === 'local') {
      localStorage.setItem(
        `stickyNotes-local-${note.metadata.path}`, JSON.stringify(notes)
      );
    } else {
      localStorage.setItem(
        `stickyNotes-global`, JSON.stringify(notes)
      );
    }
  }
});

/**
 * @param {import('stickynote').NoteData} note
 * @param {string} pth
 */
export const addLocalStickyInputListeners = (note, pth) => {
  const saveNotes = () => {
    const notes = stickyNotes.getAllNotes(({metadata}) => {
      return metadata.type === 'local' &&
        metadata.path === note.metadata.path;
    });
    localStorage.setItem(
      `stickyNotes-local-${pth}`, JSON.stringify(notes)
    );
  };
  note.content.addEventListener('input', () => {
    saveNotes();
  });

  const noteElement = note.element;
  let saveTimeout;
  const noteObserver = new MutationObserver(function (mutationsList) {
    for (const mutation of mutationsList) {
      if (mutation.attributeName === 'class' ||
        mutation.attributeName === 'data-color-index'
      ) {
        // mutation.target.classList.contains('collapsed')
        saveNotes();
      } else if (mutation.attributeName === 'style') {
        // Debounce style changes (position during drag)
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(saveNotes, 300);
      }
    }
  });
  if (noteElement) {
    const config = {
      attributes: true,
      attributeFilter: ['class', 'data-color-index', 'style']
    };
    noteObserver.observe(noteElement, config);
  }

  const titleObserver = new MutationObserver(function (mutationsList) {
    for (const mutation of mutationsList) {
      if (mutation.attributeName === 'class') {
        // mutation.target.classList.contains('collapsed')
        saveNotes();
      }
    }
  });
  const titleElement = note.title;
  if (titleElement) {
    const config = {attributes: true, attributeFilter: ['class']};
    titleObserver.observe(titleElement, config);
  }

  // To stop observing later:
  // noteObserver.disconnect();
};

/**
 * @param {import('stickynote').NoteData} note
 */
export const addGlobalStickyInputListeners = (note) => {
  const saveNotes = () => {
    const notes = stickyNotes.getAllNotes(({metadata}) => {
      return metadata.type === 'global';
    });
    localStorage.setItem(
      `stickyNotes-global`, JSON.stringify(notes)
    );
  };
  note.content.addEventListener('input', () => {
    saveNotes();
  });

  const noteElement = note.element;
  let saveTimeout;
  const noteObserver = new MutationObserver(function (mutationsList) {
    for (const mutation of mutationsList) {
      if (mutation.attributeName === 'class' ||
        mutation.attributeName === 'data-color-index'
      ) {
        // mutation.target.classList.contains('collapsed')
        saveNotes();
      } else if (mutation.attributeName === 'style') {
        // Debounce style changes (position during drag)
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(saveNotes, 300);
      }
    }
  });
  if (noteElement) {
    const config = {
      attributes: true,
      attributeFilter: ['class', 'data-color-index', 'style']
    };
    noteObserver.observe(noteElement, config);
  }

  const titleObserver = new MutationObserver(function (mutationsList) {
    for (const mutation of mutationsList) {
      if (mutation.attributeName === 'class') {
        // mutation.target.classList.contains('collapsed')
        saveNotes();
      }
    }
  });
  const titleElement = note.title;
  if (titleElement) {
    const config = {attributes: true, attributeFilter: ['class']};
    titleObserver.observe(titleElement, config);
  }

  // To stop observing later:
  // noteObserver.disconnect();
};
