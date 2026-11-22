import type { AppThunk } from '@/state';
import { AppStatus } from '@/state';
import { shouldAbort } from '@/state/utils/guards';
import { promptVersionDetails } from '@/ui/modals/VersionDetailsModal';
import { resolveVersionDetailPrompts } from '../helpers';
import { saveNewVersion } from './save-version.thunk';
import { updateVersionDetails } from './update-version.thunk';

/**
 * Saves a new version on the user's request (button or command).
 *
 * If naming or description is enabled for versions, a dialog asks for those details first and
 * nothing is saved when it is dismissed. Otherwise the version is saved at once. The dialog
 * does not depend on the sidebar being open. Automatic saves never use this thunk.
 */
export const saveNewVersionWithPrompt = (): AppThunk => async (dispatch, getState, services) => {
    if (shouldAbort(services, getState)) return;

    const state = getState().app;
    if (state.status !== AppStatus.READY || state.isProcessing || state.isRenaming) {
        // saveNewVersion reports the reason to the user.
        await dispatch(saveNewVersion({}));
        return;
    }

    const prompts = resolveVersionDetailPrompts(
        state.viewMode,
        state.effectiveSettings,
        state.settings.versionHistorySettings
    );

    if (!prompts.name && !prompts.description) {
        await dispatch(saveNewVersion({}));
        return;
    }

    const filePath = state.file?.path;
    const details = await promptVersionDetails(services.app, prompts);
    if (details === null || shouldAbort(services, getState)) return;

    // The active note may have changed while the dialog was open. Saving then would store
    // the new note's content under the details typed for the previous one.
    if (getState().app.file?.path !== filePath) {
        services.uiService.showNotice('Version not saved: the active note changed while the dialog was open.', 5000);
        return;
    }

    const name = prompts.name ? details.name : '';
    const description = prompts.description ? details.description : '';

    const result = await dispatch(saveNewVersion({
        detailsPrompted: true,
        ...(name ? { name } : {}),
    }));

    if (!saveNewVersion.fulfilled.match(result) || !result.payload?.newVersionEntry) return;
    if (!description) return;

    await dispatch(updateVersionDetails(result.payload.newVersionEntry.id, { name, description }));
};
