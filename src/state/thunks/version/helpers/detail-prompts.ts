import type { HistorySettings } from '@/types';
import type { ViewMode } from '@/types';

/** Fields the save dialog asks for. */
export interface VersionDetailPrompts {
    name: boolean;
    description: boolean;
}

/**
 * Decides which fields the dialog shown when a version is saved manually asks for.
 *
 * In the versions view the settings in effect for the open note apply. In the edits view
 * those settings belong to edit history, so the global version defaults apply instead.
 *
 * @returns The fields to ask for. Both false means no dialog is shown.
 */
export function resolveVersionDetailPrompts(
    viewMode: ViewMode,
    effectiveSettings: Pick<HistorySettings, 'enableVersionNaming' | 'enableVersionDescription'>,
    globalVersionDefaults: Pick<HistorySettings, 'enableVersionNaming' | 'enableVersionDescription'>
): VersionDetailPrompts {
    const source = viewMode === 'versions' ? effectiveSettings : globalVersionDefaults;
    return {
        name: !!source.enableVersionNaming,
        description: !!source.enableVersionDescription,
    };
}
