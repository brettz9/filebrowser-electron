/* eslint-disable n/no-sync -- Needed for performance */
// Get Node APIs from the preload script
const {
  fs: {existsSync, rmSync, mkdirSync, writeFileSync, renameSync},
  spawnSync,
  path,
  os
} = globalThis.electronAPI;

// Use same undo backup directory as operations.js
const undoBackupDir = path.join(os.tmpdir(), 'filebrowser-undo-backups');
try {
  /* c8 ignore next 3 -- One-time operation */
  if (!existsSync(undoBackupDir)) {
    mkdirSync(undoBackupDir, {recursive: true});
  }
/* c8 ignore next 4 -- Defensive: mkdir failure is rare */
} catch (err) {
  // eslint-disable-next-line no-console -- Startup logging
  console.error('Failed to create undo backup directory:', err);
}

/**
 * @typedef UndoAction
 * @property {'create'|'delete'|'rename'|'move'|'copy'|'replace'} type
 * @property {string} path - The path involved in the operation
 * @property {string} [oldPath] - For rename/move operations
 * @property {string} [newPath] - For rename/move operations
 * @property {boolean} [wasDirectory] - For delete operations
 * @property {string} [backupPath] - For delete/replace operations (temp backup)
 */

/** @type {UndoAction[]} */
const undoStack = [];
/** @type {UndoAction[]} */
const redoStack = [];
const MAX_UNDO_STACK_SIZE = 50;

// Expose for testing
globalThis.undoStack = undoStack;
globalThis.redoStack = redoStack;

/**
 * Add an action to the undo stack.
 * @param {UndoAction} action
 */
export const pushUndo = (action) => {
  undoStack.push(action);
  /* c8 ignore next 3 -- Difficult to test */
  if (undoStack.length > MAX_UNDO_STACK_SIZE) {
    undoStack.shift();
  }
  // Clear redo stack when a new action is performed
  redoStack.length = 0;
};

/**
 * Perform undo operation.
 * @param {() => void} changePath - Function to refresh the view
 */
export const performUndo = (changePath) => {
  const action = undoStack.pop();
  if (!action) {
    return;
  }

  try {
    switch (action.type) {
    case 'copy':
    case 'create': {
      // Undo create/copy: delete the created/copied item
      if (existsSync(action.path)) {
        rmSync(action.path, {recursive: true, force: true});
        redoStack.push(action);
      }
      break;
    }
    case 'delete': {
      // Undo delete: restore from backup
      if (action.backupPath && existsSync(action.backupPath)) {
        const cpResult = spawnSync(
          'cp',
          ['-R', action.backupPath, action.path]
        );
        if (cpResult.status === 0) {
          // Clean up backup
          rmSync(action.backupPath, {recursive: true, force: true});
          redoStack.push({...action, backupPath: undefined});
        }
      }
      break;
    }
    case 'rename':
    case 'move': {
      // Undo rename/move: move back to old location
      if (action.newPath && action.oldPath && existsSync(action.newPath)) {
        renameSync(action.newPath, action.oldPath);
        redoStack.push(action);
      }
      break;
    }
    case 'replace': {
      // Undo replace: restore the replaced item from backup
      if (action.backupPath && existsSync(action.backupPath)) {
        // Before removing the new item, back it up for potential redo
        let newItemBackupPath;
        if (existsSync(action.path)) {
          const timestamp = Date.now();
          const sanitizedPath = action.path.replaceAll(/[^a-zA-Z\d]/gv, '_');
          newItemBackupPath = path.join(
            undoBackupDir,
            `${sanitizedPath}_new_${timestamp}`
          );
          const backupNewResult = spawnSync(
            'cp',
            ['-R', action.path, newItemBackupPath]
          );
          if (backupNewResult.status === 0) {
            // Remove the new item
            rmSync(action.path, {recursive: true, force: true});
          }
        }

        // Restore the original from backup
        const cpResult = spawnSync(
          'cp',
          ['-R', action.backupPath, action.path]
        );
        if (cpResult.status === 0) {
          // Clean up old backup after successful restore
          rmSync(action.backupPath, {recursive: true, force: true});
          // Push to redo stack with the new backup path
          redoStack.push({
            ...action,
            backupPath: newItemBackupPath
          });
        }
      }
      break;
    }
    /* c8 ignore next 3 -- Guard */
    default:
      throw new Error('Unexpected undo operation');
    }
    changePath();
  /* c8 ignore next 4 -- Guard */
  } catch (err) {
    // eslint-disable-next-line no-alert -- User feedback
    alert('Failed to undo: ' + (/** @type {Error} */ (err)).message);
  }
};

/**
 * Perform redo operation.
 * @param {() => void} changePath - Function to refresh the view
 */
export const performRedo = (changePath) => {
  const action = redoStack.pop();
  if (!action) {
    return;
  }

  try {
    switch (action.type) {
    case 'create': {
      // Redo create: recreate the item
      if (!existsSync(action.path)) {
        if (action.wasDirectory) {
          mkdirSync(action.path);
        } else {
          writeFileSync(action.path, '');
        }
        undoStack.push(action);
      }
      break;
    }
    case 'delete': {
      // Redo delete: delete again
      if (existsSync(action.path)) {
        // Create backup for potential undo
        const timestamp = Date.now();
        const safeName = path.basename(action.path).
          replaceAll(/[^\w.]/gv, '_');
        const backupName = `${safeName}.undo-backup-${timestamp}`;
        const backupPath = path.join(undoBackupDir, backupName);
        const cpResult = spawnSync('cp', ['-R', action.path, backupPath]);
        if (cpResult.status === 0) {
          rmSync(action.path, {recursive: true, force: true});
          undoStack.push({...action, backupPath});
        }
      }
      break;
    }
    case 'rename':
    case 'move': {
      // Redo rename/move: move forward again
      if (action.oldPath && action.newPath && existsSync(action.oldPath)) {
        renameSync(action.oldPath, action.newPath);
        undoStack.push(action);
      }
      break;
    }
    case 'copy': {
      // Redo copy: copy again
      if (action.oldPath && !existsSync(action.path)) {
        const cpResult = spawnSync('cp', ['-R', action.oldPath, action.path]);
        if (cpResult.status === 0) {
          undoStack.push(action);
        }
      }
      break;
    }
    case 'replace': {
      // Redo replace: restore the "new" item from its backup
      if (action.backupPath && existsSync(action.backupPath)) {
        // The current file has the old content (from undo)
        // Back it up again for potential undo
        const timestamp = Date.now();
        const sanitizedPath = action.path.replaceAll(/[^a-zA-Z\d]/gv, '_');
        const oldItemBackupPath = path.join(
          undoBackupDir,
          `${sanitizedPath}_${timestamp}`
        );

        const backupOldResult = spawnSync(
          'cp',
          ['-R', action.path, oldItemBackupPath]
        );

        if (backupOldResult.status === 0) {
          // Remove the old item
          rmSync(action.path, {recursive: true, force: true});

          // Restore the new item from backup
          const cpResult = spawnSync(
            'cp',
            ['-R', action.backupPath, action.path]
          );

          if (cpResult.status === 0) {
            // Clean up the new item backup
            rmSync(action.backupPath, {recursive: true, force: true});
            // Push back to undo stack with the old item backup
            undoStack.push({
              ...action,
              backupPath: oldItemBackupPath
            });
          }
        }
      }
      break;
    }
    /* c8 ignore next 3 -- Guard */
    default:
      throw new Error('Unexpected redo operation');
    }
    changePath();
  /* c8 ignore next 4 -- Guard */
  } catch (err) {
    // eslint-disable-next-line no-alert -- User feedback
    alert('Failed to redo: ' + (/** @type {Error} */ (err)).message);
  }
};
