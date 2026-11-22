/**
 * Pure helpers for resolving several `.vctrl` files found in one branch folder.
 */

/** Name of the subfolder of a branch folder that receives superseded `.vctrl` files. */
export const CONFLICTS_FOLDER = 'conflicts';

export interface BranchFileCandidate {
    path: string;
    /** Milliseconds since the epoch. */
    timestamp: number;
}

/**
 * Splits branch files into the file that wins and the files it supersedes.
 * The file with the highest timestamp wins. Ties are broken by the highest path, so the
 * result does not depend on the listing order.
 */
export function partitionBranchFiles<T extends BranchFileCandidate>(files: readonly T[]): { newest: T | null; superseded: T[] } {
    const sorted = [...files].sort((a, b) =>
        b.timestamp !== a.timestamp ? b.timestamp - a.timestamp : (a.path < b.path ? 1 : a.path > b.path ? -1 : 0)
    );
    const [newest, ...superseded] = sorted;
    return { newest: newest ?? null, superseded };
}

/**
 * Returns a file name that is not in `taken`, derived from `fileName` by inserting ` (n)`
 * before the extension.
 */
export function uniqueConflictFileName(fileName: string, taken: ReadonlySet<string>): string {
    if (!taken.has(fileName)) return fileName;

    const dot = fileName.lastIndexOf('.');
    const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
    const extension = dot > 0 ? fileName.slice(dot) : '';

    for (let n = 2; ; n++) {
        const candidate = `${stem} (${n})${extension}`;
        if (!taken.has(candidate)) return candidate;
    }
}
