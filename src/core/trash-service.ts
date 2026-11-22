import type { App } from 'obsidian';
import type VersionControlPlugin from '@/main';
import type { NoteManifest } from '@/types';
import type { PathService } from '@/core/storage/path-service';
import type { StorageService } from '@/core/storage/storage-service';
import type { VersionContentRepository } from '@/core/storage/version-content-repository';
import type { ManifestManager } from '@/core/manifest-manager';
import type { NoteManager } from '@/core/note-manager';
import type { EditHistoryManager } from '@/core/edit-history-manager/EditHistoryManager';
import { decodeBranchPathComponent } from '@/utils/branch-path';
import { TRASH_META_FILE, isTrashEntryExpired, parseTrashMeta, pickRestorePath, type TrashMeta } from '@/utils/trash';

/** Name of the version manifest file inside a note's history folder. */
const NOTE_MANIFEST_FILE = 'manifest.json';

/** A deleted note whose history is in the trash. */
export interface TrashEntry {
    noteId: string;
    /** Path the note had when it was deleted. */
    notePath: string;
    /** ISO date of the deletion. */
    deletedAt: string;
    /** Number of versions held, over all branches. 0 if the version manifest could not be read. */
    versionCount: number;
}

export interface RestoreResult {
    /** Path of the recreated note. */
    path: string;
    /** True when the original path was in use and another one was chosen. */
    renamed: boolean;
    /** False when the history held no version, so the note was created empty. */
    contentRecovered: boolean;
    /** Number of edit-history branches read back from their `.vctrl` files. */
    branchesLoaded: number;
}

/**
 * Keeps the history of deleted notes in `<db root>/.trash` so that it can be restored.
 *
 * Deleting a note moves its history folder to the trash instead of removing it. The folder
 * keeps the version files, the version manifest and the `.vctrl` files of the edit history.
 * The rows of the edit history in IndexedDB are not kept: they are rebuilt from the `.vctrl`
 * files when a note is restored. Because of that, the edit history of every branch is written
 * to disk before the move, even where disk persistence is turned off.
 */
export class TrashService {
    /** Moves to the trash that are running now, by note ID. */
    private readonly movesInProgress = new Map<string, Promise<boolean>>();

    constructor(
        private readonly app: App,
        private readonly plugin: VersionControlPlugin,
        private readonly pathService: PathService,
        private readonly storageService: StorageService,
        private readonly manifestManager: ManifestManager,
        private readonly editHistoryManager: EditHistoryManager,
        private readonly noteManager: NoteManager,
        private readonly versionContentRepo: VersionContentRepository
    ) {}

    /**
     * Moves the history of a deleted note to the trash and removes the note from the central manifest.
     *
     * Calls for the same note that overlap in time share one operation: Obsidian reports the
     * deletion of a note inside a deleted folder twice (for the file and for the folder), and
     * two moves of the same folder must not run side by side.
     *
     * @returns `false` if the note had no history folder, so nothing was moved.
     * @throws If the folder cannot be moved or described, or if the trash already holds an entry
     *         with history for the same note ID. In both cases the folder stays where it was.
     */
    moveToTrash(noteId: string, notePath: string): Promise<boolean> {
        const running = this.movesInProgress.get(noteId);
        if (running) return running;

        const operation = this.moveToTrashOnce(noteId, notePath).finally(() => {
            this.movesInProgress.delete(noteId);
        });
        this.movesInProgress.set(noteId, operation);
        return operation;
    }

    private async moveToTrashOnce(noteId: string, notePath: string): Promise<boolean> {
        const adapter = this.app.vault.adapter;
        const source = this.pathService.getNoteDbPath(noteId);

        if (!(await adapter.exists(source))) {
            await this.manifestManager.detachNoteEntry(noteId);
            return false;
        }

        try {
            await this.editHistoryManager.persistAllBranchesToDisk(noteId);
        } catch (error) {
            console.warn(`Eidology: Could not write the edit history of "${notePath}" to disk before trashing it. Only the versions are kept.`, error);
        }

        const target = this.pathService.getTrashNotePath(noteId);
        await this.storageService.ensureFolderExists(this.pathService.getTrashRoot());
        if (await adapter.exists(target)) {
            if (await adapter.exists(`${target}/${NOTE_MANIFEST_FILE}`)) {
                throw new Error(`Eidology: the trash already holds the history of note "${noteId}". The history of "${notePath}" was not moved.`);
            }
            // A folder without a version manifest is an incomplete leftover and is replaced.
            await this.storageService.permanentlyDeleteFolder(target);
        }

        await this.manifestManager.detachNoteEntry(noteId);
        await this.storageService.renameFolder(source, target);

        const meta: TrashMeta = { noteId, notePath, deletedAt: new Date().toISOString() };
        try {
            await adapter.write(`${target}/${TRASH_META_FILE}`, JSON.stringify(meta, null, 2));
        } catch (error) {
            // Without its description the folder would not be listed, so it is moved back.
            await this.storageService.renameFolder(target, source).catch(moveError => {
                console.error(`Eidology: Could not move "${target}" back after failing to describe it.`, moveError);
            });
            throw error;
        }
        return true;
    }

    /** Lists the entries in the trash, most recently deleted first. Folders without a valid description are skipped. */
    async list(): Promise<TrashEntry[]> {
        const adapter = this.app.vault.adapter;
        const root = this.pathService.getTrashRoot();
        if (!(await adapter.exists(root))) return [];

        const entries: TrashEntry[] = [];
        const { folders } = await adapter.list(root);
        for (const folder of folders) {
            const folderName = folder.split('/').pop() ?? '';
            try {
                const meta = parseTrashMeta(await adapter.read(`${folder}/${TRASH_META_FILE}`));
                if (!meta || meta.noteId !== folderName) {
                    console.warn(`Eidology: Skipping trash folder "${folder}": missing or invalid ${TRASH_META_FILE}.`);
                    continue;
                }
                entries.push({
                    noteId: meta.noteId,
                    notePath: meta.notePath,
                    deletedAt: meta.deletedAt,
                    versionCount: await this.countVersions(folder),
                });
            } catch (error) {
                console.warn(`Eidology: Skipping trash folder "${folder}".`, error);
            }
        }
        return entries.sort((a, b) => Date.parse(b.deletedAt) - Date.parse(a.deletedAt));
    }

    /**
     * Restores a deleted note: moves its history folder back, registers it again, recreates the
     * note with the content of the latest version of the current branch, and reads the edit
     * history back from the `.vctrl` files.
     *
     * @throws If the entry does not exist, if a history folder for the same note ID already
     *         exists, or if the note cannot be created. On failure the folder returns to the trash.
     */
    async restore(noteId: string): Promise<RestoreResult> {
        const adapter = this.app.vault.adapter;
        const trashPath = this.pathService.getTrashNotePath(noteId);
        const dbPath = this.pathService.getNoteDbPath(noteId);

        const meta = (await adapter.exists(`${trashPath}/${TRASH_META_FILE}`))
            ? parseTrashMeta(await adapter.read(`${trashPath}/${TRASH_META_FILE}`))
            : null;
        if (!meta) throw new Error('Eidology: this entry is not in the trash or its description is invalid.');
        if (await adapter.exists(dbPath)) {
            throw new Error('Eidology: a history folder with the same note ID already exists, so this entry cannot be restored.');
        }

        const targetPath = await this.chooseRestorePath(meta.notePath);
        await this.storageService.renameFolder(trashPath, dbPath);

        let attached = false;
        try {
            await this.manifestManager.attachExistingNote(noteId, targetPath);
            attached = true;

            const manifest = await this.manifestManager.loadNoteManifest(noteId);
            const content = manifest ? await this.versionContentRepo.getLatestVersionContent(noteId, manifest) : null;

            await this.ensureParentFolders(targetPath);
            const file = await this.app.vault.create(targetPath, content ?? '');
            await this.noteManager.writeNoteIdToFrontmatter(file, noteId);

            const branchesLoaded = await this.loadEditHistory(noteId, dbPath);
            await adapter.remove(`${dbPath}/${TRASH_META_FILE}`).catch(error => {
                console.warn(`Eidology: Could not remove ${TRASH_META_FILE} from the restored folder "${dbPath}".`, error);
            });
            this.manifestManager.invalidateCentralManifestCache();

            return { path: targetPath, renamed: targetPath !== meta.notePath, contentRecovered: content !== null, branchesLoaded };
        } catch (error) {
            if (attached) {
                await this.manifestManager.detachNoteEntry(noteId).catch(detachError => {
                    console.warn(`Eidology: Could not unregister "${noteId}" after a failed restore.`, detachError);
                });
            }
            await this.storageService.renameFolder(dbPath, trashPath).catch(moveError => {
                console.error(`Eidology: Could not return "${dbPath}" to the trash after a failed restore.`, moveError);
            });
            throw error;
        }
    }

    /** Permanently deletes one entry. */
    async purge(noteId: string): Promise<void> {
        await this.storageService.permanentlyDeleteFolder(this.pathService.getTrashNotePath(noteId));
    }

    /** Permanently deletes every entry. @returns Number of entries deleted. */
    async emptyTrash(): Promise<number> {
        const entries = await this.list();
        for (const entry of entries) await this.purge(entry.noteId);
        return entries.length;
    }

    /**
     * Permanently deletes the entries older than the retention period in the settings.
     * A retention of 0 days keeps entries until they are deleted by hand.
     *
     * @returns Number of entries deleted.
     */
    async purgeExpired(now: number = Date.now()): Promise<number> {
        const retentionDays = this.plugin.settings.trashRetentionDays ?? 30;
        if (retentionDays <= 0) return 0;

        let purged = 0;
        for (const entry of await this.list()) {
            if (!isTrashEntryExpired(entry.deletedAt, retentionDays, now)) continue;
            try {
                await this.purge(entry.noteId);
                purged++;
            } catch (error) {
                console.warn(`Eidology: Could not delete the expired trash entry "${entry.noteId}".`, error);
            }
        }
        return purged;
    }

    private async countVersions(folder: string): Promise<number> {
        try {
            const manifest = JSON.parse(await this.app.vault.adapter.read(`${folder}/manifest.json`)) as Partial<NoteManifest>;
            return Object.values(manifest.branches ?? {}).reduce((sum, branch) => sum + Object.keys(branch?.versions ?? {}).length, 0);
        } catch {
            return 0;
        }
    }

    private async chooseRestorePath(originalPath: string): Promise<string> {
        const taken = new Set<string>();
        for (const file of this.app.vault.getAllLoadedFiles()) taken.add(file.path.toLowerCase());
        const central = await this.manifestManager.loadCentralManifest(true);
        for (const entry of Object.values(central.notes)) taken.add(entry.notePath.toLowerCase());
        return pickRestorePath(originalPath, path => taken.has(path.toLowerCase()));
    }

    private async ensureParentFolders(path: string): Promise<void> {
        let current = '';
        for (const part of path.split('/').slice(0, -1)) {
            current = current ? `${current}/${part}` : part;
            if (!this.app.vault.getAbstractFileByPath(current)) {
                await this.app.vault.createFolder(current);
            }
        }
    }

    /** Reads every branch folder of the restored history back into the edit history. */
    private async loadEditHistory(noteId: string, dbPath: string): Promise<number> {
        const adapter = this.app.vault.adapter;
        const branchesPath = `${dbPath}/branches`;
        if (!(await adapter.exists(branchesPath))) return 0;

        let loaded = 0;
        const { folders } = await adapter.list(branchesPath);
        for (const folder of folders) {
            const branchName = decodeBranchPathComponent(folder.split('/').pop() ?? '');
            if (!branchName) continue;
            try {
                await this.editHistoryManager.loadBranchFromDisk(noteId, branchName);
                loaded++;
            } catch (error) {
                console.warn(`Eidology: Could not read the edit history of branch "${branchName}" back from disk.`, error);
            }
        }
        return loaded;
    }
}
