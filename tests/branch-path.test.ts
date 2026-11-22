import { describe, expect, it } from 'vitest';
import {
    MAX_PATH_COMPONENT_BYTES,
    branchNameKey,
    encodeBranchPathComponent,
    findBranchNameProblem,
} from '@/utils/branch-path';

describe('encodeBranchPathComponent', () => {
    it('keeps letters, digits, spaces and _ . - unchanged', () => {
        expect(encodeBranchPathComponent('feature_1.2-draft v2')).toBe('feature_1.2-draft v2');
    });

    it('keeps letters of other scripts unchanged', () => {
        expect(encodeBranchPathComponent('rascunho-ação-草稿')).toBe('rascunho-ação-草稿');
    });

    it('escapes separators, % and control characters', () => {
        expect(encodeBranchPathComponent('a/b')).toBe('a%2Fb');
        expect(encodeBranchPathComponent('a\\b')).toBe('a%5Cb');
        expect(encodeBranchPathComponent('100%')).toBe('100%25');
        expect(encodeBranchPathComponent('a\u0001b')).toBe('a%01b');
    });

    it('escapes each UTF-8 byte of a character that is not kept', () => {
        expect(encodeBranchPathComponent('a😀b')).toBe('a%F0%9F%98%80b');
    });

    it('maps the names that collided under the previous scheme to different folders', () => {
        const names = ['a/b', 'a_b', 'a\\b', 'a..b', 'a.b'];
        const folders = names.map(encodeBranchPathComponent);
        expect(new Set(folders).size).toBe(names.length);
    });

    it('never yields a traversal component', () => {
        expect(encodeBranchPathComponent('.')).toBe('%2E');
        expect(encodeBranchPathComponent('..')).toBe('.%2E');
    });

    it('escapes a trailing dot or space only', () => {
        expect(encodeBranchPathComponent('draft.')).toBe('draft%2E');
        expect(encodeBranchPathComponent('.hidden')).toBe('.hidden');
        expect(encodeBranchPathComponent('  padded  ')).toBe('padded');
    });

    it('escapes the first character of reserved Windows device names', () => {
        expect(encodeBranchPathComponent('CON')).toBe('%43ON');
        expect(encodeBranchPathComponent('nul.txt')).toBe('%6Eul.txt');
        expect(encodeBranchPathComponent('com1')).toBe('%63om1');
        expect(encodeBranchPathComponent('console')).toBe('console');
        expect(encodeBranchPathComponent('com10')).toBe('com10');
    });

    it('is injective for a name that already looks like an escape', () => {
        expect(encodeBranchPathComponent('%2F')).toBe('%252F');
        expect(encodeBranchPathComponent('%2F')).not.toBe(encodeBranchPathComponent('/'));
    });

    it('rejects empty names', () => {
        expect(() => encodeBranchPathComponent('')).toThrow();
        expect(() => encodeBranchPathComponent('   ')).toThrow();
    });

    it('rejects names whose encoding exceeds the path component limit', () => {
        expect(() => encodeBranchPathComponent('/'.repeat(MAX_PATH_COMPONENT_BYTES))).toThrow(/too long/);
        expect(() => encodeBranchPathComponent('a'.repeat(MAX_PATH_COMPONENT_BYTES))).not.toThrow();
    });
});

describe('branchNameKey', () => {
    it('ignores letter case', () => {
        expect(branchNameKey('Main')).toBe(branchNameKey('main'));
    });

    it('ignores the Unicode normalization form', () => {
        expect(branchNameKey('a\u0301')).toBe(branchNameKey('\u00E1'));
    });

    it('distinguishes names that are different in every file system', () => {
        expect(branchNameKey('a/b')).not.toBe(branchNameKey('a_b'));
    });
});

describe('findBranchNameProblem', () => {
    const existing = ['main', 'Draft'];

    it('accepts a new name', () => {
        expect(findBranchNameProblem(existing, 'review')).toBeNull();
    });

    it('rejects an identical name', () => {
        expect(findBranchNameProblem(existing, 'main')).toMatch(/already exists/);
    });

    it('rejects a name that differs only by letter case', () => {
        expect(findBranchNameProblem(existing, 'Main')).toMatch(/conflicts with the existing branch "main"/);
        expect(findBranchNameProblem(existing, 'draft')).toMatch(/conflicts with the existing branch "Draft"/);
    });

    it('rejects a name that differs only by surrounding whitespace', () => {
        expect(findBranchNameProblem(existing, ' main ')).toMatch(/already exists/);
    });

    it('rejects empty and oversized names', () => {
        expect(findBranchNameProblem(existing, '  ')).toMatch(/empty/);
        expect(findBranchNameProblem(existing, '/'.repeat(MAX_PATH_COMPONENT_BYTES))).toMatch(/too long/);
    });
});
