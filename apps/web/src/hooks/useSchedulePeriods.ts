import { useAcademicConfig } from './useAcademicConfig';
import { generateSchedulePeriods, Period, ShiftType, getScheduleConfigForShift } from '@/utils/schedule.utils';
import { useMemo } from 'react';

export function useSchedulePeriods(shift: ShiftType = 'MANANA'): { periods: Period[], isLoading: boolean } {
    const { data: config, isLoading } = useAcademicConfig();

    const periods = useMemo(() => {
        const scheduleConfig = getScheduleConfigForShift(config?.schedule, shift);
        return generateSchedulePeriods(scheduleConfig);
    }, [config, shift]);

    return { periods, isLoading };
}
