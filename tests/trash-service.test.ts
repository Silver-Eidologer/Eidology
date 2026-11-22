import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', () => ({
    TFolder: class {},
    TFile: class {},
    normalizePath: (path: string) => path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/|\/$/g, ''),
}));

import { TrashService } from '@/core/trash-service';
import { PathService } from '@/core/storage/path-service';
import { StorageService } from '@/core/storage/storage-service';

const NOTE_ID = '4a948388-9542-4634-8e18-e5e9b195bb6c';
const OTHER_ID = 'fbecb9bd-c46d-4fe6-8015-334bd80c55f9';
const DB = '.eidologiesdb';
const NOW = Date.parse('2026-12-01T00:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

/** In-memory stand-in for the vault adapter: files hold text, folders are a set of paths. */
class FakeAdapter {
    files = new Map<string, string>();
    folders = new Set<string>();

    private parentsOf(path: string): string[] {
        const parts = path.split('/');
        return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/'));
    }
    async exists(path: string) { return this.files.has(path) || this.folders.has(path); }
    async stat(path: string) { return this.files.has(path) ? { type: 'file' } : this.folders.has(path) ? { type: 'folder' } : null; }
    async read(path: string) {
        const text = this.files.get(path);
        if (text === undefined) throw new Error(`ENOENT ${path}`);
        return text;
    }
    async write(path: string, data: string) {
        this.parentsOf(path).forEach(p => this.folders.add(p));
        this.files.set(path, data);
    }
    async remove(path: string) { this.files.delete(path); }
    async mkdir(path: string) { [...this.parentsOf(path), path].forEach(p => this.folders.add(p)); }
    async list(path: string) {
        const direct = (p: string) => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes('/');
        return { files: [...this.files.keys()].filter(direct), folders: [...this.folders].filter(direct) };
    }
    async rename(from: string, to: string) {
        const inside = (p: string) => p === from || p.startsWith(`${from}/`);
        this.parentsOf(to).forEach(p => this.folders.add(p));
        for (const folder of [...this.folders].filter(inside)) { this.folders.delete(folder); this.folders.add(to + folder.slice(from.length)); }
        for (const [file, text] of [...this.files].filter(([p]) => inside(p))) { this.files.delete(file); this.files.set(to + file.slice(from.length), text); }
    }
    async rmdir(path: string) {
        const inside = (p: string) => p === path || p.startsWith(`${path}/`);
        [...this.folders].filter(inside).forEach(p => this.folders.delete(p));
        [...this.files.keys()].filter(inside).forEach(p => this.files.delete(p));
    }
}

function setup(retentionDays = 30) {
    const adapter = new FakeAdapter();
    const vaultFiles = new Map<string, string>();
    const calls: string[] = [];
    const attached = new Map<string, string>();
    const central = new Set<string>();

    const vault = {
        adapter,
        getAbstractFileByPath: () => null,
        createFolder: async (path: string) => {
            if (adapter.folders.has(path)) throw new Error('Folder already exists.');
            await adapter.mkdir(path);
        },
        getAllLoadedFiles: () => [...vaultFiles.keys()].map(path => ({ path })),
        create: vi.fn(async (path: string, content: string) => { vaultFiles.set(path, content); return { path }; }),
    };
    const plugin = { settings: { databasePath: DB, trashRetentionDays: retentionDays } };
    const pathService = new PathService(plugin as never);
    const storageService = new StorageService({ vault } as never);

    const manifestManager = {
        detachNoteEntry: vi.fn(async (id: string) => { calls.push(`detach:${id}`); central.delete(id); }),
        attachExistingNote: vi.fn(async (id: string, path: string) => { calls.push(`attach:${id}`); attached.set(id, path); }),
        loadCentralManifest: vi.fn(async () => ({ notes: Object.fromEntries([...attached].map(([id, notePath]) => [id, { notePath }])) })),
        loadNoteManifest: vi.fn(async (id: string) => JSON.parse(await adapter.read(`${DB}/${id}/manifest.json`))),
        invalidateCentralManifestCache: vi.fn(),
    };
    const editHistoryManager = {
        persistAllBranchesToDisk: vi.fn(async () => { calls.push('persist'); }),
        loadBranchFromDisk: vi.fn(async () => {}),
    };
    const noteManager = { writeNoteIdToFrontmatter: vi.fn(async () => true) };
    const versionContentRepo = { getLatestVersionContent: vi.fn(async () => '# latest content') };

    const service = new TrashService(
        { vault } as never, plugin as never, pathService, storageService,
        manifestManager as never, editHistoryManager as never, noteManager as never, versionContentRepo as never
    );

    const seedNote = async (id: string, branches: string[] = ['main']) => {
        await adapter.mkdir(`${DB}/${id}/versions`);
        await adapter.write(`${DB}/${id}/manifest.json`, JSON.stringify({
            noteId: id, currentBranch: 'main',
            branches: { main: { versions: { v1: {}, v2: {} }, totalVersions: 2 } },
        }));
        await adapter.write(`${DB}/${id}/versions/v1.md`, 'one');
        for (const branch of branches) await adapter.write(`${DB}/${id}/branches/${branch}/1_x.vctrl`, 'zip');
    };
    return { service, adapter, vault, vaultFiles, calls, attached, manifestManager, editHistoryManager, noteManager, plugin, seedNote };
}

describe('TrashService', () => {
    let ctx: ReturnType<typeof setup>;
    beforeEach(() => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        ctx = setup();
    });

    describe('moveToTrash', () => {
        it('writes the edit history to disk, unregisters the note, then moves the folder', async () => {
            await ctx.seedNote(NOTE_ID);
            const moved = await ctx.service.moveToTrash(NOTE_ID, 'Notes/A.md');

            expect(moved).toBe(true);
            expect(ctx.calls).toEqual(['persist', `detach:${NOTE_ID}`]);
            expect(await ctx.adapter.exists(`${DB}/${NOTE_ID}`)).toBe(false);
            expect(await ctx.adapter.exists(`${DB}/.trash/${NOTE_ID}/versions/v1.md`)).toBe(true);
            expect(await ctx.adapter.exists(`${DB}/.trash/${NOTE_ID}/branches/main/1_x.vctrl`)).toBe(true);
            const meta = JSON.parse(await ctx.adapter.read(`${DB}/.trash/${NOTE_ID}/trash.json`));
            expect(meta).toMatchObject({ noteId: NOTE_ID, notePath: 'Notes/A.md' });
        });

        it('still moves the versions when the edit history cannot be written', async () => {
            await ctx.seedNote(NOTE_ID);
            ctx.editHistoryManager.persistAllBranchesToDisk.mockRejectedValueOnce(new Error('worker down'));
            expect(await ctx.service.moveToTrash(NOTE_ID, 'A.md')).toBe(true);
            expect(await ctx.adapter.exists(`${DB}/.trash/${NOTE_ID}/manifest.json`)).toBe(true);
        });

        it('unregisters a note that has no history folder and reports that nothing was moved', async () => {
            expect(await ctx.service.moveToTrash(NOTE_ID, 'A.md')).toBe(false);
            expect(ctx.manifestManager.detachNoteEntry).toHaveBeenCalledWith(NOTE_ID);
            expect(await ctx.service.list()).toEqual([]);
        });

        it('refuses to replace a trash entry that holds the history of the same note id', async () => {
            await ctx.seedNote(NOTE_ID);
            await ctx.service.moveToTrash(NOTE_ID, 'old.md');
            await ctx.seedNote(NOTE_ID);
            ctx.calls.length = 0;

            await expect(ctx.service.moveToTrash(NOTE_ID, 'new.md')).rejects.toThrow(/already holds/);

            // Nothing was lost: the new folder stays in place, the note stays registered
            // and the entry already in the trash is untouched.
            expect(ctx.calls).not.toContain(`detach:${NOTE_ID}`);
            expect(await ctx.adapter.exists(`${DB}/${NOTE_ID}/manifest.json`)).toBe(true);
            const entries = await ctx.service.list();
            expect(entries).toHaveLength(1);
            expect(entries[0]!.notePath).toBe('old.md');
        });

        it('replaces an incomplete leftover in the trash that has no version manifest', async () => {
            await ctx.adapter.write(`${DB}/.trash/${NOTE_ID}/trash.json`, JSON.stringify({ noteId: NOTE_ID, notePath: 'x.md', deletedAt: '2026-11-01T00:00:00.000Z' }));
            await ctx.adapter.write(`${DB}/.trash/${NOTE_ID}/branches/main/1_x.vctrl`, 'partial');
            await ctx.seedNote(NOTE_ID);

            expect(await ctx.service.moveToTrash(NOTE_ID, 'A.md')).toBe(true);
            expect(await ctx.adapter.exists(`${DB}/.trash/${NOTE_ID}/manifest.json`)).toBe(true);
            expect((await ctx.service.list())[0]!.notePath).toBe('A.md');
        });

        it('does nothing to the disk for a note whose history folder is already gone', async () => {
            await ctx.seedNote(NOTE_ID);
            await ctx.service.moveToTrash(NOTE_ID, 'A.md');
            ctx.editHistoryManager.persistAllBranchesToDisk.mockClear();

            expect(await ctx.service.moveToTrash(NOTE_ID, 'A.md')).toBe(false);
            expect(ctx.editHistoryManager.persistAllBranchesToDisk).not.toHaveBeenCalled();
            expect(await ctx.adapter.exists(`${DB}/${NOTE_ID}`)).toBe(false);
            expect((await ctx.service.list())).toHaveLength(1);
        });

        it('keeps the history intact when the same note is trashed twice at once (note inside a deleted folder)', async () => {
            await ctx.seedNote(NOTE_ID);
            // A late write of the edit history recreates part of the old folder after the move,
            // which is what made the second call replace the good entry with an incomplete one.
            ctx.editHistoryManager.persistAllBranchesToDisk.mockImplementation(async () => {
                ctx.calls.push('persist');
                await new Promise(resolve => setTimeout(resolve, 5));
                await ctx.adapter.write(`${DB}/${NOTE_ID}/branches/main/2_late.vctrl`, 'late');
            });

            const [first, second] = await Promise.all([
                ctx.service.moveToTrash(NOTE_ID, 'Folder/A.md'),
                ctx.service.moveToTrash(NOTE_ID, 'Folder/A.md'),
            ]);

            expect(first).toBe(true);
            expect(second).toBe(true);
            expect(ctx.calls.filter(call => call === 'persist')).toHaveLength(1);
            expect(await ctx.adapter.exists(`${DB}/.trash/${NOTE_ID}/manifest.json`)).toBe(true);
            expect(await ctx.adapter.exists(`${DB}/.trash/${NOTE_ID}/versions/v1.md`)).toBe(true);
            const entries = await ctx.service.list();
            expect(entries).toHaveLength(1);
            expect(entries[0]!.versionCount).toBe(2);
        });

        it('trashes two different notes at once without mixing them', async () => {
            await ctx.seedNote(NOTE_ID);
            await ctx.seedNote(OTHER_ID);
            await Promise.all([
                ctx.service.moveToTrash(NOTE_ID, 'F/A.md'),
                ctx.service.moveToTrash(OTHER_ID, 'F/B.md'),
            ]);
            const entries = await ctx.service.list();
            expect(entries.map(e => e.notePath).sort()).toEqual(['F/A.md', 'F/B.md']);
            expect(entries.every(e => e.versionCount === 2)).toBe(true);
        });
    });

    describe('list', () => {
        it('is empty when there is no trash folder', async () => {
            expect(await ctx.service.list()).toEqual([]);
        });

        it('returns the entries newest first with their version counts', async () => {
            await ctx.seedNote(NOTE_ID);
            await ctx.seedNote(OTHER_ID);
            await ctx.service.moveToTrash(NOTE_ID, 'A.md');
            await ctx.service.moveToTrash(OTHER_ID, 'B.md');
            await ctx.adapter.write(`${DB}/.trash/${NOTE_ID}/trash.json`, JSON.stringify({ noteId: NOTE_ID, notePath: 'A.md', deletedAt: '2026-11-01T00:00:00.000Z' }));
            await ctx.adapter.write(`${DB}/.trash/${OTHER_ID}/trash.json`, JSON.stringify({ noteId: OTHER_ID, notePath: 'B.md', deletedAt: '2026-11-02T00:00:00.000Z' }));

            const entries = await ctx.service.list();
            expect(entries.map(e => e.notePath)).toEqual(['B.md', 'A.md']);
            expect(entries.every(e => e.versionCount === 2)).toBe(true);
        });

        it('skips folders without a valid description', async () => {
            await ctx.adapter.write(`${DB}/.trash/${NOTE_ID}/versions/v1.md`, 'x');
            await ctx.adapter.write(`${DB}/.trash/${OTHER_ID}/trash.json`, '{ broken');
            expect(await ctx.service.list()).toEqual([]);
        });

        it('skips a folder whose name differs from the note id in its description', async () => {
            await ctx.adapter.write(`${DB}/.trash/${NOTE_ID}/trash.json`, JSON.stringify({ noteId: OTHER_ID, notePath: 'A.md', deletedAt: '2026-11-01T00:00:00.000Z' }));
            expect(await ctx.service.list()).toEqual([]);
        });
    });

    describe('restore', () => {
        async function trash(path = 'Notes/A.md', branches = ['main']) {
            await ctx.seedNote(NOTE_ID, branches);
            await ctx.service.moveToTrash(NOTE_ID, path);
            ctx.calls.length = 0;
        }

        it('moves the folder back, registers the note and recreates it with the latest version', async () => {
            await trash();
            const result = await ctx.service.restore(NOTE_ID);

            expect(result).toEqual({ path: 'Notes/A.md', renamed: false, contentRecovered: true, branchesLoaded: 1 });
            expect(await ctx.adapter.exists(`${DB}/${NOTE_ID}/versions/v1.md`)).toBe(true);
            expect(await ctx.adapter.exists(`${DB}/${NOTE_ID}/trash.json`)).toBe(false);
            expect(await ctx.adapter.exists(`${DB}/.trash/${NOTE_ID}`)).toBe(false);
            expect(ctx.attached.get(NOTE_ID)).toBe('Notes/A.md');
            expect(ctx.vaultFiles.get('Notes/A.md')).toBe('# latest content');
            expect(ctx.noteManager.writeNoteIdToFrontmatter).toHaveBeenCalledWith({ path: 'Notes/A.md' }, NOTE_ID);
            expect(await ctx.adapter.exists('Notes')).toBe(true);
        });

        it('reads each edit-history branch back under its decoded name', async () => {
            await trash('A.md', ['main', 'a%2Fb', 'rascunho-草稿']);
            await ctx.service.restore(NOTE_ID);
            const names = ctx.editHistoryManager.loadBranchFromDisk.mock.calls.map(call => (call as unknown[])[1]).sort();
            expect(names).toEqual(['a/b', 'main', 'rascunho-草稿']);
        });

        it('chooses another path when the original is in use, ignoring letter case', async () => {
            await trash('Notes/A.md');
            ctx.vaultFiles.set('notes/a.md', 'someone else');
            const result = await ctx.service.restore(NOTE_ID);
            expect(result.path).toBe('Notes/A (restored).md');
            expect(result.renamed).toBe(true);
            expect(ctx.attached.get(NOTE_ID)).toBe('Notes/A (restored).md');
        });

        it('creates an empty note and says so when the history holds no version', async () => {
            await trash();
            ctx.manifestManager.loadNoteManifest.mockResolvedValueOnce(null as never);
            const result = await ctx.service.restore(NOTE_ID);
            expect(result.contentRecovered).toBe(false);
            expect(ctx.vaultFiles.get('Notes/A.md')).toBe('');
        });

        it('returns the folder to the trash and unregisters the note if the note cannot be created', async () => {
            await trash();
            ctx.vault.create.mockRejectedValueOnce(new Error('disk full'));
            await expect(ctx.service.restore(NOTE_ID)).rejects.toThrow('disk full');

            expect(await ctx.adapter.exists(`${DB}/.trash/${NOTE_ID}/trash.json`)).toBe(true);
            expect(await ctx.adapter.exists(`${DB}/${NOTE_ID}`)).toBe(false);
            expect(ctx.calls).toContain(`detach:${NOTE_ID}`);
            expect((await ctx.service.list()).map(e => e.noteId)).toEqual([NOTE_ID]);
        });

        it('refuses to restore over an existing history folder of the same note id', async () => {
            await trash();
            await ctx.seedNote(NOTE_ID);
            await expect(ctx.service.restore(NOTE_ID)).rejects.toThrow(/already exists/);
            expect(await ctx.adapter.exists(`${DB}/.trash/${NOTE_ID}/trash.json`)).toBe(true);
        });

        it('rejects an entry that is not in the trash', async () => {
            await expect(ctx.service.restore(NOTE_ID)).rejects.toThrow(/not in the trash/);
        });
    });

    describe('purge, empty and expiry', () => {
        async function trashWithAge(id: string, daysAgo: number) {
            await ctx.seedNote(id);
            await ctx.service.moveToTrash(id, `${id}.md`);
            await ctx.adapter.write(`${DB}/.trash/${id}/trash.json`, JSON.stringify({ noteId: id, notePath: `${id}.md`, deletedAt: new Date(NOW - daysAgo * DAY).toISOString() }));
        }

        it('purge deletes one entry only', async () => {
            await trashWithAge(NOTE_ID, 1);
            await trashWithAge(OTHER_ID, 1);
            await ctx.service.purge(NOTE_ID);
            expect((await ctx.service.list()).map(e => e.noteId)).toEqual([OTHER_ID]);
        });

        it('emptyTrash deletes everything and reports the count', async () => {
            await trashWithAge(NOTE_ID, 1);
            await trashWithAge(OTHER_ID, 1);
            expect(await ctx.service.emptyTrash()).toBe(2);
            expect(await ctx.service.list()).toEqual([]);
        });

        it('purgeExpired deletes only entries older than the retention period', async () => {
            await trashWithAge(NOTE_ID, 31);
            await trashWithAge(OTHER_ID, 5);
            expect(await ctx.service.purgeExpired(NOW)).toBe(1);
            expect((await ctx.service.list()).map(e => e.noteId)).toEqual([OTHER_ID]);
        });

        it('purgeExpired keeps everything when retention is 0', async () => {
            ctx.plugin.settings.trashRetentionDays = 0;
            await trashWithAge(NOTE_ID, 4000);
            expect(await ctx.service.purgeExpired(NOW)).toBe(0);
            expect(await ctx.service.list()).toHaveLength(1);
        });
    });
});
