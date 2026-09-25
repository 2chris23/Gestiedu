export type ShiftType = 'MANANA' | 'TARDE' | 'INTEGRAL';

export interface ScheduleConfig {
    startTime: string;
    blockDuration: number;
    totalBlocks: number;
    breakAfterBlock: number;
    breakDuration: number;
}

export const DEFAULT_MORNING_SCHEDULE: ScheduleConfig = {
    startTime: '07:00',
    blockDuration: 45,
    totalBlocks: 7,
    breakAfterBlock: 3,
    breakDuration: 15
};

export const DEFAULT_AFTERNOON_SCHEDULE: ScheduleConfig = {
    startTime: '13:00',
    blockDuration: 45,
    totalBlocks: 6,
    breakAfterBlock: 3,
    breakDuration: 15
};

export const TIME_SLOTS_MANANA = [
    "07:00", "07:45", "08:30", "09:15", "10:00", "10:45", "11:30", "12:15"
];

export const TIME_SLOTS_TARDE = [
    "13:00", "13:45", "14:30", "15:15", "16:00", "16:45", "17:30"
];

export function getScheduleConfigForShift(baseConfig?: ScheduleConfig | null, shift: ShiftType = 'MANANA'): ScheduleConfig {
    if (shift === 'TARDE') {
        return {
            startTime: '13:00',
            blockDuration: baseConfig?.blockDuration || 45,
            totalBlocks: baseConfig?.totalBlocks || 6,
            breakAfterBlock: baseConfig?.breakAfterBlock || 3,
            breakDuration: baseConfig?.breakDuration || 15
        };
    }
    return baseConfig || DEFAULT_MORNING_SCHEDULE;
}

export interface Period {
    id: string;
    startTime: string;
    endTime: string;
    label: string;
    type: 'class' | 'break';
}

function addMinutes(timeStr: string, minutes: number): string {
    const [h, m] = timeStr.split(':').map(Number);
    const date = new Date(0, 0, 0, h, m + minutes);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function getOrdinal(n: number): string {
    const ordinals = [
        '0', '1ra', '2da', '3ra', '4ta', '5ta', '6ta', '7ma', '8va', '9na', '10ma',
        '11ma', '12ma', '13ma', '14ta', '15ta'
    ];
    return ordinals[n] || `${n}ta`;
}

export function generateSchedulePeriods(config: ScheduleConfig): Period[] {
    const periods: Period[] = [];
    let currentTime = config.startTime;

    for (let i = 1; i <= config.totalBlocks; i++) {
        const endTime = addMinutes(currentTime, config.blockDuration);
        periods.push({
            id: `p${i}`,
            startTime: currentTime,
            endTime: endTime,
            label: `${getOrdinal(i)} Hora`,
            type: 'class'
        });
        currentTime = endTime;

        if (i === config.breakAfterBlock) {
            const breakEndTime = addMinutes(currentTime, config.breakDuration);
            periods.push({
                id: `b1`,
                startTime: currentTime,
                endTime: breakEndTime,
                label: 'Recreo',
                type: 'break'
            });
            currentTime = breakEndTime;
        }
    }

    return periods;
}
