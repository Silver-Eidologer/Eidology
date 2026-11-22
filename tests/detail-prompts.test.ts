import { describe, expect, it } from 'vitest';
import { resolveVersionDetailPrompts } from '@/state/thunks/version/helpers/detail-prompts';

const off = { enableVersionNaming: false, enableVersionDescription: false };
const naming = { enableVersionNaming: true, enableVersionDescription: false };
const both = { enableVersionNaming: true, enableVersionDescription: true };

describe('resolveVersionDetailPrompts', () => {
    it('asks for nothing when both options are off', () => {
        expect(resolveVersionDetailPrompts('versions', off, both)).toEqual({ name: false, description: false });
    });

    it('asks only for the enabled fields', () => {
        expect(resolveVersionDetailPrompts('versions', naming, off)).toEqual({ name: true, description: false });
        expect(resolveVersionDetailPrompts('versions', both, off)).toEqual({ name: true, description: true });
    });

    it('uses the settings in effect for the note in the versions view', () => {
        expect(resolveVersionDetailPrompts('versions', off, both)).toEqual({ name: false, description: false });
    });

    it('uses the global version defaults in the edits view', () => {
        expect(resolveVersionDetailPrompts('edits', both, off)).toEqual({ name: false, description: false });
        expect(resolveVersionDetailPrompts('edits', off, naming)).toEqual({ name: true, description: false });
    });
});
