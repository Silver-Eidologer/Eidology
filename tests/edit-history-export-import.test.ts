import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/workers/edit-history/database';
import { ImportExportService } from '@/workers/edit-history/services/import-export-service';
import type { StoredEdit } from '@/workers/edit-history/types';
import { toExactArrayBuffer } from '@/utils/buffer';

const NOTE_ID = 'note-1';
const BRANCH = 'main';

function makeEdit(editId: string, text: string): StoredEdit {
    const content = new TextEncoder().encode(text);
    return {
        noteId: NOTE_ID,
        branchName: BRANCH,
        editId,
        createdAt: 1000,
        storageType: 'full',
        chainLength: 0,
        size: content.byteLength,
        contentHash: `hash-${editId}`,
        uncompressedSize: content.byteLength,
        content: toExactArrayBuffer(content),
    } as unknown as StoredEdit;
}

describe('edit history export and import', () => {
    beforeEach(async () => {
        await db.edits.clear();
        await db.manifests.clear();
    });

    it('restores every edit with exactly its own content', async () => {
        const originals = [makeEdit('e1', 'first edit'), makeEdit('e2', 'second, longer edit ✓')];
        await db.edits.bulkAdd(originals);

        const zip = await ImportExportService.exportBranchData(NOTE_ID, BRANCH);
        await db.edits.clear();
        await ImportExportService.importBranchData(NOTE_ID, BRANCH, zip);

        const restored = await db.edits.where('[noteId+branchName]').equals([NOTE_ID, BRANCH]).toArray();
        expect(restored).toHaveLength(2);

        for (const original of originals) {
            const edit = restored.find(e => e.editId === original.editId);
            expect(edit).toBeDefined();
            expect(edit!.content.byteLength).toBe(original.content.byteLength);
            expect(new TextDecoder().decode(edit!.content)).toBe(new TextDecoder().decode(original.content));
        }
    });

    it('exports a buffer that is exactly the zip archive', async () => {
        await db.edits.bulkAdd([makeEdit('e1', 'x')]);

        const zip = await ImportExportService.exportBranchData(NOTE_ID, BRANCH);

        // Zip archives start with the local file header signature "PK\x03\x04".
        const header = Array.from(new Uint8Array(zip, 0, 4));
        expect(header).toEqual([0x50, 0x4b, 0x03, 0x04]);
    });

    it('rejects an empty archive', async () => {
        await expect(ImportExportService.importBranchData(NOTE_ID, BRANCH, new ArrayBuffer(0))).rejects.toThrow();
    });
});
