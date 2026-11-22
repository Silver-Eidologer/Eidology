import { Plugin, WorkspaceLeaf } from 'obsidian';
import type { Debouncer } from 'obsidian';
import type { AppStore } from '@/state';
import type { CleanupManager, BackgroundTaskManager } from '@/core';
import type { VersionControlSettings } from '@/types';
import { SettingsInitializer } from '@/main/initialization';
import { PluginLoader, PluginUnloader } from '@/main/lifecycle';
import type { DebouncerInfo } from '@/main/types';
import type { Services } from '@/services-registry';

/**
 * Main plugin class for Version Control.
 * Orchestrates initialization, lifecycle, and event handling through modular components.
 */
export default class VersionControlPlugin extends Plugin {
    public services!: Services;
    public store!: AppStore;
    public cleanupManager!: CleanupManager;
    public backgroundTaskManager!: BackgroundTaskManager;
    public debouncedLeafChangeHandler?: Debouncer<[WorkspaceLeaf | null], void>;
    public autoSaveDebouncers = new Map<string, DebouncerInfo>();
    
    // Volatile state guards
    private _isUnloading: boolean = false;
    private _initialized: boolean = false;
    private _unloadPromise: Promise<void> | null = null;
    
    public settings!: VersionControlSettings;

    // Getter for isUnloading with type safety
    public get isUnloading(): boolean {
        return this._isUnloading;
    }

    // Setter for isUnloading with validation
    public set isUnloading(value: boolean) {
        if (typeof value !== 'boolean') {
            console.warn("Version Control: Invalid value passed to isUnloading setter", value);
            return;
        }
        this._isUnloading = value;
    }

    // Getter for initialization status
    public get initialized(): boolean {
        return this._initialized;
    }

    // Internal setter for initialization status
    public setInitialized(value: boolean): void {
        this._initialized = value;
    }

    override async onload() {
        // Defensive: Reset critical flags on load
        this._isUnloading = false;
        this._unloadPromise = null;

        const loader = new PluginLoader(this);
        await loader.load();
    }

    override async onunload() {
        // Idempotency: Prevent multiple unload operations
        if (this._unloadPromise) {
            return this._unloadPromise;
        }

        this._isUnloading = true;
        this._unloadPromise = this.performUnload();
        
        try {
            await this._unloadPromise;
        } catch (e) {
            console.error("Version Control: Unload promise rejected (unexpected)", e);
        }
    }

    private async performUnload(): Promise<void> {
        const unloader = new PluginUnloader(this);
        await unloader.unload();
    }

    /**
     * Saves settings to disk with validation.
     */
    async saveSettings(): Promise<void> {
        if (this.isUnloading) return;
        
        try {
            const settingsInitializer = new SettingsInitializer(this);
            await settingsInitializer.saveSettings();
        } catch (e) {
            console.error("Version Control: Failed to save settings", e);
        }
    }

    /**
     * Cancels all debounced operations.
     */
    public cancelDebouncedOperations(): void {
        try {
            this.debouncedLeafChangeHandler?.cancel();
            
            if (this.autoSaveDebouncers) {
                this.autoSaveDebouncers.forEach(info => {
                    try {
                        info.debouncer?.cancel();
                    } catch (e) {
                        console.warn('Eidology: Failed to cancel an auto-save debouncer.', e);
                    }
                });
                this.autoSaveDebouncers.clear();
            }
        } catch (error) {
            console.error("Version Control: Error cancelling debounced operations", error);
        }
    }

    /**
     * Completes any pending cleanup operations before shutdown.
     */
    public async completePendingOperations(): Promise<void> {
        try {
            // Ensure any critical, queued file operations are completed before shutdown.
            // This is wrapped in a try-catch to guarantee that the unload process continues
            // even if this step fails, which is critical for preventing resource leaks.
            
            // 1. Cleanup Manager tasks (e.g. deleting old versions)
            if (this.cleanupManager) {
                await this.cleanupManager.completePendingCleanups();
            }

            // 2. Flush Edit History writes (Critical for data integrity)
            // We must ensure that any buffered writes to .vctrl files are flushed to disk.
            if (this.services?.editHistoryManager) {
                await this.services.editHistoryManager.flushAllPendingWrites();
            }
        } catch (error) {
            console.error("Version Control: Error while completing pending operations on unload.", error);
        }
    }

    /**
     * Cleans up the service registry.
     */
    public async cleanupServices(): Promise<void> {
        try {
            if (this.services) {
                // Get services that hold state but aren't components.
                const centralRepo = this.services.centralManifestRepo;
                const noteRepo = this.services.noteManifestRepo;
                const queueService = this.services.queueService;
                const editHistoryManager = this.services.editHistoryManager;

                // Invalidate caches and clear all pending task queues to prevent orphaned operations.
                if (centralRepo) centralRepo.invalidateCache();
                if (noteRepo) noteRepo.clearCache();
                if (queueService) queueService.clearAll();
                
                // Explicitly terminate EditHistoryManager to clear IDB cache and stop worker
                if (editHistoryManager) {
                    try {
                        await editHistoryManager.terminate();
                    } catch (e) {
                        console.warn("Version Control: EditHistoryManager termination warning", e);
                    }
                }
            }
        } catch (error) {
            // This might happen if the services failed to initialize or were already cleaned up.
            console.error("Version Control: Error during services cleanup on unload.", error);
        }
    }
}
