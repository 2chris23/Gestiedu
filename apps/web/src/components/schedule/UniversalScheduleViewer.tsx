import React from 'react';
import { Printer } from 'lucide-react';
import Link from 'next/link';

export interface ScheduleBlock {
    day: string;
    startTime: string;
    endTime: string;
    subject: string;
    location?: string;
    detail?: string;
    color?: string;
    link?: string;
    subjectId?: string;
}

interface Props {
    schedule: ScheduleBlock[];
    role: 'student' | 'teacher' | 'admin';
    readOnly?: boolean;
}

const TIME_SLOTS = [
    "07:00", "07:45", "08:30", "09:15", "10:00", "10:45", "11:30", "12:15"
];

const DAYS = [
    { key: 'Lun', label: 'LUNES' },
    { key: 'Mar', label: 'MARTES' },
    { key: 'Mié', label: 'MIERCOLES' },
    { key: 'Jue', label: 'JUEVES' },
    { key: 'Vie', label: 'VIERNES' },
];

export default function UniversalScheduleViewer({ schedule, role, readOnly = true }: Props) {

    const handlePrint = () => {
        window.print();
    };

    // Color mapping logic
    const getBlockColor = (item: ScheduleBlock) => {
        if (item.color) {
            return { backgroundColor: item.color + '20', borderColor: item.color, color: item.color };
        }
        return role === 'student'
            ? { backgroundColor: '#dbeafe', borderColor: '#3b82f6', color: '#1e40af' }
            : { backgroundColor: '#f3e8ff', borderColor: '#a855f7', color: '#7e22ce' };
    };

    return (
        <div className="bg-white">
            {/* Header & Actions */}
            <div className="flex justify-between items-center mb-4 print:hidden">
                <div>
                    <h2 className="text-sm font-bold text-gray-800">Horario Semanal - Sección A</h2>
                    <p className="text-xs text-gray-500">1er Año • Tutor: Ana Pérez</p>
                </div>
                <button
                    onClick={handlePrint}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors border border-indigo-200"
                >
                    <Printer size={14} />
                    Imprimir Horario
                </button>
            </div>

            {/* Schedule Grid */}
            <div className="overflow-x-auto">
                <div className="min-w-[700px]">
                    {/* Header Row */}
                    <div className="grid grid-cols-6 border-b-2 border-gray-300">
                        <div className="p-2 text-xs font-bold text-gray-500 uppercase text-center bg-gray-50">
                            HORA
                        </div>
                        {DAYS.map(day => (
                            <div key={day.key} className="p-2 text-xs font-bold text-gray-700 uppercase text-center bg-gray-50">
                                {day.label}
                            </div>
                        ))}
                    </div>

                    {/* Time Rows */}
                    {TIME_SLOTS.map((time) => (
                        <div key={time} className="grid grid-cols-6 border-b border-gray-200 min-h-[60px]">
                            {/* Time Label */}
                            <div className="p-2 text-xs font-semibold text-gray-600 text-center border-r border-gray-200 bg-gray-50/50 flex items-center justify-center">
                                {time}
                            </div>

                            {/* Days Columns */}
                            {DAYS.map(day => {
                                const block = schedule.find(s => s.day === day.key && s.startTime === time);
                                const colors = block ? getBlockColor(block) : null;

                                return (
                                    <div key={`${day.key}-${time}`} className="p-1 relative border-r border-gray-200 last:border-0 h-full">
                                        {block ? (
                                            block.link ? (
                                                <Link href={block.link} className="block h-full">
                                                    <div
                                                        className="h-full w-full rounded-md p-2 border text-xs flex flex-col justify-center gap-0.5 hover:ring-2 hover:ring-indigo-400 transition-all cursor-pointer"
                                                        style={{
                                                            backgroundColor: colors?.backgroundColor,
                                                            borderColor: colors?.borderColor,
                                                            color: colors?.color
                                                        }}
                                                    >
                                                        <div className="font-bold text-xs leading-tight">{block.subject}</div>
                                                        {block.location && (
                                                            <div className="text-[10px] opacity-75">{block.location}</div>
                                                        )}
                                                        {block.detail && (
                                                            <div className="text-[10px] opacity-70">{block.detail}</div>
                                                        )}
                                                    </div>
                                                </Link>
                                            ) : (
                                                <div
                                                    className="h-full w-full rounded-md p-2 border text-xs flex flex-col justify-center gap-0.5"
                                                    style={{
                                                        backgroundColor: colors?.backgroundColor,
                                                        borderColor: colors?.borderColor,
                                                        color: colors?.color
                                                    }}
                                                >
                                                    <div className="font-bold text-xs leading-tight">{block.subject}</div>
                                                    {block.location && (
                                                        <div className="text-[10px] opacity-75">{block.location}</div>
                                                    )}
                                                    {block.detail && (
                                                        <div className="text-[10px] opacity-70">{block.detail}</div>
                                                    )}
                                                </div>
                                            )
                                        ) : time === "10:00" ? (
                                            <div className="h-full flex items-center justify-center">
                                                <span className="text-[10px] text-gray-400 font-medium">RECREO</span>
                                            </div>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>

            {/* Footer */}
            <div className="mt-3 p-2 bg-gray-50 rounded text-[10px] text-center text-gray-400 print:hidden">
                Horario sujeto a cambios por la coordinación académica.
            </div>
        </div>
    );
}
