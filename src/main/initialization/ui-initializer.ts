import { Notice } from 'obsidian';
import type { AppStore } from '@/state';
import { thunks } from '@/state';
import { registerViews, addRibbonIcon, registerCommands } from '@/setup';
import { VersionControlSettingTab } from '@/ui/settings-tab';
import type VersionControlPlugin from '@/main/VersionControlPlugin';
import { startupMark } from '@/utils/startup-timing';

/**
 * Handles UI component registration and initialization.
 */
export class UIInitializer {
    constructor(
        private plugin: VersionControlPlugin,
        private store: AppStore
    ) {}

    /**
     * Registers all UI components (views, ribbon icon, commands, settings tab).
     */
    registerUIComponents(): void {
        try {
            // Register the settings tab
            this.plugin.addSettingTab(new VersionControlSettingTab(this.plugin.app, this.plugin, this.store));

            // Register views, ribbon icon, and commands
            registerViews(this.plugin, this.store);
            addRibbonIcon(this.plugin, this.store);
            registerCommands(this.plugin, this.store);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error("Version Control: UI component registration failed", error);
            throw new Error(`UI component registration failed: ${errorMessage}`);
        }
    }

    /**
     * Initializes the view after workspace layout is ready.
     */
    initializeView(): void {
        try {
            // This thunk will now load the correct settings for the active note (or defaults)
            // by using the recommended API to find the active view.
            startupMark('view init: dispatched');
            Promise.resolve(this.store.dispatch(thunks.initializeView()))
                .finally(() => startupMark('view init: thunk settled'));
        } catch (error) {
            console.error("Version Control: View initialization failed", error);
            new Notice("Failed to initialize view. Please check the console for details.");
        }
    }

}
