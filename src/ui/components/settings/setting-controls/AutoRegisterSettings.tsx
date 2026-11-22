import { memo, useCallback, useEffect, useRef } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { valibotResolver } from '@hookform/resolvers/valibot';
import * as v from 'valibot';
import { useAppDispatch, useAppSelector } from '@/ui/hooks';
import { thunks } from '@/state';
import { SettingComponent } from '@/ui/components';
import { ValidatedTextarea } from '@/ui/components/settings/controls';
import { RegexListSchema } from '@/ui/components/settings/utils';


const AutoRegisterFormSchema = v.object({
    filters: RegexListSchema
});

type AutoRegisterFormValues = v.InferOutput<typeof AutoRegisterFormSchema>;

interface AutoRegisterSettingsProps {
    settingKey: 'versionHistorySettings' | 'editHistorySettings';
    disabled?: boolean;
}

export const AutoRegisterSettings: React.FC<AutoRegisterSettingsProps> = memo(({ settingKey, disabled }) => {
    const dispatch = useAppDispatch();
    
    // We read from the global settings directly since this is a global config
    const settings = useAppSelector(state => state.app.settings[settingKey]);
    const autoRegisterNotes = settings.autoRegisterNotes;
    const pathFilters = settings.pathFilters;

    const handleAutoRegisterToggle = useCallback((value: boolean) => {
        dispatch(thunks.updateGlobalSettings({ 
            [settingKey]: { ...settings, autoRegisterNotes: value } 
        }));
    }, [dispatch, settingKey, settings]);

    const { control, handleSubmit, reset, getValues, formState: { isValid, isDirty } } = useForm<AutoRegisterFormValues>({
        mode: 'onChange',
        resolver: valibotResolver(AutoRegisterFormSchema),
        defaultValues: { filters: pathFilters.join('\n') }
    });

    const normalizeFilters = (text: string): string[] => text.split('\n').map(line => line.trim()).filter(Boolean);

    // The list is saved only when the user presses Save. Saving while typing rewrote the textarea
    // with the normalized list (blank lines and surrounding spaces removed) under the cursor.
    const onSubmit: SubmitHandler<AutoRegisterFormValues> = async (data) => {
        await dispatch(thunks.updateGlobalSettings({
            [settingKey]: { ...settings, pathFilters: normalizeFilters(data.filters) }
        }));
    };

    // Follows changes of the stored list. Text that is being edited is replaced only when the stored
    // list equals it once normalized, which is the case after a successful save. A failed save leaves
    // the stored list unchanged, so the form stays unsaved.
    const isDirtyRef = useRef(isDirty);
    isDirtyRef.current = isDirty;
    useEffect(() => {
        const stored = pathFilters.join('\n');
        const editedMatchesStored = normalizeFilters(getValues('filters')).join('\n') === stored;
        if (!isDirtyRef.current || editedMatchesStored) {
            reset({ filters: stored });
        }
    }, [pathFilters, reset, getValues]);

    return (
        <>
            <SettingComponent 
                name="Automatically track new notes" 
                desc="When enabled, any opened note not currently under version control will be automatically added."
            >
                <input 
                    type="checkbox" 
                    checked={autoRegisterNotes} 
                    onChange={e => handleAutoRegisterToggle(e.target.checked)}
                    disabled={disabled}
                    aria-label="Toggle automatic note tracking"
                />
            </SettingComponent>
            {autoRegisterNotes && (
                <>
                    <p className="v-settings-info v-meta-label">
                        Enter one case-sensitive regular expression per line. Notes with paths matching any of these patterns will be excluded from auto-tracking. Press Save to apply changes.
                    </p>
                    <form onSubmit={handleSubmit(onSubmit)} className="v-setting-form">
                        <ValidatedTextarea 
                            name="filters"
                            control={control}
                            rows={3}
                            placeholder={"^Private/.*\n_templates/.*"}
                            maxLength={1000}
                            disabled={disabled ?? false}
                        />
                        <div className="v-settings-action-row">
                            <button
                                type="submit"
                                className="mod-cta"
                                aria-label="Save exclusion patterns"
                                disabled={(disabled ?? false) || !isValid || !isDirty}
                            >
                                Save
                            </button>
                        </div>
                    </form>
                </>
            )}
        </>
    );
});
AutoRegisterSettings.displayName = 'AutoRegisterSettings';