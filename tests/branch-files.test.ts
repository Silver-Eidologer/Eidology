import { describe, expect, it } from 'vitest';
import { partitionBranchFiles, uniqueConflictFileName } from '@/core/edit-history-manager/persistence/branch-files';

describe('partitionBranchFiles', () => {
    it('selects the file with the highest timestamp and keeps the others', () => {
        const files = [
            { path: 'b/100_a.vctrl', timestamp: 100 },
            { path: 'b/300_c.vctrl', timestamp: 300 },
            { path: 'b/200_b.vctrl', timestamp: 200 },
        ];

        const { newest, superseded } = partitionBranchFiles(files);

        expect(newest?.path).toBe('b/300_c.vctrl');
        expect(superseded.map(f => f.path)).toEqual(['b/200_b.vctrl', 'b/100_a.vctrl']);
    });

    it('does not depend on listing order when timestamps tie', () => {
        const a = { path: 'b/1_a.vctrl', timestamp: 1 };
        const z = { path: 'b/1_z.vctrl', timestamp: 1 };

        expect(partitionBranchFiles([a, z]).newest).toBe(z);
        expect(partitionBranchFiles([z, a]).newest).toBe(z);
    });

    it('does not modify its input', () => {
        const files = [
            { path: 'x', timestamp: 1 },
            { path: 'y', timestamp: 2 },
        ];
        partitionBranchFiles(files);
        expect(files.map(f => f.path)).toEqual(['x', 'y']);
    });

    it('handles empty and single-file input', () => {
        expect(partitionBranchFiles([])).toEqual({ newest: null, superseded: [] });
        const only = { path: 'x', timestamp: 5 };
        expect(partitionBranchFiles([only])).toEqual({ newest: only, superseded: [] });
    });
});

describe('uniqueConflictFileName', () => {
    it('keeps a free name', () => {
        expect(uniqueConflictFileName('1_a.vctrl', new Set())).toBe('1_a.vctrl');
    });

    it('inserts a counter before the extension when the name is taken', () => {
        const taken = new Set(['1_a.vctrl', '1_a (2).vctrl']);
        expect(uniqueConflictFileName('1_a.vctrl', taken)).toBe('1_a (3).vctrl');
    });
});
