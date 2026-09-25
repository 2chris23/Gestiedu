'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { DndContext, useDraggable, useDroppable, DragEndEvent, DragOverlay } from '@dnd-kit/core';
import {
    useBulkUpdateTeacherSchedule,
    useAutoFillTeacherSchedule,
    usePersonalBlockMutations,
} from '@/hooks/useSchedules';
import { useSchedulePeriods } from '@/hooks/useSchedulePeriods';
import { useConfirm } from '@/hooks/useConfirm';
import { toast } from 'sonner';
import { Loader2, Save, X, Coffee, AlertCircle, Shuffle, Plus, UserCog } from 'lucide-react';
import PersonalBlockModal, { PersonalBlockDraft } from './PersonalBlockModal';

/**
 * Editor del horario de UN profesor.
 *
 * FUENTE ÚNICA: los bloques de clase son los mismos `ScheduleBlock` del horario
 * de la sección. La barra lateral lista las asignaciones del profesor
 * (`ClassroomSubject`: sección + materia + bloques semanales) igual que el
 * editor de sección lista las materias de esa sección.
 *
 * La cuadrícula muestra además las HORAS PERSONALES del profesor, que viven en
 * la misma tabla con `blockType: 'PERSONAL'`. Por eso una clase no puede
 * colocarse encima de una hora personal ni al revés: para el detector de
 * choques ambas ocupan al profesor.
 *
 * Dos ritmos de guardado, a propósito:
 *   - las clases se guardan en lote con "Guardar Cambios" (es un horario, se
 *     reacomoda entero antes de confirmar);
 *   - las horas personales se guardan al momento, porque son registros sueltos
 *     y mezclarlas en el lote solo daría estados a medio guardar.
 *
 * CELDAS CON MÁS DE UN BLOQUE. En un horario limpio no pueden existir (el
 * profesor estaría en dos sitios a la vez), pero hay datos heredados que sí las
 * tienen. Antes se dibujaba solo el primero y el otro quedaba invisible, así
 * que no había forma de ver ni arreglar el choque. Ahora se apilan, en rojo, y
 * cada uno se puede arrastrar por separado para resolverlo.
 */

interface TeacherScheduleEditorProps {
    teacherId: string;
    initialBlocks: any[];
    assignments: any[];
}

import HorarioPorDias from '@/components/schedule/HorarioPorDias';

const DAYS = [
    { id: 1, label: 'Lunes' },
    { id: 2, label: 'Martes' },
    { id: 3, label: 'Miércoles' },
    { id: 4, label: 'Jueves' },
    { id: 5, label: 'Viernes' },
];

const dayLabelOf = (day: number) => DAYS.find((d) => d.id === day)?.label ?? `Día ${day}`;

interface EditorBlock {
    id: string;
    cellId: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    /** Línea superior: la sección en una clase, el título en una hora personal. */
    primaryLabel: string;
    /** Línea inferior: la materia en una clase, la descripción en una personal. */
    secondaryLabel: string;
    color: string;
    isPersonal: boolean;
    classroomSubjectId?: string;
    notes?: string;
}

const isTemp = (id: string) => id.startsWith('temp-');

function BlockCard({
    block,
    dragging = false,
    hasConflict = false,
    compact = false,
}: {
    block: EditorBlock;
    dragging?: boolean;
    hasConflict?: boolean;
    /** Celda compartida con otro bloque: se muestra en media altura. */
    compact?: boolean;
}) {
    const background = hasConflict
        ? '#fee2e2'
        : block.isPersonal
            ? '#f1f5f9'
            : block.color
                ? `${block.color}20`
                : '#f3f4f6';
    const accent = hasConflict ? '#ef4444' : block.isPersonal ? '#64748b' : block.color || '#6366f1';

    return (
        <div
            className={`relative h-full w-full rounded-md shadow-sm text-[10px] flex flex-col justify-center overflow-hidden ${
                compact ? 'px-1.5 py-0.5' : 'p-1.5'
            } ${dragging ? 'opacity-90 ring-2 ring-indigo-400' : ''} ${
                hasConflict ? 'ring-2 ring-red-500 ring-offset-1' : ''
            } ${block.isPersonal && !hasConflict ? 'border border-dashed border-slate-300' : ''}`}
            style={{ backgroundColor: background, borderLeft: `3px solid ${accent}` }}
        >
            {hasConflict && !compact && (
                <AlertCircle size={11} className="absolute top-1 right-1 text-red-600 pointer-events-none" />
            )}
            {block.isPersonal && !hasConflict && (
                <UserCog size={10} className="absolute top-1 right-1 text-slate-400 pointer-events-none" />
            )}

            <div
                className={`font-bold line-clamp-1 pointer-events-none ${
                    hasConflict ? 'text-red-900' : block.isPersonal ? 'text-slate-700' : 'text-gray-900'
                }`}
            >
                {block.primaryLabel}
            </div>
            {/* En media altura solo cabe una línea: se prioriza la sección. */}
            {!compact && (
                <div
                    className={`line-clamp-1 pointer-events-none ${
                        hasConflict ? 'text-red-700' : block.isPersonal ? 'text-slate-500 italic' : 'text-gray-600'
                    }`}
                >
                    {block.secondaryLabel}
                </div>
            )}
        </div>
    );
}

/** Asignación arrastrable de la barra lateral. */
function DraggableAssignment({ assignment }: { assignment: any }) {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `assignment-${assignment.id}`,
        data: { type: 'sidebar-assignment', assignment },
    });

    return (
        <div
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            className={`p-2 rounded-md shadow-sm text-xs cursor-grab active:cursor-grabbing border ${isDragging ? 'opacity-50' : 'opacity-100'}`}
            style={{
                backgroundColor: assignment.subject?.color ? `${assignment.subject.color}20` : '#f3f4f6',
                borderColor: assignment.subject?.color || '#e5e7eb',
                color: '#1f2937',
            }}
        >
            <div className="font-bold line-clamp-1">{assignment.classroom?.name || 'Sin sección'}</div>
            <div className="text-[11px] text-gray-600 line-clamp-1">{assignment.subject?.name || 'Materia'}</div>
        </div>
    );
}

function DraggableBlock({
    block,
    onRemove,
    onEdit,
    hasConflict,
    stackIndex = 0,
    stackSize = 1,
}: {
    block: EditorBlock;
    onRemove: () => void;
    onEdit: () => void;
    hasConflict?: boolean;
    stackIndex?: number;
    stackSize?: number;
}) {
    // El id es el del BLOQUE, no el de la celda: si dos bloques comparten celda,
    // con el id de la celda se pisarían y solo uno sería arrastrable.
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `grid-${block.id}`,
        data: { type: 'grid-block', block },
    });

    const stacked = stackSize > 1;
    const position: React.CSSProperties = stacked
        ? {
            top: `calc(${(100 / stackSize) * stackIndex}% + 2px)`,
            height: `calc(${100 / stackSize}% - 4px)`,
        }
        : {};

    return (
        <div
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            onClick={block.isPersonal ? onEdit : undefined}
            className={`${stacked ? 'absolute left-1 right-1' : 'absolute inset-1'} group cursor-grab active:cursor-grabbing ${
                isDragging ? 'opacity-40' : ''
            }`}
            style={{ zIndex: isDragging ? 10 : 1, ...position }}
        >
            <BlockCard block={block} hasConflict={hasConflict} compact={stacked} />
            {!block.isPersonal && (
                <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                        e.stopPropagation();
                        onRemove();
                    }}
                    title="Quitar del horario"
                    className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 text-red-500 hover:bg-red-100 p-0.5 rounded transition-opacity z-20 cursor-pointer"
                >
                    <X size={12} />
                </button>
            )}
        </div>
    );
}

function DroppableCell({
    id,
    cellBlocks,
    onRemove,
    onEdit,
    onCreatePersonal,
    hasConflict,
}: {
    id: string;
    cellBlocks: EditorBlock[];
    onRemove: (block: EditorBlock) => void;
    onEdit: (block: EditorBlock) => void;
    onCreatePersonal: () => void;
    hasConflict?: boolean;
}) {
    const { isOver, setNodeRef } = useDroppable({ id });
    // Dos o más bloques en la misma celda son, por definición, un choque.
    const shared = cellBlocks.length > 1;

    return (
        <div
            ref={setNodeRef}
            className={`relative h-16 transition-colors group/cell ${isOver ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-300' : ''}`}
            title={shared ? 'Choque: el profesor está en dos sitios a la vez. Arrastra uno de los bloques a otra hora.' : undefined}
        >
            {cellBlocks.length > 0 ? (
                cellBlocks.map((b, i) => (
                    <DraggableBlock
                        key={b.id}
                        block={b}
                        stackIndex={i}
                        stackSize={cellBlocks.length}
                        onRemove={() => onRemove(b)}
                        onEdit={() => onEdit(b)}
                        hasConflict={hasConflict || shared}
                    />
                ))
            ) : (
                <button
                    type="button"
                    onClick={onCreatePersonal}
                    title="Reservar esta hora para el profesor"
                    className="absolute inset-1 flex items-center justify-center rounded-md opacity-0 group-hover/cell:opacity-100 text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all cursor-pointer"
                >
                    <Plus size={14} />
                </button>
            )}
        </div>
    );
}

export default function TeacherScheduleEditor({
    teacherId,
    initialBlocks,
    assignments,
}: TeacherScheduleEditorProps) {
    const [blocks, setBlocks] = useState<EditorBlock[]>([]);
    const [deletedIds, setDeletedIds] = useState<string[]>([]);
    const [isDirty, setIsDirty] = useState(false);
    const [activeDragData, setActiveDragData] = useState<any>(null);
    const [conflicts, setConflicts] = useState<any[]>([]);

    const [modalDraft, setModalDraft] = useState<PersonalBlockDraft | null>(null);
    const [modalConflicts, setModalConflicts] = useState<any[]>([]);

    const confirmDialog = useConfirm();
    const bulkUpdate = useBulkUpdateTeacherSchedule(teacherId);
    const autoFill = useAutoFillTeacherSchedule(teacherId);
    const personal = usePersonalBlockMutations(teacherId);
    const { periods: dynamicPeriods, isLoading } = useSchedulePeriods();

    useEffect(() => {
        if (!initialBlocks || !Array.isArray(initialBlocks)) return;

        setBlocks(
            initialBlocks.map((b: any) => {
                const isPersonal = b.blockType === 'PERSONAL';
                return {
                    id: b.id,
                    cellId: `${b.dayOfWeek}-${b.startTime}`,
                    dayOfWeek: b.dayOfWeek,
                    startTime: b.startTime,
                    endTime: b.endTime,
                    isPersonal,
                    classroomSubjectId: b.classroomSubject?.id || b.classroomSubjectId,
                    notes: b.notes || '',
                    // En una clase manda la sección; en una hora personal, su título.
                    primaryLabel: isPersonal
                        ? b.title || 'Hora personal'
                        : b.classroomSubject?.classroom?.name || 'Sin sección',
                    secondaryLabel: isPersonal
                        ? b.notes || 'Sin descripción'
                        : b.classroomSubject?.subject?.name || 'Materia',
                    color: isPersonal ? '#64748b' : b.classroomSubject?.subject?.color || '#6366f1',
                };
            })
        );
        setDeletedIds([]);
        setConflicts([]);
        setIsDirty(false);
    }, [initialBlocks]);

    /** Bloques que faltan por colocar de cada asignación — igual que en secciones. */
    const assignmentsWithRemaining = useMemo(() => {
        return (assignments || []).map((a: any) => {
            const used = blocks.filter((b) => !b.isPersonal && b.classroomSubjectId === a.id).length;
            const total = a.weeklyBlocks || 0;
            return { ...a, used, remaining: total - used };
        });
    }, [assignments, blocks]);

    const pending = assignmentsWithRemaining.filter((a) => a.remaining > 0);
    const totalRemaining = pending.reduce((sum, a) => sum + a.remaining, 0);
    const personalCount = blocks.filter((b) => b.isPersonal).length;

    /** Celdas con más de un bloque: choques heredados, visibles de entrada. */
    const sharedCellCount = useMemo(() => {
        const perCell = new Map<string, number>();
        for (const b of blocks) perCell.set(b.cellId, (perCell.get(b.cellId) ?? 0) + 1);
        return Array.from(perCell.values()).filter((n) => n > 1).length;
    }, [blocks]);

    /**
     * Celdas que el servidor señaló como conflictivas. El conflicto trae el día
     * y la hora del bloque que se intentó colocar, que es exactamente el id de
     * celda de la cuadrícula.
     */
    const conflictCells = useMemo(
        () => new Set(conflicts.map((c: any) => `${c.dayOfWeek}-${c.startTime}`)),
        [conflicts]
    );

    const handleDragEnd = async (event: DragEndEvent) => {
        setActiveDragData(null);
        const { over, active } = event;
        if (!over) return;

        const cellId = over.id as string;
        const [dayStr, startTime] = cellId.split('-');
        const dayOfWeek = parseInt(dayStr, 10);

        const period = dynamicPeriods.find((p) => p.startTime === startTime);
        if (!period || period.type === 'break') return;

        const dragType = active.data.current?.type;

        if (dragType === 'sidebar-assignment') {
            const assignment = active.data.current?.assignment;
            if (!assignment) return;

            const current = assignmentsWithRemaining.find((a) => a.id === assignment.id);
            if (current && current.remaining <= 0) {
                toast.error(
                    `${assignment.subject?.name} en ${assignment.classroom?.name} ya tiene todos sus bloques colocados`
                );
                return;
            }

            const occupied = blocks.find((b) => b.cellId === cellId);
            if (occupied?.isPersonal) {
                toast.error(`Esa hora está reservada: ${occupied.primaryLabel}`);
                return;
            }

            setBlocks((prev) => {
                const next = [...prev];
                const occupiedIndex = next.findIndex((b) => b.cellId === cellId);
                if (occupiedIndex >= 0) {
                    const replaced = next[occupiedIndex];
                    if (!isTemp(replaced.id)) {
                        setDeletedIds((d) => [...d, replaced.id]);
                    }
                    next.splice(occupiedIndex, 1);
                }
                next.push({
                    id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                    cellId,
                    dayOfWeek,
                    startTime,
                    endTime: period.endTime,
                    isPersonal: false,
                    classroomSubjectId: assignment.id,
                    primaryLabel: assignment.classroom?.name || 'Sin sección',
                    secondaryLabel: assignment.subject?.name || 'Materia',
                    color: assignment.subject?.color || '#6366f1',
                });
                return next;
            });
            setConflicts([]);
            setIsDirty(true);
            return;
        }

        if (dragType === 'grid-block') {
            const source: EditorBlock | undefined = active.data.current?.block;
            if (!source || source.cellId === cellId) return;

            const target = blocks.find((b) => b.cellId === cellId);

            // Las horas personales se guardan al momento, así que su movimiento
            // se persiste ya — y solo si la celda destino está libre, porque no
            // hay lote donde deshacer un intercambio a medias.
            if (source.isPersonal || target?.isPersonal) {
                if (target) {
                    toast.error('Mueve primero el bloque que ocupa esa hora');
                    return;
                }
                try {
                    await personal.update.mutateAsync({
                        id: source.id,
                        dayOfWeek,
                        startTime,
                        endTime: period.endTime,
                    });
                    toast.success('Hora personal movida');
                } catch (error: any) {
                    const data = error?.response?.data;
                    if (data?.code === 'SCHEDULE_CONFLICT') {
                        setConflicts(data.conflicts || []);
                        toast.error('Esa hora ya está ocupada');
                        return;
                    }
                    toast.error(data?.error || 'No se pudo mover la hora personal');
                }
                return;
            }

            // Celda ocupada por otra clase: se intercambian.
            setBlocks((prev) =>
                prev.map((b) => {
                    if (b.id === source.id) {
                        return { ...b, cellId, dayOfWeek, startTime, endTime: period.endTime };
                    }
                    if (target && b.id === target.id) {
                        return {
                            ...b,
                            cellId: source.cellId,
                            dayOfWeek: source.dayOfWeek,
                            startTime: source.startTime,
                            endTime: source.endTime,
                        };
                    }
                    return b;
                })
            );
            setConflicts([]);
            setIsDirty(true);
        }
    };

    const handleRemoveBlock = async (blockId: string) => {
        const block = blocks.find((b) => b.id === blockId);
        if (!block || block.isPersonal) return;

        if (!isTemp(block.id)) {
            const ok = await confirmDialog({
                title: 'Quitar bloque del horario',
                description: `Se quitará ${block.secondaryLabel} de ${block.primaryLabel}. También desaparece del horario de esa sección, porque es el mismo bloque.`,
                confirmLabel: 'Quitar',
            });
            if (!ok) return;
            setDeletedIds((prev) => [...prev, block.id]);
        }

        setBlocks((prev) => prev.filter((b) => b.id !== block.id));
        setConflicts([]);
        setIsDirty(true);
    };

    const openCreatePersonal = (dayOfWeek: number, startTime: string, endTime: string) => {
        setModalConflicts([]);
        setModalDraft({ dayOfWeek, startTime, endTime, title: '', notes: '' });
    };

    const openEditPersonal = (block: EditorBlock) => {
        setModalConflicts([]);
        setModalDraft({
            id: block.id,
            dayOfWeek: block.dayOfWeek,
            startTime: block.startTime,
            endTime: block.endTime,
            title: block.primaryLabel,
            notes: block.notes || '',
        });
    };

    const handleSavePersonal = async (draft: PersonalBlockDraft) => {
        setModalConflicts([]);
        try {
            if (draft.id) {
                await personal.update.mutateAsync({
                    id: draft.id,
                    dayOfWeek: draft.dayOfWeek,
                    startTime: draft.startTime,
                    endTime: draft.endTime,
                    title: draft.title,
                    notes: draft.notes,
                });
                toast.success('Hora personal actualizada');
            } else {
                await personal.create.mutateAsync({
                    dayOfWeek: draft.dayOfWeek,
                    startTime: draft.startTime,
                    endTime: draft.endTime,
                    title: draft.title,
                    notes: draft.notes,
                });
                toast.success('Hora personal creada');
            }
            setModalDraft(null);
        } catch (error: any) {
            const data = error?.response?.data;
            if (data?.code === 'SCHEDULE_CONFLICT' && Array.isArray(data.conflicts)) {
                setModalConflicts(data.conflicts);
                return;
            }
            toast.error(data?.error || 'No se pudo guardar la hora personal');
        }
    };

    const handleDeletePersonal = async (id: string) => {
        const ok = await confirmDialog({
            title: 'Eliminar hora personal',
            description: 'Se liberará esa hora en el horario del profesor.',
            confirmLabel: 'Eliminar',
        });
        if (!ok) return;

        try {
            await personal.remove.mutateAsync(id);
            setModalDraft(null);
            toast.success('Hora personal eliminada');
        } catch (error: any) {
            toast.error(error?.response?.data?.error || 'No se pudo eliminar');
        }
    };

    const handleAutoFill = async () => {
        if (isDirty) {
            const ok = await confirmDialog({
                title: 'Hay cambios sin guardar',
                description:
                    'Colocar al azar trabaja sobre el horario guardado, así que se perderán los cambios que no hayas guardado. ¿Continuar?',
                confirmLabel: 'Continuar',
            });
            if (!ok) return;
        }

        const ok = await confirmDialog({
            title: 'Colocar al azar los bloques pendientes',
            description: `Se repartirán los ${totalRemaining} bloques que faltan en huecos libres. Los que ya están colocados y las horas personales no se tocan, y como estas clases son de otras secciones, también aparecerán en el horario de cada una.`,
            confirmLabel: 'Colocar',
        });
        if (!ok) return;

        try {
            const res = await autoFill.mutateAsync({
                periods: dynamicPeriods
                    .filter((p) => p.type !== 'break')
                    .map((p) => ({ startTime: p.startTime, endTime: p.endTime })),
                days: DAYS.map((d) => d.id),
            });

            if (res.unplaced?.length > 0) {
                toast.warning(
                    `Se colocaron ${res.placed} bloques. Quedaron ${res.unplaced.length} sin sitio: ${res.unplaced
                        .slice(0, 3)
                        .map((u: any) => `${u.subject} en ${u.classroom}`)
                        .join(', ')}${res.unplaced.length > 3 ? '…' : ''}`
                );
            } else {
                toast.success(`Se colocaron ${res.placed} bloques al azar`);
            }
            setConflicts([]);
            setIsDirty(false);
        } catch (error: any) {
            toast.error(error?.response?.data?.error || 'No se pudieron colocar los bloques');
        }
    };

    const handleSave = async () => {
        const payloadBlocks = blocks
            .filter((b) => !b.isPersonal)
            .map((b) => ({
                ...(isTemp(b.id) ? {} : { id: b.id }),
                classroomSubjectId: b.classroomSubjectId as string,
                dayOfWeek: b.dayOfWeek,
                startTime: b.startTime,
                endTime: b.endTime,
            }));

        try {
            const res = await bulkUpdate.mutateAsync({ blocks: payloadBlocks, deleteIds: deletedIds });
            setDeletedIds([]);
            setConflicts([]);
            setIsDirty(false);
            // Los choques heredados ya no bloquean: se guardó, pero se avisa.
            if (res?.warnings?.length) {
                toast.warning(
                    `Horario guardado. Quedan ${res.warnings.length} ${res.warnings.length === 1 ? 'choque heredado' : 'choques heredados'}: ${res.warnings[0]}`
                );
            } else {
                toast.success('Horario del profesor actualizado');
            }
        } catch (error: any) {
            const data = error?.response?.data;
            if (data?.code === 'SCHEDULE_CONFLICT' && Array.isArray(data.conflicts)) {
                setConflicts(data.conflicts);
                toast.error('El horario tiene choques y no se guardó');
                return;
            }
            toast.error(data?.error || 'No se pudo guardar el horario');
        }
    };

    return (
        <>
            <DndContext onDragStart={(e) => setActiveDragData(e.active.data.current)} onDragEnd={handleDragEnd}>
                <div className="flex flex-col lg:flex-row gap-6">
                    {/* Barra lateral: asignaciones arrastrables con bloques restantes */}
                    <div className="w-full lg:w-64 shrink-0">
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sticky top-6">
                            <h3 className="font-bold text-gray-800 mb-4 flex items-center justify-between">
                                <span>Por colocar</span>
                                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                                    {totalRemaining}
                                </span>
                            </h3>

                            <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-2">
                                {pending.length > 0 ? (
                                    pending.map((assignment) => (
                                        <div key={assignment.id} className="flex flex-col gap-1">
                                            <div className="flex justify-between items-center text-xs px-1 text-gray-500">
                                                <span>Restantes:</span>
                                                <span className="font-bold text-amber-600">
                                                    {assignment.remaining} / {assignment.weeklyBlocks || 0}
                                                </span>
                                            </div>
                                            <DraggableAssignment assignment={assignment} />
                                        </div>
                                    ))
                                ) : (
                                    <div className="py-6 text-center text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                                        <p className="text-sm italic">
                                            {assignmentsWithRemaining.length === 0
                                                ? 'Este profesor no tiene materias asignadas'
                                                : 'Todos los bloques están colocados'}
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div className="mt-4 pt-4 border-t border-gray-100">
                                <div className="flex items-center gap-2 text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-2">
                                    <UserCog size={14} className="shrink-0 text-slate-400" />
                                    <span>
                                        {personalCount === 0
                                            ? 'Pulsa el + de una hora libre para reservarla al profesor.'
                                            : `${personalCount} ${personalCount === 1 ? 'hora reservada' : 'horas reservadas'}. Pulsa una para editarla.`}
                                    </span>
                                </div>
                            </div>

                            {sharedCellCount > 0 && (
                                <div className="mt-3 flex items-start gap-2 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
                                    <AlertCircle size={14} className="shrink-0 mt-px" />
                                    <span>
                                        {sharedCellCount}{' '}
                                        {sharedCellCount === 1 ? 'hora tiene' : 'horas tienen'} al profesor en dos
                                        sitios a la vez (en rojo). Arrastra uno de los bloques a otra hora para
                                        resolverlo.
                                    </span>
                                </div>
                            )}

                            <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                                <button
                                    type="button"
                                    onClick={handleAutoFill}
                                    disabled={autoFill.isPending || totalRemaining === 0}
                                    title={
                                        totalRemaining === 0
                                            ? 'No quedan bloques por colocar'
                                            : 'Reparte al azar los bloques pendientes en huecos libres'
                                    }
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-bold hover:from-purple-700 hover:to-indigo-700 shadow-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                >
                                    {autoFill.isPending ? <Loader2 size={16} className="animate-spin" /> : <Shuffle size={16} />}
                                    Ordenar al azar
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={!isDirty || bulkUpdate.isPending}
                                    className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                                        isDirty
                                            ? 'bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer'
                                            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                    }`}
                                >
                                    {bulkUpdate.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                    Guardar Cambios
                                </button>
                            </div>
                        </div>

                        {conflicts.length > 0 && (
                            <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-3">
                                <div className="flex items-center gap-2 text-red-700 font-bold text-xs mb-2">
                                    <AlertCircle size={14} />
                                    No se guardó: hay choques
                                </div>
                                <ul className="space-y-1.5">
                                    {conflicts.map((c, i) => (
                                        <li key={i} className="text-[11px] text-red-700 leading-snug">
                                            • {c.message}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>

                    {/* Cuadrícula */}
                    {/*
                        DE PIE, UN DÍA CADA VEZ

                        Lo mismo que en el horario de una sección: la rejilla
                        pide 700 px y un teléfono de pie tiene 390. El corte es
                        por ancho, así que el propio teléfono tumbado ya la
                        enseña entera.
                    */}
                    <div className="flex-1 min-[700px]:hidden">
                        <HorarioPorDias
                            dias={DAYS}
                            periodos={dynamicPeriods}
                            cargando={isLoading}
                            motivoDelGiro="Para mover horas de sitio"
                            loDeLaHora={(dia, periodo) => {
                                const suyos = blocks.filter((b) => b.cellId === `${dia.id}-${periodo.startTime}`);
                                const primero = suyos[0];
                                if (!primero) return null;
                                return {
                                    titulo: primero.primaryLabel,
                                    subtitulo: primero.secondaryLabel,
                                    color: primero.color || undefined,
                                    // Dos clases a la misma hora es un choque, y
                                    // hay que verlo también aquí: en la rejilla
                                    // se marca en rojo, y de pie no había rejilla.
                                    extra:
                                        suyos.length > 1 ? (
                                            <span className="mt-1 inline-flex rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                                                Choque: {suyos.length} a la misma hora
                                            </span>
                                        ) : undefined,
                                };
                            }}
                        />
                    </div>

                    <div className="rejilla-densa hidden flex-1 overflow-x-auto min-[700px]:block">
                        <div className="min-w-[700px] bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                            <div className="grid grid-cols-6 border-b border-gray-200 bg-gray-50">
                                <div className="p-3 text-center text-xs font-bold text-gray-500 uppercase">Hora</div>
                                {DAYS.map((day) => (
                                    <div
                                        key={day.id}
                                        className="p-3 text-center text-xs font-bold text-gray-700 uppercase border-l border-gray-200"
                                    >
                                        {day.label}
                                    </div>
                                ))}
                            </div>

                            {isLoading ? (
                                <div className="p-8 text-center text-gray-500">
                                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                                    Cargando horario...
                                </div>
                            ) : (
                                dynamicPeriods.map((period) => {
                                    if (period.type === 'break') {
                                        return (
                                            <div
                                                key={period.id}
                                                className="grid grid-cols-6 border-b border-gray-100 last:border-b-0 bg-gray-100/50"
                                            >
                                                <div className="col-span-6 p-2 flex items-center justify-center gap-2 text-gray-500">
                                                    <Coffee size={14} />
                                                    <span className="text-[11px] font-bold uppercase tracking-wider">
                                                        {period.label}
                                                    </span>
                                                    <span className="text-[11px]">
                                                        ({period.startTime} - {period.endTime})
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    }

                                    return (
                                        <div
                                            key={period.id}
                                            className="grid grid-cols-6 border-b border-gray-100 last:border-b-0"
                                        >
                                            <div className="p-2 flex flex-col justify-center items-center bg-gray-50/50">
                                                <span className="text-[10px] font-bold text-gray-400 uppercase mb-1">
                                                    {period.label}
                                                </span>
                                                <span className="text-xs font-semibold text-gray-700">
                                                    {period.startTime}
                                                </span>
                                                <span className="text-[10px] text-gray-400">{period.endTime}</span>
                                            </div>

                                            {DAYS.map((day) => {
                                                const cellId = `${day.id}-${period.startTime}`;
                                                // filter, no find: una celda puede tener más de un bloque
                                                const cellBlocks = blocks.filter((b) => b.cellId === cellId);

                                                return (
                                                    <div key={cellId} className="border-l border-gray-100">
                                                        <DroppableCell
                                                            id={cellId}
                                                            cellBlocks={cellBlocks}
                                                            onRemove={(b) => handleRemoveBlock(b.id)}
                                                            onEdit={(b) => openEditPersonal(b)}
                                                            onCreatePersonal={() =>
                                                                openCreatePersonal(
                                                                    day.id,
                                                                    period.startTime,
                                                                    period.endTime
                                                                )
                                                            }
                                                            hasConflict={conflictCells.has(cellId)}
                                                        />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>

                <DragOverlay>
                    {activeDragData?.block ? (
                        <div className="w-32 h-14">
                            <BlockCard block={activeDragData.block} dragging />
                        </div>
                    ) : activeDragData?.assignment ? (
                        <div className="w-40">
                            <DraggableAssignment assignment={activeDragData.assignment} />
                        </div>
                    ) : null}
                </DragOverlay>
            </DndContext>

            <PersonalBlockModal
                open={Boolean(modalDraft)}
                draft={modalDraft}
                dayLabel={modalDraft ? dayLabelOf(modalDraft.dayOfWeek) : ''}
                isSaving={personal.create.isPending || personal.update.isPending}
                isDeleting={personal.remove.isPending}
                conflicts={modalConflicts}
                onClose={() => setModalDraft(null)}
                onSave={handleSavePersonal}
                onDelete={handleDeletePersonal}
            />
        </>
    );
}
