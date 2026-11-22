import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', () => ({ Notice: class {} }));

import { DEFAULT_SETTINGS } from '@/constants';
import { SettingsInitializer } from '@/main/initialization/settings-initializer';
import { SettingsResolver } from '@/core/settings';
import { mergeEditHistorySettings, mergeVersionHistorySettings } from '@/state/thunks/settings/helpers/settings-merger';
import type { HistorySettings } from '@/types';

const NOTE_ID = '4a948388-9542-4634-8e18-e5e9b195bb6c';

function storedSettings(overrides: Record<string, unknown> = {}) {
    return {
        ...structuredClone(DEFAULT_SETTINGS),
        centralManifest: {
            version: '1.0.0',
            notes: {
                [NOTE_ID]: {
                    notePath: 'A.md',
                    manifestPath: `.eidologiesdb/${NOTE_ID}/manifest.json`,
                    createdAt: '2026-11-21T09:13:33.985Z',
                    lastModified: '2026-11-21T09:13:39.596Z',
                },
            },
        },
        ...overrides,
    };
}

function makePlugin(stored: unknown, loadError?: Error, fileExists = true) {
    const saved: unknown[] = [];
    const plugin = {
        settings: undefined as unknown,
        manifest: { dir: '.obsidian/plugins/eidology' },
        app: { vault: { adapter: { exists: vi.fn(async () => fileExists), copy: vi.fn(async () => {}) } } },
        loadData: vi.fn(async () => {
            if (loadError) throw loadError;
            return stored;
        }),
        saveData: vi.fn(async (data: unknown) => { saved.push(data); }),
    };
    return { plugin, saved };
}

async function load(stored: unknown, loadError?: Error, fileExists = true) {
    const { plugin, saved } = makePlugin(stored, loadError, fileExists);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await new SettingsInitializer(plugin as never).loadSettings();
    return { plugin, saved };
}

describe('loading settings', () => {
    beforeEach(() => { vi.restoreAllMocks(); });

    it('keeps valid stored settings and the central manifest', async () => {
        const { plugin } = await load(storedSettings());
        const settings = plugin.settings as typeof DEFAULT_SETTINGS;
        expect(Object.keys(settings.centralManifest.notes)).toEqual([NOTE_ID]);
        expect(settings.versionHistorySettings.maxVersionsPerNote).toBe(DEFAULT_SETTINGS.versionHistorySettings.maxVersionsPerNote);
    });

    it('applies stored values over the defaults', async () => {
        const stored = storedSettings();
        stored.editHistorySettings.maxVersionsPerNote = 300;
        const { plugin } = await load(stored);
        expect((plugin.settings as typeof DEFAULT_SETTINGS).editHistorySettings.maxVersionsPerNote).toBe(300);
    });

    it('fills missing fields with defaults', async () => {
        const stored: Record<string, unknown> = storedSettings();
        stored['versionHistorySettings'] = { maxVersionsPerNote: 20 };
        const { plugin } = await load(stored);
        const version = (plugin.settings as typeof DEFAULT_SETTINGS).versionHistorySettings;
        expect(version.maxVersionsPerNote).toBe(20);
        expect(version.enableWordCount).toBe(DEFAULT_SETTINGS.versionHistorySettings.enableWordCount);
    });

    it('starts from the defaults when nothing is stored', async () => {
        const { plugin } = await load(null);
        expect((plugin.settings as typeof DEFAULT_SETTINGS).noteIdFrontmatterKey).toBe('eido-id');
    });

    it('does not back up anything when the stored settings are valid', async () => {
        const { plugin } = await load(storedSettings());
        expect(plugin.app.vault.adapter.copy).not.toHaveBeenCalled();
    });

    it('does not back up anything on a first run without a data file', async () => {
        const { plugin } = await load(null, undefined, false);
        expect(plugin.app.vault.adapter.copy).not.toHaveBeenCalled();
    });

    it('keeps the central manifest and backs up the file when one stored value is invalid', async () => {
        const stored = storedSettings();
        stored.versionHistorySettings.maxVersionsPerNote = 99999;
        const { plugin } = await load(stored);
        const settings = plugin.settings as typeof DEFAULT_SETTINGS;
        expect(Object.keys(settings.centralManifest.notes)).toEqual([NOTE_ID]);
        expect(settings.versionHistorySettings.maxVersionsPerNote).toBe(DEFAULT_SETTINGS.versionHistorySettings.maxVersionsPerNote);
        expect(plugin.app.vault.adapter.copy).toHaveBeenCalledTimes(1);
        const [from, to] = plugin.app.vault.adapter.copy.mock.calls[0] as unknown as [string, string];
        expect(from).toBe('.obsidian/plugins/eidology/data.json');
        expect(to).toMatch(/^\.obsidian\/plugins\/eidology\/data\.json\.corrupt\.\d+$/);
    });

    it('backs up the file before the defaults are saved when it cannot be read', async () => {
        const { plugin, saved } = await load(undefined, new SyntaxError('Unexpected token in JSON'));
        expect(plugin.app.vault.adapter.copy).toHaveBeenCalledTimes(1);
        expect(saved).toHaveLength(1);
        expect(plugin.app.vault.adapter.copy.mock.invocationCallOrder[0]!).toBeLessThan(plugin.saveData.mock.invocationCallOrder[0]!);
    });
});

describe('SettingsResolver', () => {
    const globalDefaults = { ...DEFAULT_SETTINGS.versionHistorySettings, maxVersionsPerNote: 50 } as HistorySettings;

    it('uses the global defaults without branch settings', () => {
        expect(SettingsResolver.resolve(globalDefaults)).toEqual({ ...globalDefaults, isGlobal: true });
    });

    it('ignores branch overrides unless isGlobal is false', () => {
        expect(SettingsResolver.resolve(globalDefaults, { maxVersionsPerNote: 5 }).maxVersionsPerNote).toBe(50);
        expect(SettingsResolver.resolve(globalDefaults, { isGlobal: true, maxVersionsPerNote: 5 }).maxVersionsPerNote).toBe(50);
    });

    it('applies defined branch overrides when isGlobal is false and skips undefined ones', () => {
        const resolved = SettingsResolver.resolve(globalDefaults, { isGlobal: false, maxVersionsPerNote: 5, autoCleanupDays: undefined });
        expect(resolved.maxVersionsPerNote).toBe(5);
        expect(resolved.autoCleanupDays).toBe(globalDefaults.autoCleanupDays);
        expect(resolved.isGlobal).toBe(false);
    });
});

describe('history settings merge', () => {
    const base = DEFAULT_SETTINGS.versionHistorySettings;

    it('returns a new object and leaves the input unchanged', () => {
        const merged = mergeVersionHistorySettings(base, { maxVersionsPerNote: 7 });
        expect(merged.maxVersionsPerNote).toBe(7);
        expect(base.maxVersionsPerNote).not.toBe(7);
        expect(merged).not.toBe(base);
    });

    it('keeps fields that are not in the update', () => {
        const merged = mergeEditHistorySettings(DEFAULT_SETTINGS.editHistorySettings, { autoSaveOnSave: true });
        expect(merged.maxVersionsPerNote).toBe(DEFAULT_SETTINGS.editHistorySettings.maxVersionsPerNote);
    });

    it('does not replace a stored value with an explicit undefined', () => {
        const merged = mergeVersionHistorySettings(base, { maxVersionsPerNote: undefined } as unknown as Partial<HistorySettings>);
        expect(merged.maxVersionsPerNote).toBe(base.maxVersionsPerNote);
    });
});
