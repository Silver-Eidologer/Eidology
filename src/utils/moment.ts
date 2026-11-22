import { moment as obsidianMoment } from 'obsidian';

/**
 * Callable `moment` provided by Obsidian.
 *
 * Obsidian declares its `moment` export as a module namespace, which TypeScript does not
 * accept as a call target, although the runtime value is the callable moment function.
 * The call signature is taken from `moment.utc`, which has the same parameters and return
 * type as `moment()`. This is the only cast needed; call sites use `moment(...)` directly.
 */
export const moment = obsidianMoment as unknown as typeof obsidianMoment.utc & typeof obsidianMoment;
