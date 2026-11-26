import { createAsyncThunk } from '@reduxjs/toolkit';
import { TFile } from 'obsidian';
import { appSlice } from '@/state';
import { resolveSettings } from '@/state/utils/settingsUtils';
import { shouldAbort } from '@/state/utils/guards';
import type { ThunkConfig } from '@/state/store';
import type { VersionHistoryEntry } from '@/types';
import { historyApi } from '@/state/apis/history.api';
import { validateReadyState, validateFileExists } from '@/state/utils/thunk-validation';
import { isShownInView, pickBranchName } from '@/state/utils/auto-save-target';

export interface SaveEditOptions {
    isAuto?: boolean;
    allowInit?: boolean;
    /**
     * Path of the file to save. When set, the save does not depend on the sidebar view: the file,
     * its note ID and its branch are resolved from the path, and the view state is updated only
     * if the view shows this file. Used by automatic saves.
     */
    filePath?: string;
}

/**
 * Saves a new edit for the current note.
 */
export const saveNewEdit = createAsyncThunk<
    { newEditEntry: VersionHistoryEntry; deletedIds: string[] } | null,
    SaveEditOptions | boolean | undefined,
    ThunkConfig
>(
    'editHistory/saveNewEdit',
    async (arg, { dispatch, getState, extra: services, rejectWithValue }) => {
        if (shouldAbort(services, getState)) return rejectWithValue('Aborted');

        // Normalize argument
        const options: SaveEditOptions = typeof arg === 'boolean' 
            ? { isAuto: arg, allowInit: !arg } 
            : (arg || { isAuto: false, allowInit: true });
        
        const { isAuto = false, allowInit = !isAuto, filePath } = options;
        const direct = filePath !== undefined;

        const state = getState().app;
        const uiService = services.uiService;
        const app = services.app;
        const editHistoryManager = services.editHistoryManager;
        const noteManager = services.noteManager;
        const manifestManager = services.manifestManager;
        const backgroundTaskManager = services.backgroundTaskManager;
        const eventBus = services.eventBus;

        let file: TFile;
        let knownNoteId: string | null;
        if (direct) {
            const found = app.vault.getAbstractFileByPath(filePath);
            if (!(found instanceof TFile)) {
                console.warn(`Eidology: An automatic edit was skipped because "${filePath}" no longer exists.`);
                return rejectWithValue('Aborted');
            }
            file = found;
            knownNoteId = (await noteManager.getNoteId(found)) ?? (await manifestManager.getNoteIdByPath(found.path));

            if (isAuto && !allowInit) {
                if (!knownNoteId) return null;
                if (!(await editHistoryManager.getEditManifest(knownNoteId))) return null;
            }
        } else {
            if (!validateReadyState(state, uiService, isAuto)) {
                // An automatic save that cannot run must not put the view into the error state.
                return rejectWithValue(isAuto ? 'Aborted' : 'Not ready');
            }

            const stateFile = state.file;
            if (!validateFileExists(stateFile, uiService, isAuto)) {
                return rejectWithValue(isAuto ? 'Aborted' : 'No file');
            }
            file = stateFile;
            knownNoteId = state.noteId;

            if (isAuto && !allowInit) {
                if (!state.noteId) {
                    return null;
                }

                const manifest = await editHistoryManager.getEditManifest(state.noteId);
                if (!manifest) {
                    return null;
                }
            }
        }

        // The view state is updated only when the view shows the saved file.
        const shownInView = isShownInView(state.file?.path, direct ? file.path : undefined);

        try {
            const liveFile = app.vault.getAbstractFileByPath(file.path);
            if (!(liveFile instanceof TFile)) throw new Error('File not found');

            let noteId = knownNoteId;

            if (!noteId) {
                noteId = await noteManager.getOrCreateNoteId(liveFile);
                if (!noteId) throw new Error('Could not generate Note ID');

                let noteManifest = await manifestManager.loadNoteManifest(noteId);
                if (!noteManifest) {
                    noteManifest = await manifestManager.createNoteEntry(
                        noteId,
                        liveFile.path
                    );
                }

                if (shownInView) {
                    dispatch(appSlice.actions.updateNoteIdInState({ noteId }));
                }
                dispatch(historyApi.util.invalidateTags([{ type: 'EditHistory', id: noteId }]));
            }

            const content = await app.vault.adapter.read(liveFile.path);
            const settings = await resolveSettings(noteId, 'edit', services);
            const maxVersions = settings.maxVersionsPerNote;
            // Without the view the branch is not in the state yet; the note manifest is the source of truth.
            const currentBranch = direct
                ? pickBranchName((await manifestManager.loadNoteManifest(noteId))?.currentBranch)
                : state.currentBranch || 'main';

            const result = await editHistoryManager.createEdit(
                noteId,
                currentBranch,
                content,
                file.path,
                maxVersions
            );

            if (shouldAbort(services, getState, direct ? undefined : { noteId })) return rejectWithValue('Context changed');

            if (result) {
                const { entry: newEditEntry, deletedIds } = result;

                eventBus.trigger('version-saved', noteId);

                if (!isAuto) {
                    uiService.showNotice(`Edit #${newEditEntry.versionNumber} saved.`);
                    backgroundTaskManager.resetTimer('edit');
                }
                
                // Invalidate RTK Query tags to update list and timeline
                dispatch(historyApi.util.invalidateTags([
                    { type: 'EditHistory', id: noteId },
                    { type: 'Timeline', id: noteId }
                ]));

                return { newEditEntry, deletedIds };
            } else {
                if (!isAuto) {
                    uiService.showNotice('No changes detected since last edit.');
                }
                return null;
            }

        } catch (error) {
            console.error('VC: Failed to save edit', error);
            if (!isAuto) uiService.showNotice('Failed to save edit.');
            return rejectWithValue(String(error));
        }
    }
);
