'use client';

import { Calendar } from 'lucide-react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface YearSelectorProps {
    cycles: { id: string; name: string; status: string }[];
}

export function YearSelector({ cycles }: YearSelectorProps) {
    const router = useRouter();
    const pathname = usePathname();
    const params = useParams();

    const currentCycleId = typeof params.cycleId === 'string' ? params.cycleId : '';

    const handleValueChange = (newCycleId: string) => {
        if (currentCycleId) {
            const newPath = pathname.replace(currentCycleId, newCycleId);
            router.push(newPath);
        }
    };

    return (
        <div className="relative w-[200px]">
            <Calendar className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Select value={currentCycleId || undefined} onValueChange={handleValueChange}>
                <SelectTrigger className="pl-9">
                    <SelectValue placeholder="Seleccionar año" />
                </SelectTrigger>
                <SelectContent>
                    {cycles.map((cycle) => (
                        <SelectItem key={cycle.id} value={cycle.id || cycle.name}>
                            {cycle.name} {cycle.status === 'ACTIVE' ? '(Actual)' : ''}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}
