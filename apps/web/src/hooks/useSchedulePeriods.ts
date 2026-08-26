import { useAcademicConfig } from './useAcademicConfig';
import { generateSchedulePeriods, Period } from '@/utils/schedule.utils';
import { useMemo } from 'react';

export function useSchedulePeriods(): { periods: Period[], isLoading: boolean } {
    const { data: config, isLoading } = useAcademicConfig();

    const periods = useMemo(() => {
        if (!config || !config.schedule) {
            return [];
        }
        return generateSchedulePeriods(config.schedule);
    }, [config]);

    return { periods, isLoading };
}
