import * as v from 'valibot';
import { validatePattern } from '@/utils/path-filter/validation';
import { validatePathSegments } from '@/ui/components/settings/utils/validation/path-validator';
import { createIdFormatSchema } from '@/ui/components/settings/utils/factories/id-format-factory';
import {
    RESERVED_FRONTMATTER_KEYS_SET,
    REGEX_PATTERNS
} from '@/ui/components/settings/utils/helpers/constants';

/**
 * Schema for validating the database folder path.
 * Enforces strict security rules: no traversal, no reserved names, valid characters for all OSs.
 */
export const DatabasePathSchema = v.pipe(
    v.string(),
    v.transform((val: string): string => val.trim()),
    v.check((val) => val.length > 0, "Database path cannot be empty"),
    v.check((val) => val.length <= 255, "Path is too long (max 255 chars)"),
    v.check((val) => !val.startsWith('/'), "Path must be relative (cannot start with /)"),
    v.check((val) => !val.endsWith('/'), "Path cannot end with a slash"),
    v.check((val) => !REGEX_PATTERNS.PATH_TRAVERSAL.test(val), "Path traversal (..) is not allowed"),
    v.check((val) => {
        // Strict character check for the entire path string first (excluding separators)
        // We allow forward slashes as separators, but no other restricted chars
        const charsToCheck = val.replace(/\//g, '');
        return !REGEX_PATTERNS.INVALID_FILENAME_CHARS.test(charsToCheck);
    }, "Path contains invalid characters (<>:\"|?*\\)"),
    v.check((val) => {
        const segmentValidation = validatePathSegments(val);
        return segmentValidation.isValid;
    }, "Path contains invalid segments or reserved names")
);

/**
 * Schema for validating the frontmatter key.
 * Enforces strict YAML-safe key format and avoids Obsidian reserved keys.
 */
export const FrontmatterKeySchema = v.pipe(
    v.string(),
    v.transform((val: string): string => val.trim()),
    v.check((val) => val.length > 0, "Key cannot be empty"),
    v.check((val) => val.length <= 50, "Key is too long (max 50 chars)"),
    v.check((val) => REGEX_PATTERNS.SAFE_KEY.test(val), "Key can only contain letters, numbers, underscores, and hyphens"),
    v.check((val) => !RESERVED_FRONTMATTER_KEYS_SET.has(val.toLowerCase()), "This is a reserved Obsidian frontmatter key")
);

/** Maximum length accepted for one pattern line in the settings form. */
export const MAX_FORM_PATTERN_LENGTH = 500;

/**
 * Finds the reason why a single pattern line cannot be used as an exclusion pattern.
 *
 * A line is accepted exactly when the path filter would compile it (`validatePattern` is the same
 * check that `compileRegex` applies), so no accepted line is silently discarded at runtime.
 * No heuristic over the pattern text is used here: the validator runs on every keystroke, and a
 * backtracking-prone check would block the interface.
 *
 * @param line - Pattern, already trimmed and non-empty.
 * @returns A description of the problem, or `null` if the line is usable.
 */
export function findPatternProblem(line: string): string | null {
    if (line.length > MAX_FORM_PATTERN_LENGTH) {
        return `longer than ${MAX_FORM_PATTERN_LENGTH} characters`;
    }

    try {
        new RegExp(line);
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return `invalid regular expression (${detail})`;
    }

    const runtimeCheck = validatePattern(line);
    return runtimeCheck.isValid ? null : (runtimeCheck.error ?? 'unsupported pattern');
}

/**
 * Schema for validating a list of regular expressions (one per line).
 * Blank lines are ignored. The first unusable line is reported with its line number.
 */
export const RegexListSchema = v.pipe(
    v.string(),
    v.rawCheck(({ dataset, addIssue }) => {
        if (!dataset.typed) return;

        const lines = dataset.value.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i]?.trim() ?? '';
            if (line.length === 0) continue;

            const problem = findPatternProblem(line);
            if (problem) {
                addIssue({ message: `Line ${i + 1}: ${problem}` });
                return;
            }
        }
    })
);

export const NoteIdFormatSchema = createIdFormatSchema(['path', 'uuid', 'timestamp'] as const, 'Note ID');
export const VersionIdFormatSchema = createIdFormatSchema(['timestamp', 'version', 'name'] as const, 'Version ID');
