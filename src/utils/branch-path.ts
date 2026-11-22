/**
 * Mapping of branch names to folder names and uniqueness rules for branch names.
 *
 * The folder name of a branch is an injective encoding of its name: two different names
 * never produce the same folder name. Letters and digits of any script, spaces, `_`, `.`
 * and `-` are kept as they are. Every other character, including `%`, is replaced by the
 * `%XX` escape of each of its UTF-8 bytes. In addition:
 *
 * - a trailing `.` or space is escaped, because Windows silently drops them;
 * - a name whose stem (the part before the first `.`) is a reserved Windows device name
 *   (`CON`, `NUL`, `COM1`, ...) has its first character escaped.
 *
 * Injectivity does not prevent collisions on case-insensitive or normalizing file systems
 * (Windows, macOS): `Main` and `main`, or the NFC and NFD forms of the same text, are
 * different names that share a folder there. `findBranchNameProblem` rejects such names
 * when a branch is created.
 */

/** Maximum size, in UTF-8 bytes, of one path component on the supported file systems. */
export const MAX_PATH_COMPONENT_BYTES = 255;

const KEPT_CHARACTER = /^[\p{L}\p{N} _.-]$/u;
const RESERVED_DEVICE_STEM = /^(?:con|prn|aux|nul|com[0-9\u00B9\u00B2\u00B3]|lpt[0-9\u00B9\u00B2\u00B3])$/i;

const utf8 = new TextEncoder();

function escapeCharacter(character: string): string {
    let escaped = '';
    for (const byte of utf8.encode(character)) {
        escaped += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
    }
    return escaped;
}

/**
 * Encodes a branch name as a folder name.
 *
 * @param name - Branch name. Surrounding whitespace is ignored.
 * @throws {Error} If the name is empty or its encoding exceeds `MAX_PATH_COMPONENT_BYTES`.
 */
export function encodeBranchPathComponent(name: string): string {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
        throw new Error('Branch name cannot be empty.');
    }

    const characters = Array.from(trimmed);

    const stem = (trimmed.split('.')[0] ?? '').trimEnd();
    const escapeFirst = RESERVED_DEVICE_STEM.test(stem);
    const lastIndex = characters.length - 1;

    let encoded = '';
    characters.forEach((character, index) => {
        const mustEscape =
            !KEPT_CHARACTER.test(character) ||
            (index === 0 && escapeFirst) ||
            (index === lastIndex && (character === '.' || character === ' '));
        encoded += mustEscape ? escapeCharacter(character) : character;
    });

    if (utf8.encode(encoded).length > MAX_PATH_COMPONENT_BYTES) {
        throw new Error(`Branch name is too long for the file system (more than ${MAX_PATH_COMPONENT_BYTES} bytes once encoded).`);
    }
    return encoded;
}

/**
 * Key under which two branch names are considered the same on disk. Names with equal keys
 * can share a folder on case-insensitive or normalizing file systems.
 */
export function branchNameKey(name: string): string {
    return encodeBranchPathComponent(name.trim().normalize('NFC')).toLowerCase();
}

/**
 * Checks a new branch name against the existing ones.
 *
 * @param existingNames - Names of the branches that already exist in the note.
 * @param candidate - Name of the branch to create.
 * @returns A message describing why the name cannot be used, or `null` if it can.
 */
export function findBranchNameProblem(existingNames: Iterable<string>, candidate: string): string | null {
    let key: string;
    try {
        key = branchNameKey(candidate);
    } catch (error) {
        return error instanceof Error ? error.message : 'Invalid branch name.';
    }

    for (const existing of existingNames) {
        let existingKey: string;
        try {
            existingKey = branchNameKey(existing);
        } catch {
            continue;
        }
        if (existingKey !== key) continue;

        if (existing.trim() === candidate.trim()) {
            return `Branch "${candidate.trim()}" already exists.`;
        }
        return `Branch "${candidate.trim()}" conflicts with the existing branch "${existing}": names that differ only by letter case or Unicode form share one folder.`;
    }
    return null;
}

/**
 * Recovers a branch name from a folder name produced by `encodeBranchPathComponent`.
 * Every escape is `%XX` of a UTF-8 byte and `%` itself is always escaped, so decoding is exact.
 *
 * @returns The branch name, or `null` if the folder name contains an invalid escape sequence.
 */
export function decodeBranchPathComponent(folderName: string): string | null {
    try {
        return decodeURIComponent(folderName);
    } catch {
        return null;
    }
}
