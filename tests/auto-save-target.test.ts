import { describe, expect, it } from 'vitest';
import {
    FALLBACK_BRANCH,
    createSkipWarningTracker,
    isShownInView,
    pickBranchName,
} from '@/state/utils/auto-save-target';

describe('isShownInView', () => {
    it('is true for a save made for the view itself', () => {
        expect(isShownInView('A.md', undefined)).toBe(true);
        expect(isShownInView(null, undefined)).toBe(true);
    });

    it('is true only when the view shows the saved file', () => {
        expect(isShownInView('A.md', 'A.md')).toBe(true);
        expect(isShownInView('B.md', 'A.md')).toBe(false);
        expect(isShownInView(null, 'A.md')).toBe(false);
    });
});

describe('pickBranchName', () => {
    it('uses the branch of the note manifest', () => {
        expect(pickBranchName('draft')).toBe('draft');
    });

    it('falls back to main when the manifest names none', () => {
        expect(pickBranchName(undefined)).toBe(FALLBACK_BRANCH);
        expect(pickBranchName(null)).toBe(FALLBACK_BRANCH);
        expect(pickBranchName('')).toBe(FALLBACK_BRANCH);
    });
});

describe('createSkipWarningTracker', () => {
    it('reports a reason once until it changes or is reset', () => {
        const tracker = createSkipWarningTracker();
        expect(tracker.shouldWarn('LOADING')).toBe(true);
        expect(tracker.shouldWarn('LOADING')).toBe(false);
        expect(tracker.shouldWarn('ERROR')).toBe(true);
        tracker.reset();
        expect(tracker.shouldWarn('ERROR')).toBe(true);
    });
});
