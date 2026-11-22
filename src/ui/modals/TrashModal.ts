import { Modal, Notice, Setting, type App } from 'obsidian';
import type { TrashEntry, TrashService } from '@/core/trash-service';

/**
 * Lists the deleted notes whose history is in the trash, with actions to restore an entry,
 * delete it permanently, or empty the trash.
 */
class TrashModal extends Modal {
    private confirmEmpty = false;

    constructor(
        app: App,
        private readonly service: TrashService,
        private readonly retentionDays: number
    ) {
        super(app);
    }

    override onOpen(): void {
        this.setTitle('Deleted notes');
        void this.render();
    }

    override onClose(): void {
        this.contentEl.empty();
    }

    private async render(): Promise<void> {
        const { contentEl } = this;
        contentEl.empty();

        let entries: TrashEntry[];
        try {
            entries = await this.service.list();
        } catch (error) {
            console.warn('Eidology: The trash could not be read.', error);
            contentEl.createEl('p', { text: 'The trash could not be read. See the console for details.' });
            return;
        }

        contentEl.createEl('p', {
            cls: 'setting-item-description',
            text: this.retentionDays > 0
                ? `Entries are deleted permanently ${this.retentionDays} days after the note was deleted, when the plugin loads.`
                : 'Entries stay here until they are deleted from this list.',
        });

        if (entries.length === 0) {
            contentEl.createEl('p', { text: 'The trash is empty.' });
            return;
        }

        for (const entry of entries) {
            const versions = `${entry.versionCount} ${entry.versionCount === 1 ? 'version' : 'versions'}`;
            new Setting(contentEl)
                .setName(entry.notePath)
                .setDesc(`Deleted ${new Date(entry.deletedAt).toLocaleString()}. ${versions}.`)
                .addButton(button => button.setButtonText('Restore').setCta().onClick(() => void this.restore(entry)))
                .addButton(button => button.setButtonText('Delete permanently').setWarning().onClick(() => void this.purge(entry)));
        }

        new Setting(contentEl).addButton(button => button
            .setButtonText(this.confirmEmpty ? 'Confirm: delete all permanently' : 'Empty trash')
            .setWarning()
            .onClick(() => void this.emptyTrash()));
    }

    private async restore(entry: TrashEntry): Promise<void> {
        try {
            const result = await this.service.restore(entry.noteId);
            const details = [
                result.renamed ? 'The original path was in use.' : '',
                result.contentRecovered ? '' : 'The history held no version, so the note was created empty.',
            ].filter(Boolean).join(' ');
            new Notice(`Eidology: restored "${result.path}". ${details}`.trim(), 10000);
        } catch (error) {
            console.error(`Eidology: Could not restore "${entry.notePath}".`, error);
            new Notice(`Eidology: could not restore "${entry.notePath}". ${error instanceof Error ? error.message : ''}`.trim(), 10000);
        }
        this.confirmEmpty = false;
        await this.render();
    }

    private async purge(entry: TrashEntry): Promise<void> {
        try {
            await this.service.purge(entry.noteId);
        } catch (error) {
            console.error(`Eidology: Could not delete "${entry.notePath}" from the trash.`, error);
            new Notice(`Eidology: could not delete "${entry.notePath}" from the trash.`, 8000);
        }
        this.confirmEmpty = false;
        await this.render();
    }

    private async emptyTrash(): Promise<void> {
        if (!this.confirmEmpty) {
            this.confirmEmpty = true;
            await this.render();
            return;
        }
        this.confirmEmpty = false;
        try {
            const count = await this.service.emptyTrash();
            new Notice(`Eidology: ${count} ${count === 1 ? 'entry' : 'entries'} deleted from the trash.`);
        } catch (error) {
            console.error('Eidology: Could not empty the trash.', error);
            new Notice('Eidology: could not empty the trash. See the console for details.', 8000);
        }
        await this.render();
    }
}

/** Opens the trash dialog. */
export function openTrashModal(app: App, service: TrashService, retentionDays: number): void {
    new TrashModal(app, service, retentionDays).open();
}
