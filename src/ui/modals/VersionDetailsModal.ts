import { Modal, Setting, type App } from 'obsidian';

export interface VersionDetails {
    name: string;
    description: string;
}

export interface VersionDetailsFields {
    name: boolean;
    description: boolean;
}

/**
 * Dialog that asks for the name and/or description of a version about to be saved.
 */
class VersionDetailsModal extends Modal {
    private name = '';
    private description = '';
    private settled = false;

    constructor(
        app: App,
        private readonly fields: VersionDetailsFields,
        private readonly onSettled: (details: VersionDetails | null) => void
    ) {
        super(app);
    }

    override onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        this.setTitle('Save version');

        let firstInput: HTMLInputElement | HTMLTextAreaElement | null = null;

        if (this.fields.name) {
            new Setting(contentEl).setName('Name').addText(text => {
                text.setPlaceholder('Optional').onChange(value => { this.name = value; });
                text.inputEl.addEventListener('keydown', event => {
                    if (event.key === 'Enter' && !event.isComposing) {
                        event.preventDefault();
                        this.submit();
                    }
                });
                firstInput ??= text.inputEl;
            });
        }

        if (this.fields.description) {
            new Setting(contentEl).setName('Description').addTextArea(area => {
                area.setPlaceholder('Optional').onChange(value => { this.description = value; });
                area.inputEl.rows = 4;
                area.inputEl.addEventListener('keydown', event => {
                    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing) {
                        event.preventDefault();
                        this.submit();
                    }
                });
                firstInput ??= area.inputEl;
            });
        }

        new Setting(contentEl)
            .addButton(button => button.setButtonText('Save').setCta().onClick(() => this.submit()))
            .addButton(button => button.setButtonText('Cancel').onClick(() => this.close()));

        (firstInput as HTMLElement | null)?.focus({ preventScroll: true });
    }

    override onClose(): void {
        this.contentEl.empty();
        this.settle(null);
    }

    private submit(): void {
        this.settle({ name: this.name.trim(), description: this.description.trim() });
        this.close();
    }

    private settle(details: VersionDetails | null): void {
        if (this.settled) return;
        this.settled = true;
        this.onSettled(details);
    }
}

/**
 * Opens the dialog and resolves with the entered details, or with `null` if it is closed
 * without saving (Cancel, Escape, or a click outside).
 */
export function promptVersionDetails(app: App, fields: VersionDetailsFields): Promise<VersionDetails | null> {
    return new Promise(resolve => {
        new VersionDetailsModal(app, fields, resolve).open();
    });
}
