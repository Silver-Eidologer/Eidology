/**
 * Pure rules for automatic saves that run without the sidebar view.
 *
 * An automatic save is triggered for a specific file (a vault event or the watch-mode timer).
 * It must save that file whether or not the sidebar view is mounted, so it does not read the
 * view state to find the target. These helpers hold the decisions that do not need Obsidian.
 */

/** Branch used when the note manifest does not name one. */
export const FALLBACK_BRANCH = 'main';

/**
 * Tells whether the view currently shows the file that is being saved.
 * Only then may the save update the view state.
 *
 * @param viewPath - Path of the file in the view state, if any.
 * @param savedPath - Path of the saved file. `undefined` means a save made for the view itself.
 */
export function isShownInView(viewPath: string | null | undefined, savedPath: string | undefined): boolean {
    if (savedPath === undefined) return true;
    return viewPath === savedPath;
}

/**
 * Chooses the branch an automatic edit is written to when the view state is not used.
 * The note manifest is the source of truth; the view state holds the branch only after the
 * sidebar has loaded it.
 */
export function pickBranchName(manifestBranch: string | null | undefined): string {
    return manifestBranch && manifestBranch.length > 0 ? manifestBranch : FALLBACK_BRANCH;
}

/**
 * Remembers why automatic saves are being skipped, so the reason is logged once per episode
 * and not on every keystroke.
 */
export function createSkipWarningTracker() {
    let lastReason: string | null = null;
    return {
        /** @returns `true` if `reason` differs from the one last reported and should be logged now. */
        shouldWarn(reason: string): boolean {
            if (lastReason === reason) return false;
            lastReason = reason;
            return true;
        },
        /** Call when saving works again, so a later failure is reported. */
        reset(): void {
            lastReason = null;
        },
    };
}
