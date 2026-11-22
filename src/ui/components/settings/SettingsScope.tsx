import { createContext, useCallback, useContext } from 'react';
import { useAppDispatch, useAppSelector } from '@/ui/hooks';
import { thunks } from '@/state';
import type { HistorySettings, ViewMode } from '@/types';

/**
 * Scope of the history setting controls.
 *
 * Without a provider, controls act on the note currently open in the sidebar view: they read
 * the effective settings and follow the active view mode. Inside a provider, controls act on
 * the global defaults of the given mode, regardless of the open note or the active view mode.
 * The plugin settings tab uses this to show Version Settings and Edit Settings on one page.
 */
const SettingsScopeContext = createContext<ViewMode | null>(null);

export const SettingsScopeProvider = SettingsScopeContext.Provider;

/** History mode the control belongs to. */
export function useSettingsViewMode(): ViewMode {
    const scope = useContext(SettingsScopeContext);
    const activeMode = useAppSelector(state => state.app.viewMode);
    return scope ?? activeMode;
}

/** Current value of a history setting in the control's scope. */
export function useHistorySetting<K extends keyof HistorySettings>(key: K): HistorySettings[K] {
    const scope = useContext(SettingsScopeContext);
    return useAppSelector(state => {
        if (scope === null) return state.app.effectiveSettings[key];
        const defaults = scope === 'versions'
            ? state.app.settings.versionHistorySettings
            : state.app.settings.editHistorySettings;
        return (defaults as HistorySettings)[key];
    });
}

/** Function that saves a partial history settings update in the control's scope. */
export function useUpdateHistorySettings(): (update: Partial<HistorySettings>) => void {
    const dispatch = useAppDispatch();
    const scope = useContext(SettingsScopeContext);
    return useCallback((update: Partial<HistorySettings>) => {
        dispatch(scope === null ? thunks.updateSettings(update) : thunks.updateGlobalDefaults(scope, update));
    }, [dispatch, scope]);
}
