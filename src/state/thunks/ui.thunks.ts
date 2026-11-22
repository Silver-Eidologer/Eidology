import type { AppThunk } from '@/state';
import { appSlice } from '@/state';
import type { VersionHistoryEntry, ViewMode } from '@/types';
import { AppStatus, type ActionItem, type SortOrder, type SortProperty, type SortDirection } from '@/state';
import { loadEffectiveSettingsForNote } from './core.thunks';
import { shouldAbort } from '@/state/utils/guards';
import { versionActions } from '@/ui/VersionActions';
import { editActions } from '@/ui/EditActions';
import { createBranch, switchBranch, requestDeleteBranch } from '@/state/thunks/version';
import { historyApi } from '@/state/apis/history.api';

/**
 * Thunks related to UI interactions, such as opening panels, tabs, and modals.
 */

let lastToggleTime = 0;

export const toggleViewMode = (): AppThunk => async (dispatch, getState, services) => {
    // Throttle rapid switching to prevent UI instability
    const now = Date.now();
    if (now - lastToggleTime < 500) return;
    lastToggleTime = now;

    if (shouldAbort(services, getState)) return;
    
    // Defensive check for settings availability
    if (!services.plugin?.settings) {
        console.warn("Version Control: Plugin settings not available in toggleViewMode");
        return;
    }
    
    const state = getState().app;
    const currentMode = state.viewMode;
    const newMode: ViewMode = currentMode === 'versions' ? 'edits' : 'versions';

    // Block access to Edit History for .base files if no versions exist
    if (state.file?.extension === 'base' && currentMode === 'versions') {
        const noteId = state.noteId;
        let versionCount = 0;
        if (noteId) {
             const historyResult = historyApi.endpoints.getVersionHistory.select(noteId)(getState());
             versionCount = historyResult.data?.length ?? 0;
        }
        
        if (versionCount === 0) {
            services.uiService.showNotice("Cannot access Edit History for base files until a version is saved.", 5000);
            return;
        }
    }
    
    // 1. Pre-emptively reset effective settings to global defaults for the new mode
    const plugin = services.plugin;
    const globalDefaults = newMode === 'versions' 
        ? plugin.settings.versionHistorySettings 
        : plugin.settings.editHistorySettings;
    
    dispatch(appSlice.actions.updateEffectiveSettings({ ...globalDefaults, isGlobal: true }));

    // 2. Update State (This clears panel, diffRequest, etc. and sets status to LOADING)
    // This also increments contextVersion, invalidating previous loads.
    dispatch(appSlice.actions.setViewMode(newMode));
    
    // Capture the new context version
    const contextVersion = getState().app.contextVersion;

    // 3. Load Data for New Mode
    const { noteId, file } = state;

    // Handle Unregistered Note Case
    if (file && !noteId) {
        // No history to load, state is already set by setViewMode
        return;
    }

    // Handle Registered Note Case
    if (noteId && file) {
        // STRICT SYNCHRONIZATION:
        // We must await settings resolution BEFORE loading history.
        await dispatch(loadEffectiveSettingsForNote(noteId));
        
        // Race Check: Ensure context matches after settings load
        if (shouldAbort(services, getState, { contextVersion })) return;

        // Data loading is handled by RTK Query hooks in the UI components.
        // We don't need to manually dispatch load actions here.

        // CRITICAL: Sync watch mode AFTER settings are loaded.
        if (!shouldAbort(services, getState, { contextVersion })) {
            services.backgroundTaskManager.syncWatchMode();
        }
    }
};

export const showVersionContextMenu = (version: VersionHistoryEntry): AppThunk => (dispatch, getState, services) => {
    if (shouldAbort(services, getState)) return;
    const state = getState().app;

    if (state.status !== AppStatus.READY || state.noteId !== version.noteId) {
        return;
    }

    const isEdits = state.viewMode === 'edits';
    const actionsList = isEdits ? editActions : versionActions;
    const titlePrefix = isEdits ? 'Edit #' : 'V';

    const items: ActionItem<string>[] = actionsList.map(action => ({
        id: action.id,
        data: action.id,
        text: action.title,
        subtext: action.tooltip,
        icon: action.icon,
    }));

    const onChooseAction = (actionId: string): AppThunk => (_dispatch, _getState, services) => {
        const action = actionsList.find(a => a.id === actionId);
        if (action) {
            const store = services.store;
            action.actionHandler(version, store);
        }
    };

    dispatch(appSlice.actions.openPanel({
        type: 'action',
        title: `Actions for ${titlePrefix}${version.versionNumber}`,
        items,
        onChooseAction,
        showFilter: false,
    }));
};

export const showSortMenu = (): AppThunk => (dispatch, getState, services) => {
    if (shouldAbort(services, getState)) return;
    const state = getState().app;

    if (state.status !== AppStatus.READY) return;
    
    const sortOptions: { label: string; property: SortProperty; direction: SortDirection }[] = [
        { label: 'Version (new to old)', property: 'versionNumber', direction: 'desc' },
        { label: 'Version (old to new)', property: 'versionNumber', direction: 'asc' },
        { label: 'Timestamp (new to old)', property: 'timestamp', direction: 'desc' },
        { label: 'Timestamp (old to new)', property: 'timestamp', direction: 'asc' },
        { label: 'Name (A to Z)', property: 'name', direction: 'asc' },
        { label: 'Name (Z to A)', property: 'name', direction: 'desc' },
        { label: 'Size (largest to smallest)', property: 'size', direction: 'desc' },
        { label: 'Size (smallest to largest)', property: 'size', direction: 'asc' },
    ];

    const items: ActionItem<SortOrder>[] = sortOptions.map(opt => {
        const isSelected = state.sortOrder.property === opt.property && state.sortOrder.direction === opt.direction;
        return {
            id: `${opt.property}-${opt.direction}`,
            data: { property: opt.property, direction: opt.direction },
            text: opt.label,
            icon: 'blank',
            isSelected,
        };
    });

    const onChooseAction = (sortOrder: SortOrder): AppThunk => (dispatch) => {
        dispatch(appSlice.actions.setSortOrder(sortOrder));
        dispatch(appSlice.actions.closePanel());
    };

    dispatch(appSlice.actions.openPanel({
        type: 'action',
        title: 'Sort by',
        items,
        onChooseAction,
        showFilter: false,
    }));
};

export const showBranchSwitcher = (): AppThunk => (dispatch, getState, services) => {
    if (shouldAbort(services, getState)) return;
    const state = getState().app;
    if (state.status !== AppStatus.READY || !state.noteId) return;

    const { availableBranches, currentBranch } = state;

    const items: ActionItem<string>[] = availableBranches.map(branchName => ({
        id: branchName,
        data: branchName,
        text: branchName,
        isSelected: branchName === currentBranch,
    }));

    const onChooseAction = (branchName: string): AppThunk => (dispatch) => {
        dispatch(switchBranch(branchName));
    };

    const onCreateAction = (newBranchName: string): AppThunk => (dispatch) => {
        dispatch(createBranch(newBranchName));
    };

    const contextActions = (item: ActionItem<string>): ActionItem<string>[] => {
        if (item.id === '__create__') return [];
        return [
            { id: 'delete', data: 'delete', text: 'Delete Branch', icon: 'trash' }
        ];
    };

    const onContextAction = (actionId: string, branchName: string): AppThunk => (dispatch) => {
        if (actionId === 'delete') {
            dispatch(requestDeleteBranch(branchName));
        }
    };

    dispatch(appSlice.actions.openPanel({
        type: 'action',
        title: 'Switch or create branch',
        items,
        onChooseAction,
        onCreateAction,
        contextActions,
        onContextAction,
        showFilter: true,
    }));
};

export const showNotice = (message: string, duration?: number): AppThunk => (_dispatch, _getState, services) => {
    if (shouldAbort(services, _getState)) return;
    const uiService = services.uiService;
    uiService.showNotice(message, duration);
};

export const closeSettingsPanelWithNotice = (message: string, duration?: number): AppThunk => (dispatch, _getState, services) => {
    if (shouldAbort(services, _getState)) return;
    const uiService = services.uiService;
    dispatch(appSlice.actions.closePanel());
    uiService.showNotice(message, duration);
};

export const openDashboard = (): AppThunk => (dispatch, getState, services) => {
    if (shouldAbort(services, getState)) return;
    const state = getState().app;
    if (state.status !== AppStatus.READY) return;

    dispatch(appSlice.actions.openPanel({ type: 'dashboard' }));
};

export const openPreview = (version: VersionHistoryEntry): AppThunk => (dispatch, getState, services) => {
    if (shouldAbort(services, getState)) return;
    
    dispatch(appSlice.actions.openPanel({
        type: 'preview',
        version
    }));
};
