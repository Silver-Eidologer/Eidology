import { createAsyncThunk } from '@reduxjs/toolkit';
import { TFile } from 'obsidian';
import * as v from 'valibot';
import { AppStatus } from '@/state';
import { initializeView } from '@/state/thunks/core.thunks';
import { shouldAbort } from '@/state/utils/guards';
import type { SaveVersionOptions } from '../types';
import type { SaveVersionResult } from '@/types';
import type { ThunkConfig } from '@/state/store';
import { SaveVersionOptionsSchema } from '@/state/thunks/schemas';
import {
    validateReadyState,
    validateFileExists,
    validateNotRenaming,
} from '@/state/utils/thunk-validation';
import {
    handleVersionError,
    notifyVersionSaved,
    notifyVersionSavedInBackground,
    notifyDuplicateContent,
} from '../helpers';
import { historyApi } from '@/state/apis/history.api';

/**
 * Saves a new version of the active file.
 */
export const saveNewVersion = createAsyncThunk<
    SaveVersionResult | null,
    SaveVersionOptions,
    ThunkConfig
>(
    'version/saveNewVersion',
    async (options = {}, { dispatch, getState, extra: services, rejectWithValue }) => {
        if (shouldAbort(services, getState)) return rejectWithValue('Aborted');

        try {
            v.parse(SaveVersionOptionsSchema, options);
        } catch (validationError) {
            console.error("Version Control: Invalid SaveVersionOptions", validationError);
            return rejectWithValue('Invalid options');
        }

        const { isAuto = false, allowInit = !isAuto, settings, filePath } = options;
        // With a file path the save does not depend on the sidebar view (see SaveVersionOptions.filePath).
        const direct = filePath !== undefined;
        const uiService = services.uiService;
        const initialState = getState().app;

        if (!validateNotRenaming(initialState.isRenaming, uiService, 'save version')) {
            return rejectWithValue('Renaming in progress');
        }

        const versionManager = services.versionManager;
        const manifestManager = services.manifestManager;
        const noteManager = services.noteManager;
        const app = services.app;
        const backgroundTaskManager = services.backgroundTaskManager;

        let targetFile: TFile;
        if (direct) {
            const found = app.vault.getAbstractFileByPath(filePath);
            if (!(found instanceof TFile)) {
                console.warn(`Eidology: An automatic save was skipped because "${filePath}" no longer exists.`);
                return rejectWithValue('Aborted');
            }
            targetFile = found;

            if (isAuto && !allowInit) {
                const noteId = (await noteManager.getNoteId(found)) ?? (await manifestManager.getNoteIdByPath(found.path));
                // An untracked note, or one without history, is never initialized by an automatic save.
                if (!noteId || !(await manifestManager.loadNoteManifest(noteId))) return null;
            }
        } else {
            if (!validateReadyState(initialState, uiService, isAuto)) {
                // An automatic save that cannot run must not put the view into the error state.
                return rejectWithValue(isAuto ? 'Aborted' : 'Not ready');
            }

            const initialFileFromState = initialState.file;
            if (!validateFileExists(initialFileFromState, uiService, isAuto)) {
                return rejectWithValue(isAuto ? 'Aborted' : 'No file');
            }
            targetFile = initialFileFromState;

            // AUTHORITY CHECK: Prevent auto-saves from initializing history
            // If allowInit is true (e.g. manual save or autoRegisterNote), we skip this check
            // and proceed to create ID and manifest if missing.
            if (isAuto && !allowInit) {
                // Case 1: Note is completely untracked (no ID in state)
                if (!initialState.noteId) {
                    return null;
                }

                // Case 2: Note has ID, but might not have a manifest (orphaned ID or just generated)
                const manifest = await manifestManager.loadNoteManifest(initialState.noteId);
                if (!manifest) {
                    // No history exists, and this is an auto-save without init authority. Abort.
                    return null;
                }
            }
        }

        try {
            const liveFile = app.vault.getAbstractFileByPath(targetFile.path);
            if (!(liveFile instanceof TFile)) {
                if (direct) {
                    console.warn(`Eidology: An automatic save was skipped because "${targetFile.path}" no longer exists.`);
                    return rejectWithValue('Aborted');
                }
                uiService.showNotice(
                    `Eidology: Cannot save because the note "${targetFile.basename}" may have been moved or deleted.`
                );
                dispatch(initializeView(undefined));
                return rejectWithValue('File not found');
            }

            let settingsToUse;
            if (settings) {
                settingsToUse = settings;
            } else {
                const effectiveHistorySettings = initialState.effectiveSettings;
                settingsToUse = {
                    ...initialState.settings,
                    ...effectiveHistorySettings,
                };
            }

            const saveOptions = {
                isAuto,
                settings: settingsToUse,
                ...(options.name !== undefined ? { name: options.name } : {}),
                ...(options.force !== undefined ? { force: options.force } : {}),
            };

            const result = await versionManager.saveNewVersionForFile(liveFile, saveOptions);

            if (!isAuto) {
                backgroundTaskManager.resetTimer('version');
            }

            // A save that names its file does not depend on the view, so a change of the view is not a reason to discard it.
            if (!direct && shouldAbort(services, getState, { filePath: targetFile.path, status: AppStatus.READY })) {
                if (result.status === 'saved') {
                    notifyVersionSavedInBackground(uiService, result.displayName, liveFile);
                    // Even if context changed, we should invalidate tags for the noteId involved
                    if (result.newNoteId) {
                        dispatch(historyApi.util.invalidateTags([
                            { type: 'VersionHistory', id: result.newNoteId },
                            { type: 'Branches', id: result.newNoteId }
                        ]));
                    }
                }
                return rejectWithValue('Context changed');
            }

            if (result.status === 'duplicate' || result.status === 'skipped_min_lines') {
                if (!isAuto && result.status === 'duplicate') {
                    notifyDuplicateContent(uiService);
                }
                return null;
            }

            if (result.newVersionEntry) {
                if (!isAuto) {
                    notifyVersionSaved(uiService, result.displayName, liveFile);
                }
                
                // Invalidate RTK Query tags to refresh UI
                if (result.newNoteId) {
                    dispatch(historyApi.util.invalidateTags([
                        { type: 'VersionHistory', id: result.newNoteId },
                        { type: 'Branches', id: result.newNoteId }
                    ]));
                }
                
                return result;
            }

            return null;

        } catch (error) {
            handleVersionError(error, 'saveNewVersion', uiService, isAuto);
            if (!direct) dispatch(initializeView(undefined));
            return rejectWithValue(error instanceof Error ? error.message : String(error));
        } finally {
            if (!shouldAbort(services, getState)) {
                backgroundTaskManager.syncWatchMode();
            }
        }
    }
);
