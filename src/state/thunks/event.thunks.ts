import { TFile, TFolder, TAbstractFile, type CachedMetadata, debounce } from 'obsidian';
import type { AppThunk } from '@/state';
import { appSlice } from '@/state';
import { AppStatus } from '@/state';
import { resolveSettings } from '@/state/utils/settingsUtils';
import { shouldAbort } from '@/state/utils/guards';
import { initializeView } from './core.thunks';
import { performAutoSave } from '@/state/thunks/version';
import { saveNewEdit } from '@/state/thunks/edit-history';
import { isPathAllowed } from '@/utils/path-filter';

/**
 * Thunks related to handling application and vault events.
 */

export const handleMetadataChange = (file: TFile, cache: CachedMetadata): AppThunk => async (dispatch, getState, services) => {
    if (shouldAbort(services, getState)) return;
    
    if (file.extension !== 'md') return;

    const state = getState().app;
    if (state.status === AppStatus.READY && state.isProcessing && state.file?.path === file.path) {
        return;
    }
    if (state.status === AppStatus.LOADING && state.file?.path === file.path) {
        return;
    }

    const manifestManager = services.manifestManager;
    const plugin = services.plugin;
    const noteIdKey = plugin.settings.noteIdFrontmatterKey;
    const legacyKeys = plugin.settings.legacyNoteIdFrontmatterKeys;

    const fileCache = cache;
    const newNoteIdFromFrontmatter = fileCache?.frontmatter?.[noteIdKey] ?? null;
    const oldNoteIdInManifest = await manifestManager.getNoteIdByPath(file.path);
    
    // Race Check: Ensure context hasn't changed during async ID lookup
    if (shouldAbort(services, getState)) return;

    let idChanged = false;
    
    if (typeof newNoteIdFromFrontmatter === 'string' && newNoteIdFromFrontmatter.trim() !== '') {
        // ID is present and valid
        idChanged = newNoteIdFromFrontmatter !== oldNoteIdInManifest;
    } else {
        // Primary ID missing. Check legacy keys.
        let foundLegacyId = false;
        if (legacyKeys && legacyKeys.length > 0) {
            for (const legacyKey of legacyKeys) {
                const legacyId = fileCache?.frontmatter?.[legacyKey];
                if (typeof legacyId === 'string' && legacyId.trim() !== '') {
                    // Found a valid legacy ID. Treat as if ID exists.
                    // If it matches manifest, then ID hasn't changed (just key).
                    if (legacyId === oldNoteIdInManifest) {
                        foundLegacyId = true;
                        break;
                    }
                }
            }
        }

        if (foundLegacyId) {
            idChanged = false;
        } else {
            // ID is truly missing (neither primary nor legacy found)
            idChanged = null !== oldNoteIdInManifest;
        }
    }

    if (idChanged) {
        manifestManager.invalidateCentralManifestCache();

        const currentState = getState().app;
        if ((currentState.status === AppStatus.READY || currentState.status === AppStatus.LOADING) && currentState.file?.path === file.path) {
            dispatch(initializeView(undefined));
        }
    }
};

export const handleFileRename = (file: TFile, oldPath: string): AppThunk => async (dispatch, getState, services) => {
    if (shouldAbort(services, getState)) return;
    if (file.extension !== 'md' && file.extension !== 'base') return;

    const plugin = services.plugin;
    const noteManager = services.noteManager;
    const manifestManager = services.manifestManager;
    
    const debouncerInfo = plugin.autoSaveDebouncers.get(oldPath);
    if (debouncerInfo) {
        debouncerInfo.debouncer.cancel();
        plugin.autoSaveDebouncers.delete(oldPath);
    }

    const oldNoteId = await manifestManager.getNoteIdByPath(oldPath);
    
    // Handle the rename, which may involve updating the ID if it depends on the path
    await noteManager.handleNoteRename(file, oldPath);
    
    const state = getState().app;
    // Re-initialize view if the active file was the one renamed
    if (state.file?.path === oldPath || (oldNoteId && state.noteId === oldNoteId)) {
        dispatch(initializeView(undefined));
    }
};

/** Deletions of note data that are running now, by note ID. */
const trashRunsInProgress = new Map<string, Promise<void>>();

export const handleFileDelete = (file: TAbstractFile): AppThunk => async (dispatch, getState, services) => {
    if (shouldAbort(services, getState)) return;
    
    // 1. Ignore hidden files and folders (dotfiles)
    if (file.path.split('/').some(part => part.startsWith('.'))) return;

    const manifestManager = services.manifestManager;
    const editHistoryManager = services.editHistoryManager;
    const uiService = services.uiService;
    const plugin = services.plugin;
    const eventBus = services.eventBus;
    const trashService = services.trashService;

    // Helper to move all data of a specific note ID to the trash. Overlapping calls for the same
    // note share one run: a note inside a deleted folder is reported as a file and as part of the folder.
    const deleteDataForNote = (noteId: string, notePath: string): Promise<void> => {
        const running = trashRunsInProgress.get(noteId);
        if (running) return running;
        const run = moveNoteDataToTrash(noteId, notePath).finally(() => trashRunsInProgress.delete(noteId));
        trashRunsInProgress.set(noteId, run);
        return run;
    };

    const moveNoteDataToTrash = async (noteId: string, notePath: string): Promise<void> => {
        try {
            // 1. Move the history folder (versions, version manifest, edit-history .vctrl files) to
            // .eidologiesdb/.trash/{noteId} and remove the note from the central manifest.
            // The edit history is written to disk first, so it survives in the moved folder.
            await trashService.moveToTrash(noteId, notePath);
            
            // 2. Delete the edit-history rows in IndexedDB. They are rebuilt from the
            // .vctrl files in the trashed folder if the note is restored.
            await editHistoryManager.deleteNoteHistory(noteId);
            
            // 3. Clear Timeline (IndexedDB) via Event Bus
            // TimelineManager listens to 'history-deleted' and clears the timeline for the note
            eventBus.trigger('history-deleted', noteId);
            
            console.log(`VC: Deleted version control data for "${notePath}" (ID: ${noteId})`);
        } catch (error) {
            console.error(`VC: Failed to delete data for "${notePath}"`, error);
        }
    };

    let deletedCount = 0;

    if (file instanceof TFile) {
        // Single File Deletion
        // Ignore files that are not .md or .base
        if (file.extension !== 'md' && file.extension !== 'base') return;

        // Cancel auto-save if active
        const debouncerInfo = plugin.autoSaveDebouncers.get(file.path);
        if (debouncerInfo) {
            debouncerInfo.debouncer.cancel();
            plugin.autoSaveDebouncers.delete(file.path);
        }

        const noteId = await manifestManager.getNoteIdByPath(file.path);
        if (noteId) {
            await deleteDataForNote(noteId, file.path);
            deletedCount++;
        }

    } else if (file instanceof TFolder) {
        // Folder Deletion
        // Check all tracked notes to see if they were inside this folder
        const centralManifest = await manifestManager.loadCentralManifest();
        const folderPathPrefix = file.path + '/';
        
        const notesToDelete = Object.entries(centralManifest.notes).filter(([_, entry]) => 
            entry.notePath.startsWith(folderPathPrefix)
        );

        if (notesToDelete.length > 0) {
            console.log(`VC: Folder "${file.path}" deleted. Cleaning up ${notesToDelete.length} affected notes.`);
            
            for (const [noteId, entry] of notesToDelete) {
                // Cancel auto-save if active
                const debouncerInfo = plugin.autoSaveDebouncers.get(entry.notePath);
                if (debouncerInfo) {
                    debouncerInfo.debouncer.cancel();
                    plugin.autoSaveDebouncers.delete(entry.notePath);
                }

                await deleteDataForNote(noteId, entry.notePath);
                deletedCount++;
            }
        }
    }

    // Feedback and State Update
    if (deletedCount > 0) {
        // Show Notice
        if (deletedCount === 1) {
            uiService.showNotice(`History of "${file.name}" moved to the Eidology trash. Use "Restore deleted note history" to recover it.`);
        } else {
            uiService.showNotice(`History of ${deletedCount} notes in "${file.name}" moved to the Eidology trash. Use "Restore deleted note history" to recover it.`);
        }
        
        // Clear active note if it was deleted or inside deleted folder
        const state = getState().app;
        const activePath = state.file?.path;
        
        if (activePath) {
            const isAffected = file.path === activePath || activePath.startsWith(file.path + '/');
            if (isAffected) {
                dispatch(appSlice.actions.clearActiveNote());
            }
        }
        
        // Ensure cache is fresh
        manifestManager.invalidateCentralManifestCache();
    }
};

export const handleVaultSave = (file: TFile): AppThunk => async (dispatch, _getState, services) => {
    if (shouldAbort(services, _getState)) return;

    // Filter: Only allow .md and .base files
    if (file.extension !== 'md' && file.extension !== 'base') return;

    // Filter: Ignore files in hidden folders (starting with .)
    if (file.path.split('/').some(part => part.startsWith('.'))) return;

    const noteManager = services.noteManager;
    const manifestManager = services.manifestManager;
    const plugin = services.plugin;
  
    const noteId = await noteManager.getNoteId(file) ?? await manifestManager.getNoteIdByPath(file.path);
    if (!noteId) return;
  
    // Check Version Settings
    const versionSettings = await resolveSettings(noteId, 'version', services);
    // Check Edit Settings
    const editSettings = await resolveSettings(noteId, 'edit', services);
    
    const debouncerInfo = plugin.autoSaveDebouncers.get(file.path);

    // If neither wants auto-save, cancel and return
    if (!versionSettings.autoSaveOnSave && !editSettings.autoSaveOnSave) {
        if (debouncerInfo) {
            debouncerInfo.debouncer.cancel();
            plugin.autoSaveDebouncers.delete(file.path);
        }
        return;
    }
    
    // We use the shorter interval if both are enabled, or the enabled one.
    let intervalMs = 2000;
    if (versionSettings.autoSaveOnSave && editSettings.autoSaveOnSave) {
        intervalMs = Math.min(versionSettings.autoSaveOnSaveInterval, editSettings.autoSaveOnSaveInterval) * 1000;
    } else if (versionSettings.autoSaveOnSave) {
        intervalMs = versionSettings.autoSaveOnSaveInterval * 1000;
    } else {
        intervalMs = editSettings.autoSaveOnSaveInterval * 1000;
    }

    if (debouncerInfo && debouncerInfo.interval === intervalMs) {
        debouncerInfo.debouncer(file);
    } else {
        debouncerInfo?.debouncer.cancel();

        const newDebouncerFunc = debounce(
            (f: TFile) => {
                // Trigger saves based on settings
                if (versionSettings.autoSaveOnSave) {
                    dispatch(performAutoSave(f));
                }
                if (editSettings.autoSaveOnSave) {
                    // The first edit of a note is created automatically when edit history
                    // tracks this path. Otherwise only notes that already have edits are saved.
                    const allowInit = editSettings.autoRegisterNotes
                        && isPathAllowed(f.path, { pathFilters: editSettings.pathFilters });
                    dispatch(saveNewEdit({ isAuto: true, allowInit }));
                }
            },
            intervalMs
        );

        plugin.autoSaveDebouncers.set(file.path, { debouncer: newDebouncerFunc, interval: intervalMs });
        
        newDebouncerFunc(file);
    }
};
