'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Check, X, Clock, ShieldCheck, ChevronDown } from 'lucide-react';

export type AttendanceStatusType = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

interface AttendanceDef {
    value: AttendanceStatusType;
    label: string;
    shortLabel: string;
    icon: React.ElementType;
    badgeBg: string;
    badgeText: string;
    badgeBorder: string;
    btnActive: string;
    btnHover: string;
    dotColor: string;
}

export const ATTENDANCE_CONFIG: Record<AttendanceStatusType, AttendanceDef> = {
    PRESENT: {
        value: 'PRESENT',
        label: 'Presente',
        shortLabel: 'Pres.',
        icon: Check,
        badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
        badgeText: 'text-emerald-700',
        badgeBorder: 'border-emerald-200',
        btnActive: 'bg-emerald-500 text-white shadow-sm ring-2 ring-emerald-300',
        btnHover: 'hover:bg-emerald-50 hover:text-emerald-600',
        dotColor: 'bg-emerald-500',
    },
    ABSENT: {
        value: 'ABSENT',
        label: 'Ausente',
        shortLabel: 'Aus.',
        icon: X,
        badgeBg: 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100',
        badgeText: 'text-rose-700',
        badgeBorder: 'border-rose-200',
        btnActive: 'bg-rose-500 text-white shadow-sm ring-2 ring-rose-300',
        btnHover: 'hover:bg-rose-50 hover:text-rose-600',
        dotColor: 'bg-rose-500',
    },
    LATE: {
        value: 'LATE',
        label: 'Tardanza',
        shortLabel: 'Tard.',
        icon: Clock,
        badgeBg: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
        badgeText: 'text-amber-700',
        badgeBorder: 'border-amber-200',
        btnActive: 'bg-amber-500 text-white shadow-sm ring-2 ring-amber-300',
        btnHover: 'hover:bg-amber-50 hover:text-amber-600',
        dotColor: 'bg-amber-500',
    },
    EXCUSED: {
        value: 'EXCUSED',
        label: 'Justificado',
        shortLabel: 'Just.',
        icon: ShieldCheck,
        badgeBg: 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100',
        badgeText: 'text-sky-700',
        badgeBorder: 'border-sky-200',
        btnActive: 'bg-sky-500 text-white shadow-sm ring-2 ring-sky-300',
        btnHover: 'hover:bg-sky-50 hover:text-sky-600',
        dotColor: 'bg-sky-500',
    },
};

const STATUS_LIST: AttendanceStatusType[] = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'];

interface Props {
    status: AttendanceStatusType | string;
    onChange: (status: AttendanceStatusType) => void;
    disabled?: boolean;
}

export default function AnimatedAttendancePicker({ status, onChange, disabled = false }: Props) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const currentKey = (STATUS_LIST.includes(status as AttendanceStatusType) ? status : 'PRESENT') as AttendanceStatusType;
    const currentDef = ATTENDANCE_CONFIG[currentKey];
    const Icon = currentDef.icon;

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    const handleSelect = (s: AttendanceStatusType) => {
        onChange(s);
        setIsOpen(false);
    };

    return (
        <div ref={containerRef} className="relative inline-flex items-center">
            {!isOpen ? (
                /* Botón individual colapsado */
                <button
                    type="button"
                    disabled={disabled}
                    onClick={() => !disabled && setIsOpen(true)}
                    className={`group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold shadow-xs transition-all duration-150 active:scale-95 ${currentDef.badgeBg} ${
                        disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                    }`}
                    title={`Cambiar asistencia (actual: ${currentDef.label})`}
                >
                    <span className={`w-2 h-2 rounded-full ${currentDef.dotColor}`} />
                    <Icon className="w-3.5 h-3.5" />
                    <span>{currentDef.label}</span>
                    <ChevronDown className="w-3 h-3 text-current opacity-60 group-hover:opacity-100 transition-opacity ml-0.5" />
                </button>
            ) : (
                /* Barra expandida de opciones con animación */
                <div className="inline-flex items-center gap-1 p-1 bg-white border border-gray-200 rounded-full shadow-lg z-20 animate-in fade-in zoom-in-95 duration-150">
                    {STATUS_LIST.map((key) => {
                        const def = ATTENDANCE_CONFIG[key];
                        const ItemIcon = def.icon;
                        const isSelected = key === currentKey;
                        return (
                            <button
                                key={key}
                                type="button"
                                onClick={() => handleSelect(key)}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-150 ${
                                    isSelected
                                        ? def.btnActive
                                        : `text-gray-600 ${def.btnHover} hover:scale-105`
                                }`}
                                title={def.label}
                            >
                                <ItemIcon className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">{def.label}</span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
