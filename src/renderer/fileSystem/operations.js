/* eslint-disable n/no-sync -- Needed for performance */
import {emit} from '../events/eventBus.js';
import {
  isDeleting,
  setIsDeleting,
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
  /* c8 ignore next 3 -- Module init: coverage starts after execution */
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

// Track last operation to prevent duplicate dialogs
let lastOperationKey = '';
let lastOperationTime = 0;
let operationCounter = 0;

/**
 * Copy or move an item.
 * @param {string} sourcePath
 * @param {string} targetDir
 * @param {boolean} isCopy
 */
export function copyOrMoveItem (sourcePath, targetDir, isCopy) {
  /* c8 ignore next 4 -- Concurrent blocking: requires direct function calls */
  // Check and block IMMEDIATELY before doing anything else
  if (operationCounter > 0) {
    return;
  }

  // Set counter immediately to block subsequent calls
  operationCounter = 1;

  // Build operation key for deduplication
  const operationKey = `${sourcePath}:${targetDir}:${isCopy}`;
  const now = Date.now();

  /* c8 ignore next 5 -- Deduplication: requires rapid identical calls */
  // Check for duplicate operation within 500ms
  if (operationKey === lastOperationKey && now - lastOperationTime < 500) {
    operationCounter = 0;
    return;
  }

  // Update tracking variables
  lastOperationKey = operationKey;
  lastOperationTime = now;
  setIsCopyingOrMoving(true);

  const decodedSource = decodeURIComponent(sourcePath);
  const decodedTargetDir = decodeURIComponent(targetDir);
  const itemName = path.basename(decodedSource);
  const targetPath = path.join(decodedTargetDir, itemName);

  // Silently ignore if dragging to the same location or onto itself
  if (decodedSource === targetPath || decodedSource === decodedTargetDir) {
    operationCounter = 0;
    setIsCopyingOrMoving(false);
    return;
  }

  // Prevent moving/copying a folder into its own descendant
  if (decodedTargetDir.startsWith(decodedSource + path.sep) ||
      decodedTargetDir === decodedSource) {
    // eslint-disable-next-line no-alert -- User feedback
    alert('Cannot copy or move a folder into itself or its descendants.');
    operationCounter = 0;
    setIsCopyingOrMoving(false);
    return;
  }

  // Check if target already exists
  if (existsSync(targetPath)) {
    // Check if source is inside the target that would be replaced
    // This would cause the source to be deleted before the operation
    if (decodedSource.startsWith(targetPath + path.sep) ||
        path.dirname(decodedSource) === targetPath) {
      // eslint-disable-next-line no-alert -- User feedback
      alert('Cannot replace a folder with one of its own contents.');
      operationCounter = 0;
      setIsCopyingOrMoving(false);
      return;
    }

    // eslint-disable-next-line no-alert -- User feedback
    const shouldReplace = confirm(
      `"${itemName}" already exists in the destination.\n\n` +
      'Click OK to replace the existing item, or Cancel to stop.'
    );

    if (!shouldReplace) {
      operationCounter = 0;
      setIsCopyingOrMoving(false);
      return;
    }

    // Create backup of the existing file/folder for undo
    try {
      const timestamp = Date.now();
      const sanitizedPath = targetPath.replaceAll(/[^a-zA-Z\d]/gv, '_');
      const backupPath = path.join(
        undoBackupDir,
        `${sanitizedPath}_${timestamp}`
      );

      // Copy existing item to backup before replacing
      const backupResult = spawnSync('cp', ['-R', targetPath, backupPath]);
      /* c8 ignore next 3 - Defensive: requires backup to fail */
      if (backupResult.error || backupResult.status !== 0) {
        throw new Error('Failed to create backup');
      }

      // Remove the existing item
      rmSync(targetPath, {recursive: true, force: true});

      // Copy the new item to replace the old one
      if (isCopy) {
        const cpResult = spawnSync('cp', ['-R', decodedSource, targetPath]);
        /* c8 ignore next 3 - Defensive: requires cp command to fail */
        if (cpResult.error || cpResult.status !== 0) {
          throw new Error(cpResult.stderr?.toString() || 'Copy failed');
        }
      } else {
        // Move operation
        renameSync(decodedSource, targetPath);
      }

      // Store backup info for potential undo
      emit('pushUndo', {
        type: 'replace',
        path: targetPath,
        backupPath,
        isCopy,
        sourcePath: isCopy ? null : decodedSource
      });

      operationCounter = 0;
      setIsCopyingOrMoving(false);
      return;
    /* c8 ignore next 7 - Defensive: backup failures are rare */
    } catch (err) {
      // eslint-disable-next-line no-alert -- User feedback
      alert(`Failed to replace: ${(/** @type {Error} */ (err)).message}`);
      operationCounter = 0;
      setIsCopyingOrMoving(false);
      return;
    }
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
      operationCounter = 0;
      setIsCopyingOrMoving(false);
    }, 100);
  /* c8 ignore next 9 - Defensive: difficult to trigger errors in cp/rename */
  } catch (err) {
    // eslint-disable-next-line no-alert -- User feedback
    alert(
      `Failed to ${isCopy ? 'copy' : 'move'}: ` +
      (/** @type {Error} */ (err)).message
    );
    operationCounter = 0;
    setIsCopyingOrMoving(false);
  }
}
