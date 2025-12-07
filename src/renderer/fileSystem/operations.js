/* eslint-disable n/no-sync -- Needed for performance */
import {emit} from '../events/eventBus.js';
import {
  isDeleting,
  setIsDeleting,
  isCopyingOrMoving,
  setIsCopyingOrMoving
} from '../state/flags.js';

// Get Node APIs from the preload script
const {
  fs: {existsSync, lstatSync, rmSync, renameSync, mkdirSync},
  path,
  spawnSync,
  os
} = globalThis.electronAPI;

// Create undo backup directory in system temp folder
const undoBackupDir = path.join(os.tmpdir(), 'filebrowser-undo-backups');
try {
  if (!existsSync(undoBackupDir)) {
    mkdirSync(undoBackupDir, {recursive: true});
  }
/* c8 ignore next 4 -- Defensive: mkdir failure is rare */
} catch (err) {
  // eslint-disable-next-line no-console -- Startup logging
  console.error('Failed to create undo backup directory:', err);
}

/**
 * @typedef {import('../history/undoRedo.js').UndoAction} UndoAction
 */

/**
 * Delete a file or directory.
 * @param {string} itemPath
 */
export function deleteItem (itemPath) {
  // Prevent multiple simultaneous deletions
  if (isDeleting) {
    return;
  }

  setIsDeleting(true);

  const decodedPath = decodeURIComponent(itemPath);
  const itemName = path.basename(decodedPath);

  // eslint-disable-next-line no-alert -- User confirmation
  const confirmed = confirm(`Are you sure you want to delete "${itemName}"?`);

  if (!confirmed) {
    setIsDeleting(false);
    return;
  }

  try {
    // Create a backup before deleting for undo support
    const timestamp = Date.now();
    const safeName = path.basename(decodedPath).
      replaceAll(/[^\w.\-]/gv, '_');
    const backupName = `${safeName}.undo-backup-${timestamp}`;
    const backupPath = path.join(undoBackupDir, backupName);
    const cpResult = spawnSync('cp', ['-R', decodedPath, backupPath]);

    /* c8 ignore next 3 - Defensive: requires cp command to fail */
    if (cpResult.error || cpResult.status !== 0) {
      throw new Error('Failed to create backup for undo');
    }

    // Check if it's a directory
    const stats = lstatSync(decodedPath);
    const wasDirectory = stats.isDirectory();

    // rmSync with recursive and force options to handle both files
    //   and directories
    rmSync(decodedPath, {recursive: true, force: true});

    // Add to undo stack via event
    emit('pushUndo', {
      type: 'delete',
      path: decodedPath,
      wasDirectory,
      backupPath
    });

    // Refresh the view to reflect deletion
    emit('refreshView');

    // Reset flag after a delay to allow view to update
    setTimeout(() => {
      setIsDeleting(false);
    }, 100);

    // Note: Delete error handling here
    // is difficult to test via mocking because rmSync is destructured at
    // module load time, preventing runtime mocking. This would require
    // either modifying the source to use property access instead of
    // destructuring, or creating actual filesystem permission errors which
    // is complex and platform-dependent. These lines are marked as
    // difficult to cover and require manual/integration testing.
    /* c8 ignore next 5 -- Defensive and difficult to cover */
  } catch (err) {
    // eslint-disable-next-line no-alert -- User feedback
    alert('Failed to delete: ' + (/** @type {Error} */ (err)).message);
    setIsDeleting(false);
  }
}

/**
 * Copy or move an item.
 * @param {string} sourcePath
 * @param {string} targetDir
 * @param {boolean} isCopy
 */
export function copyOrMoveItem (sourcePath, targetDir, isCopy) {
  // Prevent multiple simultaneous copy/move operations
  if (isCopyingOrMoving) {
    return;
  }

  setIsCopyingOrMoving(true);

  const decodedSource = decodeURIComponent(sourcePath);
  const decodedTargetDir = decodeURIComponent(targetDir);
  const itemName = path.basename(decodedSource);
  const targetPath = path.join(decodedTargetDir, itemName);

  // Silently ignore if dragging to the same location
  if (decodedSource === targetPath) {
    setIsCopyingOrMoving(false);
    return;
  }

  // Check if target already exists
  if (existsSync(targetPath)) {
    // eslint-disable-next-line no-alert -- User feedback
    alert(`"${itemName}" already exists in the destination.`);
    setIsCopyingOrMoving(false);
    return;
  }

  try {
    if (isCopy) {
      // Copy operation using cp -R for recursive copy
      const cpResult = spawnSync('cp', ['-R', decodedSource, targetPath]);
      /* c8 ignore next 3 - Defensive: requires cp command to fail */
      if (cpResult.error || cpResult.status !== 0) {
        throw new Error(cpResult.stderr?.toString() || 'Copy failed');
      }
      // Add to undo stack via event
      emit('pushUndo', {
        type: 'copy',
        path: targetPath,
        oldPath: decodedSource
      });
    /* c8 ignore next 12 - Move operation not yet implemented in UI
       (no cut/paste for moving between directories) */
    } else {
      // Move operation
      renameSync(decodedSource, targetPath);
      // Add to undo stack via event
      emit('pushUndo', {
        type: 'move',
        path: targetPath,
        oldPath: decodedSource,
        newPath: targetPath
      });
    }

    // Refresh the view
    emit('refreshView');

    // Reset flag after a short delay
    setTimeout(() => {
      setIsCopyingOrMoving(false);
    }, 100);
  /* c8 ignore next 7 - Defensive: difficult to trigger errors in cp/rename */
  } catch (err) {
    // eslint-disable-next-line no-alert -- User feedback
    alert(
      `Failed to ${isCopy ? 'copy' : 'move'}: ` +
      (/** @type {Error} */ (err)).message
    );
    setIsCopyingOrMoving(false);
  }
}
