import type { AppThunk } from '@/state';
import { shouldAbort } from '@/state/utils/guards';
import { openTrashModal } from '@/ui/modals/TrashModal';

/**
 * Opens the dialog that lists the deleted notes in the trash.
 * It does not depend on the sidebar being open or on the active note.
 */
export const showTrash = (): AppThunk => async (_dispatch, getState, services) => {
    if (shouldAbort(services, getState)) return;
    openTrashModal(services.app, services.trashService, services.plugin.settings.trashRetentionDays ?? 30);
};
