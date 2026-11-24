/**
 * Diagnostic timing of the plugin start-up.
 *
 * `startupMark` records the time of a named step. Two reports are written to the console, prefixed
 * `Eidology: startup timing`: one when `onload` finishes (the part Obsidian counts as the plugin's
 * load time) and one when the work deferred past the first layout has finished.
 *
 * Times come from `performance.now()`, which counts from the start of the Obsidian window, so they
 * can be compared with the figures of Obsidian's own start-up breakdown. The first column is relative
 * to the moment this module was evaluated, which is when the plugin's script finished loading.
 * Nothing is stored or sent anywhere.
 */

export interface StartupEntry {
    label: string;
    /** `performance.now()` at the mark, in milliseconds. */
    at: number;
}

const entries: StartupEntry[] = [];
const moduleEvaluatedAt = performance.now();

/** Records a named step of the start-up. */
export function startupMark(label: string): void {
    entries.push({ label, at: performance.now() });
}

/**
 * Formats entries as aligned text lines. Pure function.
 *
 * @param origin - Time that the first column is relative to.
 * @returns One line per entry: time since `origin`, time since the previous entry, label.
 */
export function formatStartupReport(list: readonly StartupEntry[], origin: number): string[] {
    const lines: string[] = [];
    let previous = origin;
    for (const entry of list) {
        const since = (entry.at - origin).toFixed(0).padStart(7);
        const delta = (entry.at - previous).toFixed(0).padStart(6);
        lines.push(`${since} ms  (+${delta})  ${entry.label}`);
        previous = entry.at;
    }
    return lines;
}

/** Writes the marks recorded so far to the console. */
export function startupReport(title: string): void {
    const header = `Eidology: startup timing, ${title}. Module evaluated at ${moduleEvaluatedAt.toFixed(0)} ms after window start; columns are ms since then and the step's own duration.`;
    console.info([header, ...formatStartupReport(entries, moduleEvaluatedAt)].join('\n'));
}
