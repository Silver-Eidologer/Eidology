/**
 * Returns a standalone ArrayBuffer holding exactly the bytes visible through `view`.
 *
 * A Uint8Array is frequently a window (byteOffset/byteLength) over a larger backing
 * ArrayBuffer, as with the output of fflate or the entries of an unzipped archive.
 * Reading `view.buffer` directly exposes the whole backing store, not only the
 * window. This helper copies only the bytes inside the window.
 */
export function toExactArrayBuffer(view: Uint8Array): ArrayBuffer {
    return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
}
