import { useAcademicConfig } from './useAcademicConfig';
import { Period, ShiftType, periodosDelTurno } from '@/utils/schedule.utils';
import { useMemo } from 'react';

export function useSchedulePeriods(shift: ShiftType = 'MANANA'): { periods: Period[], isLoading: boolean } {
    const { data: config, isLoading } = useAcademicConfig();

    const periods = useMemo(() => periodosDelTurno(config?.schedule, shift), [config, shift]);

    return { periods, isLoading };
}
