'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, X, Building2, Layers, LayoutGrid, AlertTriangle } from 'lucide-react';
import { usePreviewEvent, EventScope, EventDay, ClassInSlot } from '@/hooks/useSchoolEvents';
import type { Period } from '@/utils/schedule.utils';

/**
 * Ventana para crear un evento sobre un bloque de un día.
 *
 * El número "se suspenderán N clases" lo calcula el servidor con la misma
 * función que la suspensión real (POST /events/preview), no el cliente: así no
 * puede prometer una cosa y hacer otra.
 */

interface EventModalProps {
    open: boolean;
    day: EventDay;
    /** Bloque sobre el que se hizo clic: marca el inicio del evento. */
    startPeriod: Period | null;
    classPeriods: Period[];
    isSaving: boolean;
    onClose: () => void;
    onCreate: (payload: {
        title: string;
        description: string;
        startTime: string;
        endTime: string;
        scope: EventScope;
        grades: number[];
        classroomIds: string[];
    }) => void;
}

const SCOPES: Array<{ id: EventScope; label: string; hint: string; icon: React.ElementType }> = [
    { id: 'INSTITUTE', label: 'Todo el liceo', hint: 'Todas las secciones', icon: Building2 },
    { id: 'GRADES', label: 'Años', hint: 'Uno o varios años', icon: Layers },
    { id: 'CLASSROOMS', label: 'Secciones', hint: 'Secciones concretas', icon: LayoutGrid },
];

const gradeLabel = (g: number) => `${g}° año`;

export default function EventModal({
    open,
    day,
    startPeriod,
    classPeriods,
    isSaving,
    onClose,
    onCreate,
}: EventModalProps) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [endTime, setEndTime] = useState('');
    const [scope, setScope] = useState<EventScope>('INSTITUTE');
    const [grades, setGrades] = useState<number[]>([]);
    const [classroomIds, setClassroomIds] = useState<string[]>([]);
    const preview = usePreviewEvent();

    // Reiniciar al abrir sobre otro bloque
    useEffect(() => {
        if (!open || !startPeriod) return;
        setTitle('');
        setDescription('');
        setEndTime(startPeriod.endTime);
        setScope('INSTITUTE');
        setGrades([]);
        setClassroomIds([]);
    }, [open, startPeriod]);

    /** Bloques desde el pulsado en adelante: define hasta dónde llega el evento. */
    const endOptions = useMemo(
        () => (startPeriod ? classPeriods.filter((p) => p.startTime >= startPeriod.startTime) : []),
        [classPeriods, startPeriod]
    );

    const availableGrades = useMemo(
        () => Array.from(new Set(day.classrooms.map((c) => c.grade))).sort((a, b) => a - b),
        [day.classrooms]
    );

    const scopeIncomplete =
        (scope === 'GRADES' && grades.length === 0) || (scope === 'CLASSROOMS' && classroomIds.length === 0);

    // Vista previa: cada cambio de franja o alcance vuelve a preguntar al servidor
    useEffect(() => {
        if (!open || !startPeriod || !endTime || scopeIncomplete) return;
        const t = setTimeout(() => {
            preview.mutate({
                date: day.date,
                startTime: startPeriod.startTime,
                endTime,
                scope,
                grades,
                classroomIds,
            });
        }, 250);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, startPeriod, endTime, scope, grades, classroomIds, day.date, scopeIncomplete]);

    if (!open || !startPeriod) return null;

    const toggle = <T,>(list: T[], value: T) =>
        list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

    const previewClasses: ClassInSlot[] = scopeIncomplete ? [] : preview.data?.classes ?? [];
    const canCreate = title.trim().length > 0 && !scopeIncomplete && !isSaving;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => (!isSaving ? onClose() : undefined)} />

            <div className="relative w-full max-w-lg max-h-[90vh] flex flex-col bg-white rounded-2xl shadow-xl border border-gray-100">
                <div className="flex items-start justify-between p-5 border-b border-gray-100">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">Nuevo evento</h2>
                        <p className="text-xs text-gray-500 mt-0.5 capitalize">
                            {new Intl.DateTimeFormat('es-ES', {
                                weekday: 'long',
                                day: 'numeric',
                                month: 'long',
                            }).format(new Date(`${day.date}T12:00:00`))}{' '}
                            · desde {startPeriod.startTime}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSaving}
                        className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer disabled:opacity-50"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="p-5 space-y-4 overflow-y-auto">
                    <div>
                        <label htmlFor="ev-title" className="block text-sm font-medium text-gray-700 mb-1.5">
                            Título
                        </label>
                        <input
                            id="ev-title"
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            maxLength={150}
                            autoFocus
                            placeholder="Acto cívico, reunión de representantes…"
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                    </div>

                    <div>
                        <label htmlFor="ev-desc" className="block text-sm font-medium text-gray-700 mb-1.5">
                            Descripción <span className="text-gray-400 font-normal">(opcional)</span>
                        </label>
                        <textarea
                            id="ev-desc"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={2}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                    </div>

                    <div>
                        <label htmlFor="ev-end" className="block text-sm font-medium text-gray-700 mb-1.5">
                            Hasta
                        </label>
                        <select
                            id="ev-end"
                            value={endTime}
                            onChange={(e) => setEndTime(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            {endOptions.map((p) => (
                                <option key={p.id} value={p.endTime}>
                                    Fin de {p.label} ({p.endTime})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <span className="block text-sm font-medium text-gray-700 mb-1.5">¿A quién afecta?</span>
                        <div className="grid grid-cols-3 gap-2">
                            {SCOPES.map((s) => {
                                const Icon = s.icon;
                                const active = scope === s.id;
                                return (
                                    <button
                                        key={s.id}
                                        type="button"
                                        onClick={() => setScope(s.id)}
                                        className={`flex flex-col items-center gap-1 p-3 rounded-xl border text-center transition-colors cursor-pointer ${
                                            active
                                                ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                                                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                                        }`}
                                    >
                                        <Icon size={18} />
                                        <span className="text-xs font-bold">{s.label}</span>
                                        <span className="text-[10px] text-gray-500">{s.hint}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {scope === 'GRADES' && (
                        <div className="flex flex-wrap gap-2">
                            {availableGrades.map((g) => (
                                <button
                                    key={g}
                                    type="button"
                                    onClick={() => setGrades((prev) => toggle(prev, g))}
                                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
                                        grades.includes(g)
                                            ? 'bg-indigo-600 text-white border-indigo-600'
                                            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                    }`}
                                >
                                    {gradeLabel(g)}
                                </button>
                            ))}
                        </div>
                    )}

                    {scope === 'CLASSROOMS' && (
                        <div className="max-h-44 overflow-y-auto border border-gray-100 rounded-lg p-2 space-y-2">
                            {availableGrades.map((g) => (
                                <div key={g}>
                                    <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">
                                        {gradeLabel(g)}
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {day.classrooms
                                            .filter((c) => c.grade === g)
                                            .map((c) => (
                                                <button
                                                    key={c.id}
                                                    type="button"
                                                    onClick={() => setClassroomIds((prev) => toggle(prev, c.id))}
                                                    className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
                                                        classroomIds.includes(c.id)
                                                            ? 'bg-indigo-600 text-white border-indigo-600'
                                                            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                                    }`}
                                                >
                                                    {c.name}
                                                </button>
                                            ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                        <div className="flex items-center gap-2 text-amber-800 text-xs font-bold">
                            <AlertTriangle size={14} />
                            {scopeIncomplete
                                ? scope === 'GRADES'
                                    ? 'Selecciona al menos un año'
                                    : 'Selecciona al menos una sección'
                                : preview.isPending
                                    ? 'Calculando…'
                                    : `Se suspenderán ${previewClasses.length} ${previewClasses.length === 1 ? 'clase' : 'clases'}`}
                        </div>
                        {!scopeIncomplete && previewClasses.length > 0 && (
                            <ul className="mt-2 max-h-28 overflow-y-auto space-y-0.5">
                                {previewClasses.map((c) => (
                                    <li key={c.blockId} className="text-[11px] text-amber-900">
                                        {c.startTime} · <strong>{c.classroomName}</strong> · {c.subjectName}
                                        {c.teacherName ? ` · ${c.teacherName}` : ''}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>

                <div className="flex items-center justify-end gap-2 p-5 border-t border-gray-100">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSaving}
                        className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        disabled={!canCreate}
                        onClick={() =>
                            onCreate({
                                title: title.trim(),
                                description: description.trim(),
                                startTime: startPeriod.startTime,
                                endTime,
                                scope,
                                grades,
                                classroomIds,
                            })
                        }
                        className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                            canCreate
                                ? 'bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer'
                                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        }`}
                    >
                        {isSaving && <Loader2 size={16} className="animate-spin" />}
                        Crear evento
                    </button>
                </div>
            </div>
        </div>
    );
}
