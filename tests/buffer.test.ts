import { describe, expect, it } from 'vitest';
import { toExactArrayBuffer } from '@/utils/buffer';

describe('toExactArrayBuffer', () => {
    it('copies only the window of a view over a larger buffer', () => {
        const backing = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
        const view = backing.subarray(2, 5);

        const copy = toExactArrayBuffer(view);

        expect(copy.byteLength).toBe(3);
        expect(Array.from(new Uint8Array(copy))).toEqual([2, 3, 4]);
    });

    it('returns a buffer independent of the original', () => {
        const view = new Uint8Array([9, 9, 9]);

        const copy = toExactArrayBuffer(view);
        view[0] = 1;

        expect(new Uint8Array(copy)[0]).toBe(9);
    });

    it('returns an empty buffer for an empty view', () => {
        expect(toExactArrayBuffer(new Uint8Array(0)).byteLength).toBe(0);
    });
});
