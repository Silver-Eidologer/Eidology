import { describe, expect, it } from 'vitest';
import { isTrashEntryExpired, parseTrashMeta, pickRestorePath } from '@/utils/trash';
import { decodeBranchPathComponent, encodeBranchPathComponent } from '@/utils/branch-path';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-12-01T00:00:00.000Z');

describe('parseTrashMeta', () => {
    it('accepts a complete description', () => {
        const meta = { noteId: 'a', notePath: 'x/y.md', deletedAt: '2026-11-21T00:00:00.000Z' };
        expect(parseTrashMeta(JSON.stringify(meta))).toEqual(meta);
    });

    it('rejects invalid JSON, missing fields and empty values', () => {
        expect(parseTrashMeta('{')).toBeNull();
        expect(parseTrashMeta('{}')).toBeNull();
        expect(parseTrashMeta(JSON.stringify({ noteId: 'a', notePath: '', deletedAt: 'x' }))).toBeNull();
        expect(parseTrashMeta(JSON.stringify({ noteId: 'a', notePath: 'b.md' }))).toBeNull();
    });
});

describe('isTrashEntryExpired', () => {
    const deletedDaysAgo = (days: number) => new Date(NOW - days * DAY).toISOString();

    it('expires an entry once the retention period has passed', () => {
        expect(isTrashEntryExpired(deletedDaysAgo(31), 30, NOW)).toBe(true);
        expect(isTrashEntryExpired(deletedDaysAgo(30), 30, NOW)).toBe(true);
        expect(isTrashEntryExpired(deletedDaysAgo(29), 30, NOW)).toBe(false);
    });

    it('never expires when retention is 0 or negative', () => {
        expect(isTrashEntryExpired(deletedDaysAgo(5000), 0, NOW)).toBe(false);
        expect(isTrashEntryExpired(deletedDaysAgo(5000), -1, NOW)).toBe(false);
    });

    it('never expires an entry with an invalid date', () => {
        expect(isTrashEntryExpired('not a date', 30, NOW)).toBe(false);
    });
});

describe('pickRestorePath', () => {
    it('keeps the original path when it is free', () => {
        expect(pickRestorePath('a/b.md', () => false)).toBe('a/b.md');
    });

    it('inserts (restored) before the extension when the path is taken', () => {
        const taken = new Set(['a/b.md']);
        expect(pickRestorePath('a/b.md', p => taken.has(p))).toBe('a/b (restored).md');
    });

    it('counts up while candidates are taken', () => {
        const taken = new Set(['b.md', 'b (restored).md', 'b (restored 2).md']);
        expect(pickRestorePath('b.md', p => taken.has(p))).toBe('b (restored 3).md');
    });

    it('handles names without an extension or with a leading dot', () => {
        expect(pickRestorePath('a/README', p => p === 'a/README')).toBe('a/README (restored)');
        expect(pickRestorePath('.hidden', p => p === '.hidden')).toBe('.hidden (restored)');
    });
});

describe('decodeBranchPathComponent', () => {
    it.each(['main', 'a/b', 'a_b', '100%', 'rascunho-草稿', 'a😀b', 'CON', 'draft.', 'x\\y', ' a b'])('inverts the encoding of %j', name => {
        expect(decodeBranchPathComponent(encodeBranchPathComponent(name))).toBe(name.trim());
    });

    it('returns null for an invalid escape sequence', () => {
        expect(decodeBranchPathComponent('%FF')).toBeNull();
    });
});
