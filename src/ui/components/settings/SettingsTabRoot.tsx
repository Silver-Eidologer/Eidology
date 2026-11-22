import type { FC } from 'react';
import { GlobalSettings } from './GlobalSettings';
import { NoteSettingsControls } from './setting-controls/NoteSettingsControls';
import { AutoRegisterSettings } from './setting-controls/AutoRegisterSettings';
import { SettingsScopeProvider } from './SettingsScope';

/**
 * Plugin settings page. All settings are shown on a single page, grouped into
 * General Settings, Version Settings and Edit Settings.
 */
export const SettingsTabRoot: FC = () => {
    return (
        <div className="v-settings-tab-content">
            <section className="v-settings-section" aria-labelledby="settings-general-title">
                <h2 id="settings-general-title">General Settings</h2>
                <GlobalSettings showTitle={false} showDefaults={false} />
            </section>

            <section className="v-settings-section" aria-labelledby="settings-versions-title">
                <h2 id="settings-versions-title">Version Settings</h2>
                <p className="setting-item-description">
                    These settings apply to all notes using Version History unless overridden by specific note settings.
                </p>
                <SettingsScopeProvider value="versions">
                    <div style={{ marginBottom: 'var(--size-4-4)' }}>
                        <AutoRegisterSettings settingKey="versionHistorySettings" />
                    </div>
                    <NoteSettingsControls disabled={false} />
                </SettingsScopeProvider>
            </section>

            <section className="v-settings-section" aria-labelledby="settings-edits-title">
                <h2 id="settings-edits-title">Edit Settings</h2>
                <p className="setting-item-description">
                    These settings apply to all notes using Edit History unless overridden by specific note settings.
                </p>
                <SettingsScopeProvider value="edits">
                    <div style={{ marginBottom: 'var(--size-4-4)' }}>
                        <AutoRegisterSettings settingKey="editHistorySettings" />
                    </div>
                    <NoteSettingsControls disabled={false} />
                </SettingsScopeProvider>
            </section>
        </div>
    );
};
