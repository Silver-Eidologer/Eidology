import * as v from 'valibot';

/**
 * Pure rules of the trash for deleted notes. Nothing here touches the file system.
 *
 * A deleted note's history folder is moved from `<db root>/<noteId>` to
 * `<db root>/.trash/<noteId>`, and a `trash.json` file describing the deletion is written
 * inside it. The trash holds no index file: the list of entries is the list of its folders.
 */

/** Name of the trash folder inside the database root. */
export const TRASH_FOLDER_NAME = '.trash';

/** Name of the file inside a trashed folder that describes the deletion. */
export const TRASH_META_FILE = 'trash.json';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const TrashMetaSchema = v.object({
    noteId: v.pipe(v.string(), v.minLength(1)),
    notePath: v.pipe(v.string(), v.minLength(1)),
    deletedAt: v.pipe(v.string(), v.minLength(1)),
});

/** Description of a deletion, stored in `trash.json`. */
export type TrashMeta = v.InferOutput<typeof TrashMetaSchema>;

/**
 * Parses the text of a `trash.json` file.
 * @returns The description, or `null` if the text is not valid JSON or lacks a required field.
 */
export function parseTrashMeta(raw: string): TrashMeta | null {
    try {
        const result = v.safeParse(TrashMetaSchema, JSON.parse(raw));
        return result.success ? result.output : null;
    } catch {
        return null;
    }
}

/**
 * Tells whether a trashed entry has passed its retention period.
 *
 * @param deletedAt - ISO date of the deletion.
 * @param retentionDays - Retention in days. Zero or a negative value means entries never expire.
 * @param now - Current time in milliseconds since the epoch.
 * @returns `false` when retention is disabled or `deletedAt` is not a valid date.
 */
export function isTrashEntryExpired(deletedAt: string, retentionDays: number, now: number): boolean {
    if (!Number.isFinite(retentionDays) || retentionDays <= 0) return false;
    const deleted = Date.parse(deletedAt);
    if (Number.isNaN(deleted)) return false;
    return now - deleted >= retentionDays * MS_PER_DAY;
}

/**
 * Chooses the path where a restored note is created.
 * The original path is used when it is free; otherwise ` (restored)` is inserted before the
 * extension, then ` (restored 2)`, ` (restored 3)` and so on.
 *
 * @param originalPath - Path the note had when it was deleted.
 * @param isTaken - Tells whether a candidate path is already in use.
 */
export function pickRestorePath(originalPath: string, isTaken: (path: string) => boolean): string {
    if (!isTaken(originalPath)) return originalPath;

    const slash = originalPath.lastIndexOf('/');
    const directory = slash >= 0 ? originalPath.slice(0, slash + 1) : '';
    const fileName = originalPath.slice(slash + 1);
    const dot = fileName.lastIndexOf('.');
    const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
    const extension = dot > 0 ? fileName.slice(dot) : '';

    for (let attempt = 1; ; attempt++) {
        const label = attempt === 1 ? '(restored)' : `(restored ${attempt})`;
        const candidate = `${directory}${stem} ${label}${extension}`;
        if (!isTaken(candidate)) return candidate;
    }
}
