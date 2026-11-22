import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as v from 'valibot';
import {
    MAX_FORM_PATTERN_LENGTH,
    RegexListSchema,
    findPatternProblem,
} from '@/ui/components/settings/utils/validation/form-validator';
import { compileRegex } from '@/utils/path-filter/regex-compiler';
import { isPathAllowed } from '@/utils/path-filter';
import { regexCache } from '@/utils/path-filter/cache';

function check(text: string) {
    return v.safeParse(RegexListSchema, text);
}

function firstMessage(text: string): string | undefined {
    return check(text).issues?.[0]?.message;
}

beforeEach(() => {
    regexCache.clear();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('RegexListSchema: accepted lists', () => {
    it('accepts a pattern at the maximum line length', () => {
        expect(check('a'.repeat(MAX_FORM_PATTERN_LENGTH)).success).toBe(true);
    });

    it('accepts several patterns and ignores blank lines', () => {
        expect(check('^Private/.*\n\n   \n_templates/.*').success).toBe(true);
    });

    it('accepts an empty list', () => {
        expect(check('').success).toBe(true);
    });

    it('accepts alternations with any number of pipes', () => {
        expect(check('^(a|b|c|d|e)/').success).toBe(true);
        expect(check('^Meta/|^Templates/|^Archive/').success).toBe(true);
    });
});

describe('RegexListSchema: rejected lists', () => {
    it('rejects a line longer than the maximum', () => {
        expect(check('a'.repeat(MAX_FORM_PATTERN_LENGTH + 1)).success).toBe(false);
    });

    it('rejects a syntactically invalid expression and names its line', () => {
        const message = firstMessage('^ok/\n[\n^also-ok/');
        expect(message).toMatch(/^Line 2: invalid regular expression/);
    });

    it('rejects consecutive quantifiers as a syntax error', () => {
        expect(firstMessage('a**')).toMatch(/^Line 1: invalid regular expression/);
    });

    it('reports the first unusable line only', () => {
        expect(firstMessage('[\n(')).toMatch(/^Line 1:/);
    });

    it.each(['^(?=x)Meta/', '\\**', '^Meta/(?:a|b){2,}', '\\p{L}+'])(
        'rejects %j, which the path filter would discard',
        pattern => {
            expect(firstMessage(pattern)).toMatch(/^Line 1: Pattern uses an unsupported construct/);
        }
    );
});

describe('RegexListSchema: speed', () => {
    // The validator once ran a backtracking-prone expression on every line, which took
    // seconds for lines of about 25 characters and effectively never ended for longer ones.
    it('validates a long line without a question mark immediately', () => {
        const started = Date.now();
        expect(check('^Projects/Old Projects/Client Work/2024/'.repeat(10)).success).toBe(true);
        expect(Date.now() - started).toBeLessThan(500);
    }, 5000);

    it('validates many lines immediately', () => {
        const lines = Array.from({ length: 200 }, (_, i) => `^Folder ${i}/Sub Folder/Another Level/.*`);
        const started = Date.now();
        expect(check(lines.join('\n')).success).toBe(true);
        expect(Date.now() - started).toBeLessThan(500);
    }, 5000);
});

describe('agreement between the form and the path filter', () => {
    const patterns = [
        '^09\\. Meta/',
        '^(a|b|c)/',
        '^Private/.*',
        '_templates/.*',
        '^(?=x)Meta/',
        'a**',
        '\\**',
        '(?:a|b){2,}',
        '\\p{L}+',
        '[',
        '(',
        '*a',
    ];

    it.each(patterns)('accepts %j exactly when the filter compiles it', pattern => {
        const formAccepts = findPatternProblem(pattern) === null;
        expect(compileRegex(pattern) !== null).toBe(formAccepts);
    });
});

describe('exclusion with several alternatives', () => {
    it('excludes the matching folders and keeps the others', () => {
        const settings = { pathFilters: ['^(Meta|Templates|Archive|Daily)/'] };
        expect(isPathAllowed('Meta/a.md', settings)).toBe(false);
        expect(isPathAllowed('Daily/2026-11-21.md', settings)).toBe(false);
        expect(isPathAllowed('Notes/a.md', settings)).toBe(true);
    });
});
