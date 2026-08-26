import { useQuery } from '@tanstack/react-query';
import { academicYearService } from '@/services/academic-year.service';

export function useAcademicYears() {
    return useQuery({
        queryKey: ['academicYears'],
        queryFn: () => academicYearService.getAcademicYears(),
    });
}

