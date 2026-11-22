import { describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', () => ({ App: class {}, TFile: class {} }));

import { parse } from 'yaml';
import {
    batchSurgicalUpdate,
    getExistingKeys,
    surgicallyDeleteKeys,
    surgicallyInsertKeys,
} from '@/utils/frontmatter/surgical';
import { DELETE, DEFAULT_OPTIONS } from '@/utils/frontmatter/constants';
import { reconstructContent } from '@/utils/frontmatter/io';

const KEY = 'eido-id';
const ID = '4a948388-9542-4634-8e18-e5e9b195bb6c';

function insert(yaml: string, key: string, value: string): string {
    return surgicallyInsertKeys(yaml, { [key]: value }, DEFAULT_OPTIONS).content;
}

function remove(yaml: string, key: string): string {
    return surgicallyDeleteKeys(yaml, [key], getExistingKeys(yaml)).content;
}

describe('getExistingKeys', () => {
    it('finds plain and quoted top-level keys', () => {
        const keys = getExistingKeys(`title: A\n'single': 1\n"double": 2\n${KEY}: ${ID}\n`);
        expect([...keys].sort()).toEqual(['double', KEY, 'single', 'title'].sort());
    });

    it('ignores comments, list items and nested keys', () => {
        const yaml = `# comment\ntags:\n  - a\n  - ${KEY}: nested\nparent:\n  ${KEY}: nested\n`;
        expect([...getExistingKeys(yaml)].sort()).toEqual(['parent', 'tags']);
    });

    it('handles CRLF line endings', () => {
        expect([...getExistingKeys(`title: A\r\n${KEY}: x\r\n`)].sort()).toEqual([KEY, 'title']);
    });
});

describe('surgical insertion of the note id', () => {
    it('keeps every existing byte and appends the new key at the end', () => {
        const yaml = 'title: "{{VALUE}}"\n# comment kept\ntags: [a, b]\ndesc: |\n  line 1\n\n  line 2\n';
        const out = insert(yaml, KEY, ID);
        expect(out.startsWith(yaml)).toBe(true);
        // The id starts with a digit, so it is written quoted.
        expect(out.slice(yaml.length)).toBe(`${KEY}: "${ID}"\n`);
    });

    it('produces YAML that parses back to the same string', () => {
        expect(parse(insert('title: A\n', KEY, ID))[KEY]).toBe(ID);
    });

    it.each([
        '20260101', '1e5', '1_000', '0x1F', '0o17', '0b101', '12:30:45', '.5', '-1', '+1', '2026-11-21',
        'true', 'false', 'yes', 'no', 'on', 'off', 'null', '~', 'a: b', 'a #b', '- a', '# a', '*a', '&a', '!a', '@a', '`a',
        ' leading', 'trailing ', "it's", 'say "hi"', 'x\ty',
    ])('keeps the value %j as a string', value => {
        const parsed = parse(insert('title: A\n', KEY, value));
        expect(parsed[KEY]).toBe(value);
    });

    it('does not add a key that already exists (batch update)', () => {
        const yaml = `${KEY}: old\n`;
        const result = batchSurgicalUpdate(yaml, { [KEY]: 'new' }, getExistingKeys(yaml), DEFAULT_OPTIONS);
        expect(result.changed).toBe(false);
        expect(result.content).toBe(yaml);
    });

    it.each(['my id', 'título', '2fa', 'a.b'])('detects the existing key %j and does not add it again', key => {
        const yaml = `${key}: x\n`;
        expect(getExistingKeys(yaml).has(key)).toBe(true);
        const result = batchSurgicalUpdate(yaml, { [key]: 'new' }, getExistingKeys(yaml), DEFAULT_OPTIONS);
        expect(result.changed).toBe(false);
    });

    it.each(['my id', 'título', '2fa', 'a.b', 'x #y', '-x', '@x'])('writes the key %j so that it parses back unchanged', key => {
        const parsed = parse(insert('title: A\n', key, ID));
        expect(Object.keys(parsed)).toEqual(['title', key]);
        expect(parsed[key]).toBe(ID);
    });

    it('keeps the value of a trailing block scalar with keep chomping', () => {
        const yaml = 'desc: |+\n  text\n\n';
        const out = insert(yaml, KEY, ID);
        expect(parse(out).desc).toBe(parse(yaml).desc);
    });

    it('keeps that value through the whole rebuild of the file', () => {
        const yaml = 'desc: |+\n  text\n\n';
        const metadata = { endDelimiter: '---', afterContent: '\nbody\n', hasBom: false } as never;
        const rebuilt = reconstructContent(insert(yaml, KEY, ID), metadata, '\n');
        const block = rebuilt.slice(4, rebuilt.indexOf('\n---'));
        expect(parse(block).desc).toBe('text\n\n');
        expect(parse(block)[KEY]).toBe(ID);
        expect(rebuilt.endsWith('\n---\nbody\n')).toBe(true);
    });
});

describe('surgical deletion of the note id', () => {
    it('removes only the key line', () => {
        const yaml = `title: A\n${KEY}: ${ID}\ntags: [a]\n`;
        expect(remove(yaml, KEY)).toBe('title: A\ntags: [a]\n');
    });

    it('does not touch a nested key with the same name', () => {
        const yaml = `parent:\n  ${KEY}: nested\n`;
        expect(remove(yaml, KEY)).toBe(yaml);
    });

    it('leaves the other keys parseable and equal', () => {
        const yaml = `a: 1\n${KEY}: ${ID}\nb:\n  - x\n  - y\n`;
        const out = remove(yaml, KEY);
        expect(parse(out)).toEqual({ a: 1, b: ['x', 'y'] });
    });

    it('does not change other values: blank lines inside a block scalar', () => {
        const yaml = `notes: |\n  a\n\n\n  b\n${KEY}: ${ID}\n`;
        expect(remove(yaml, KEY)).toBe('notes: |\n  a\n\n\n  b\n');
    });

    it('is a no-op when the key does not exist', () => {
        const yaml = 'title: A\n';
        const result = batchSurgicalUpdate(yaml, { [KEY]: DELETE }, getExistingKeys(yaml), DEFAULT_OPTIONS);
        expect(result.changed).toBe(false);
    });
});
