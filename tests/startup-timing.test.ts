import { describe, expect, it } from 'vitest';
import { formatStartupReport } from '@/utils/startup-timing';

describe('formatStartupReport', () => {
    it('shows time since the origin and since the previous entry', () => {
        const lines = formatStartupReport([
            { label: 'a', at: 110 },
            { label: 'b', at: 160 },
        ], 100);
        expect(lines).toEqual([
            '     10 ms  (+    10)  a',
            '     60 ms  (+    50)  b',
        ]);
    });

    it('returns no lines for no entries', () => {
        expect(formatStartupReport([], 0)).toEqual([]);
    });
});
