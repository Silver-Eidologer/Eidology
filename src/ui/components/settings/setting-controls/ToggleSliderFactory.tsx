import { memo, useCallback, type FC } from 'react';
import { useHistorySetting, useSettingsViewMode, useUpdateHistorySettings } from '@/ui/components/settings/SettingsScope';
import type { HistorySettings, ViewMode } from '@/types';
import { SettingComponent } from '@/ui/components';
import { validateNumber } from '@/ui/components/settings/utils';
import { SliderWithInputControl } from '@/ui/components/settings/controls';

type Unit = 'seconds' | 'days' | 'lines';
type TextResolver = string | ((mode: ViewMode) => string);

interface ToggleSliderConfig {
    toggleName: TextResolver;
    toggleDesc: TextResolver;
    toggleKey: keyof HistorySettings;
    sliderName: TextResolver;
    sliderDesc: (currentValue: number, mode: ViewMode) => string;
    sliderKey: keyof HistorySettings;
    min: number;
    max: number;
    step: number;
    unit: Unit;
    placeholder: string;
}

const resolveText = (text: TextResolver, mode: ViewMode) => 
    typeof text === 'function' ? text(mode) : text;

/**
 * Factory function to create toggle+slider setting components.
 */
export const createToggleSliderSetting = (config: ToggleSliderConfig): FC<{ disabled: boolean }> => {
    const Component = memo(({ disabled }: { disabled: boolean }) => {
        const updateSettings = useUpdateHistorySettings();
        const viewMode = useSettingsViewMode();
        const enabled = !!useHistorySetting(config.toggleKey);
        const value = useHistorySetting(config.sliderKey) as number;
        
        const handleToggle = useCallback((v: boolean) => {
            updateSettings({ [config.toggleKey]: v } as Partial<HistorySettings>);
        }, [updateSettings]);
        
        const handleSliderChange = useCallback((v: number) => {
            try {
                const validatedValue = validateNumber(v, config.min, config.max);
                updateSettings({ [config.sliderKey]: validatedValue } as Partial<HistorySettings>);
            } catch (error) {
                console.error(`Invalid value:`, error);
            }
        }, [updateSettings]);

        const resolvedToggleName = resolveText(config.toggleName, viewMode);
        const resolvedToggleDesc = resolveText(config.toggleDesc, viewMode);
        const resolvedSliderName = resolveText(config.sliderName, viewMode);
        const resolvedSliderDesc = config.sliderDesc(value, viewMode);
        
        return (
            <>
                <SettingComponent name={resolvedToggleName} desc={resolvedToggleDesc}>
                    <input 
                        type="checkbox" 
                        checked={enabled} 
                        onChange={e => handleToggle(e.target.checked)} 
                        disabled={disabled}
                        aria-label={`Toggle ${resolvedToggleName.toLowerCase()}`}
                    />
                </SettingComponent>
                {enabled && (
                    <SettingComponent 
                        name={resolvedSliderName} 
                        desc={resolvedSliderDesc}
                    >
                        <SliderWithInputControl
                            min={config.min} 
                            max={config.max} 
                            step={config.step} 
                            value={value} 
                            onFinalChange={handleSliderChange} 
                            disabled={disabled} 
                            unit={config.unit}
                            placeholder={config.placeholder}
                        />
                    </SettingComponent>
                )}
            </>
        );
    });
    
    return Component;
};