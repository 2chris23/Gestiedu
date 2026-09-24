'use client';

import React, { useState, useEffect } from 'react';
import { useConfirm } from '@/hooks/useConfirm';
import {
    DndContext,
    useDraggable,
    useDroppable,
    DragEndEvent,
    DragOverlay,
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import { useRouter } from 'next/navigation';
import { useBulkUpdateSchedule, useAutoGenerateSchedule } from '@/hooks/useSchedules';
import { useSchedulePeriods } from '@/hooks/useSchedulePeriods';
import { toast } from 'sonner';
import { Loader2, Wand2, Save, X, Trash2, Coffee, Shuffle, AlertCircle } from 'lucide-react';

interface ClassroomScheduleEditorProps {
    classroomId: string;
    initialBlocks: any[];
    subjects: any[]; // The subjects assigned to this classroom (ClassroomSubjects)
    shift?: 'MANANA' | 'TARDE' | 'INTEGRAL';
    /** El nombre de la sección, para la cabecera del editor en el teléfono. */
    titulo?: string;
}

import HorarioPorDias from '@/components/schedule/HorarioPorDias';
import EditorDeHorarioTumbado from '@/components/schedule/EditorDeHorarioTumbado';

/**
 * ¿Es un teléfono? El dedo, y el lado corto de la pantalla por debajo de 600
 * px (de pie o tumbado). Una tableta tiene 700 o más: allí sirve el editor de
 * siempre, que cabe.
 */
function useEsTelefono(): boolean {
    const [es, setEs] = useState(false);
    useEffect(() => {
        const consulta = window.matchMedia('(pointer: coarse) and (max-width: 599px), (pointer: coarse) and (max-height: 599px)');
        const mirar = () => setEs(consulta.matches);
        mirar();
        consulta.addEventListener('change', mirar);
        return () => consulta.removeEventListener('change', mirar);
    }, []);
    return es;
}

const DAYS = [
    { id: 1, label: 'Lunes' },
    { id: 2, label: 'Martes' },
    { id: 3, label: 'Miércoles' },
    { id: 4, label: 'Jueves' },
    { id: 5, label: 'Viernes' },
];



// Draggable Item Component (Sidebar)
function DraggableSubject({ subject, id }: { subject: any, id: string }) {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: id,
        data: { type: 'sidebar-subject', subject }
    });

    return (
        <div
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            className={`p-2 rounded-md shadow-sm text-xs font-bold cursor-grab active:cursor-grabbing border ${isDragging ? 'opacity-50' : 'opacity-100'}`}
            style={{ backgroundColor: subject?.subject?.color ? `${subject.subject.color}20` : '#f3f4f6', borderColor: subject?.subject?.color || '#e5e7eb', color: '#1f2937' }}
        >
            {subject?.subject?.name || 'Materia'}
        </div>
    );
}

// Draggable Grid Block Component
function DraggableGridBlock({ block, onRemove }: { block: any, onRemove: () => void }) {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `grid-${block.cellId}`,
        data: { type: 'grid-block', block }
    });

    return (
        <div
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            className={`absolute inset-1 rounded-md p-1.5 shadow-sm text-[10px] flex flex-col justify-between group overflow-hidden cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-50' : 'opacity-100'}`}
            style={{ backgroundColor: block.color ? `${block.color}20` : '#f3f4f6', borderLeft: `3px solid ${block.color || '#6366f1'}`, zIndex: isDragging ? 10 : 1 }}
        >
            <div className="font-bold text-gray-800 line-clamp-1 pointer-events-none">{block.subjectName}</div>
            <div className="text-gray-500 line-clamp-1 pointer-events-none">{block.teacherName}</div>

            <button aria-label={`Quitar ${block.subjectName} de esta hora`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-red-500 hover:bg-red-100 p-0.5 rounded transition-opacity z-20 cursor-pointer"
            >
                <X size={12} />
            </button>
        </div>
    );
}

// Droppable Cell Component
function DroppableCell({ id, block, onRemove }: { id: string, block?: any, onRemove: () => void }) {
    const { isOver, setNodeRef } = useDroppable({
        id: id,
    });

    return (
        <div
            ref={setNodeRef}
            className={`min-h-[60px] p-1 border border-gray-100 relative transition-colors ${isOver ? 'bg-indigo-50 border-indigo-300' : 'bg-white hover:bg-gray-50'}`}
        >
            {block && (
                <DraggableGridBlock block={block} onRemove={onRemove} />
            )}
        </div>
    );
}

export default function ClassroomScheduleEditor({ classroomId, initialBlocks, subjects, shift, titulo }: ClassroomScheduleEditorProps) {
    const router = useRouter();
    const esTelefono = useEsTelefono();

    /**
     * ARRASTRAR CON EL DEDO
     *
     * Con los sensores por defecto (`PointerSensor`), en un teléfono el dedo
     * movía la página en vez de la materia: el navegador se queda el gesto
     * para desplazar y el arrastre se cancela. Ratón y dedo van aparte: con el
     * ratón basta moverlo 6 px; con el dedo hay que mantenerlo pulsado un
     * momento, y así deslizar la lista sigue siendo deslizar la lista.
     */
    const sensores = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
        useSensor(KeyboardSensor)
    );
    const [blocks, setBlocks] = useState<any[]>([]);
    const [deletedIds, setDeletedIds] = useState<string[]>([]);
    const [isDirty, setIsDirty] = useState(false);
    const [activeDragData, setActiveDragData] = useState<any>(null);
    const [isRandomizeModalOpen, setIsRandomizeModalOpen] = useState(false);
    const confirmDialog = useConfirm();

    const autoShift = initialBlocks?.some(b => b.startTime >= '12:45') ? 'TARDE' : 'MANANA';
    const [currentShift, setCurrentShift] = useState<'MANANA' | 'TARDE'>(
        shift === 'TARDE' ? 'TARDE' : autoShift
    );
    const bulkUpdate = useBulkUpdateSchedule(classroomId);
    const autoGenerate = useAutoGenerateSchedule();
    const { periods: dynamicPeriods, isLoading } = useSchedulePeriods(currentShift);

    useEffect(() => {
        // Map initial blocks to our internal state format
        if (initialBlocks && Array.isArray(initialBlocks)) {
            const mapped = initialBlocks.map(b => ({
                id: b.id, // backend ID
                cellId: `${b.dayOfWeek}-${b.startTime}`,
                classroomSubjectId: b.classroomSubject?.id,
                subjectName: b.classroomSubject?.subject?.name,
                teacherName: b.classroomSubject?.teacher ? `${b.classroomSubject.teacher.firstName} ${b.classroomSubject.teacher.lastName}` : 'Sin Prof.',
                color: b.classroomSubject?.subject?.color,
                dayOfWeek: b.dayOfWeek,
                startTime: b.startTime,
                endTime: b.endTime
            }));
            setBlocks(mapped);
            setIsDirty(false);
            setDeletedIds([]);
        }
    }, [initialBlocks]);

    const handleDragStart = (event: any) => {
        setActiveDragData(event.active.data.current);
    };

    /** Poner una materia en un hueco (arrastrándola o tocándola y tocando el hueco). */
    const colocarMateria = (subjectData: any, cellId: string) => {
        const [dayStr, startTime] = cellId.split('-');
        const dayOfWeek = parseInt(dayStr);
        const period = dynamicPeriods.find(p => p.startTime === startTime);
        if (!subjectData || !period || period.type === 'break') return;
        {

            // Check if cell is already occupied
            const existingBlockIndex = blocks.findIndex(b => b.cellId === cellId);

            const newBlock = {
                id: `temp-${Date.now()}`, // Temporary ID for new blocks
                cellId,
                classroomSubjectId: subjectData.id,
                subjectName: subjectData.subject.name,
                teacherName: subjectData.teacher ? `${subjectData.teacher.firstName} ${subjectData.teacher.lastName}` : 'Sin Prof.',
                color: subjectData.subject.color,
                dayOfWeek,
                startTime,
                endTime: period.endTime
            };

            setBlocks(prev => {
                const next = [...prev];
                if (existingBlockIndex >= 0) {
                    // If it had a real ID, mark for deletion
                    const oldId = next[existingBlockIndex].id;
                    if (!oldId.startsWith('temp-')) {
                        setDeletedIds(d => [...d, oldId]);
                    }
                    next[existingBlockIndex] = newBlock;
                } else {
                    next.push(newBlock);
                }
                return next;
            });
            setIsDirty(true);
        }
    };

    /** Mover una clase ya puesta a otro hueco. */
    const moverBloque = (sourceBlock: any, cellId: string) => {
        const [dayStr, startTime] = cellId.split('-');
        const dayOfWeek = parseInt(dayStr);
        const period = dynamicPeriods.find(p => p.startTime === startTime);
        if (!sourceBlock || !period || period.type === 'break') return;
        {
            if (sourceBlock.cellId === cellId) return;

            setBlocks(prev => {
                const next = [...prev];

                const targetBlockIndex = next.findIndex(b => b.cellId === cellId);
                if (targetBlockIndex >= 0) {
                    const oldId = next[targetBlockIndex].id;
                    if (!oldId.startsWith('temp-')) {
                        setDeletedIds(d => [...d, oldId]);
                    }
                    next.splice(targetBlockIndex, 1);
                }

                const sourceBlockIndex = next.findIndex(b => b.cellId === sourceBlock.cellId);
                if (sourceBlockIndex >= 0) {
                    next[sourceBlockIndex] = {
                        ...next[sourceBlockIndex],
                        cellId,
                        dayOfWeek,
                        startTime,
                        endTime: period.endTime
                    };
                }

                return next;
            });
            setIsDirty(true);
        }
    };

    const handleDragEnd = (event: DragEndEvent) => {
        setActiveDragData(null);
        const { over, active } = event;
        if (!over) return;
        const dragType = active.data.current?.type;

        // Una clase soltada en la columna de las materias se quita del horario.
        if (over.id === 'restantes') {
            if (dragType === 'grid-block') handleRemoveBlock(active.data.current?.block?.cellId);
            return;
        }

        const cellId = over.id as string; // "diaDeLaSemana-horaDeInicio"
        if (dragType === 'sidebar-subject') colocarMateria(active.data.current?.subject, cellId);
        else if (dragType === 'grid-block') moverBloque(active.data.current?.block, cellId);
    };

    const handleRemoveBlock = (cellId: string) => {
        setBlocks(prev => {
            const existingBlockIndex = prev.findIndex(b => b.cellId === cellId);
            if (existingBlockIndex >= 0) {
                const next = [...prev];
                const oldId = next[existingBlockIndex].id;
                if (!oldId.startsWith('temp-')) {
                    setDeletedIds(d => [...d, oldId]);
                }
                next.splice(existingBlockIndex, 1);
                setIsDirty(true);
                return next;
            }
            return prev;
        });
    };

    const handleSave = async () => {
        const payloadBlocks = blocks.map(b => ({
            id: b.id.startsWith('temp-') ? undefined : b.id,
            classroomSubjectId: b.classroomSubjectId,
            dayOfWeek: b.dayOfWeek,
            startTime: b.startTime,
            endTime: b.endTime
        }));

        try {
            const res = await bulkUpdate.mutateAsync({ blocks: payloadBlocks, deleteIds: deletedIds });
            // Los choques heredados (bloques que este guardado no tocó) ya no
            // bloquean: el horario se guardó, pero se avisa para poder resolverlos.
            if (res?.warnings?.length) {
                toast.warning(
                    `Horario guardado. Arrastra ${res.warnings.length} ${res.warnings.length === 1 ? 'choque heredado' : 'choques heredados'}: ${res.warnings[0]}`
                );
            } else {
                toast.success('Horario guardado correctamente');
            }
            setIsDirty(false);
            setDeletedIds([]);
        } catch (error: any) {
            const data = error.response?.data;
            // Un choque NUEVO sí bloquea: decir cuál, no solo "no se guardó".
            if (data?.code === 'SCHEDULE_CONFLICT' && data.conflicts?.length) {
                toast.error(`No se guardó: ${data.conflicts[0].message}`);
                return;
            }
            toast.error(data?.error || 'Error al guardar horario');
        }
    };

    const handleConfirmRandomize = async () => {
        try {
            const res = await autoGenerate.mutateAsync(classroomId);
            if (res?.scheduleBlocks && Array.isArray(res.scheduleBlocks)) {
                const mapped = res.scheduleBlocks.map((b: any) => ({
                    id: b.id,
                    cellId: `${b.dayOfWeek}-${b.startTime}`,
                    classroomSubjectId: b.classroomSubject?.id,
                    subjectName: b.classroomSubject?.subject?.name,
                    teacherName: b.classroomSubject?.teacher ? `${b.classroomSubject.teacher.firstName} ${b.classroomSubject.teacher.lastName}` : 'Sin Prof.',
                    color: b.classroomSubject?.subject?.color,
                    dayOfWeek: b.dayOfWeek,
                    startTime: b.startTime,
                    endTime: b.endTime
                }));
                setBlocks(mapped);
                setIsDirty(false);
                setDeletedIds([]);
            }
            // El generador ya no coloca una clase si su profesor está ocupado en
            // otra sección: lo que no cupo se informa en vez de crear un choque.
            if (res?.unplaced?.length) {
                const names = Array.from(new Set(res.unplaced.map((u: any) => u.subject))).slice(0, 3).join(', ');
                toast.warning(
                    `Horario reorganizado. ${res.unplaced.length} ${res.unplaced.length === 1 ? 'bloque quedó' : 'bloques quedaron'} sin colocar porque el profesor está ocupado en otra sección (${names}). Colócalos a mano.`
                );
            } else {
                toast.success('Horario reorganizado al azar y apilado correctamente');
            }
            setIsRandomizeModalOpen(false);
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Error al ordenar horario al azar');
        }
    };

    // Calcular bloques restantes por materia
    const subjectsWithRemaining = subjects.map(s => {
        const used = blocks.filter(b => b.classroomSubjectId === s.id).length;
        const total = s.weeklyBlocks || 0;
        return { ...s, remaining: total - used };
    });

    const modalDeAzar = (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200" role="dialog" aria-modal="true" aria-label="¿Ordenar horario al azar?">
                    <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden p-6 space-y-4 animate-in zoom-in-95 duration-200">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                                <Shuffle size={24} />
                            </div>
                            <div>
                                <h3 className="font-bold text-base text-gray-900">
                                    ¿Ordenar horario al azar?
                                </h3>
                                <p className="text-xs text-gray-500">
                                    Reorganización automática y continua
                                </p>
                            </div>
                        </div>

                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 space-y-1.5 leading-relaxed">
                            <p className="font-semibold flex items-center gap-1.5 text-amber-800">
                                <AlertCircle size={14} className="shrink-0" />
                                <span>Atención: Cambio en la distribución semanal</span>
                            </p>
                            <p>
                                Esta opción reorganizará todas las clases de la sección de forma aleatoria.
                                Las materias quedarán <strong>estrictamente apiladas de forma continua</strong> desde la primera hora escolar (sin horas libres intermedias ni huecos), respetando los horarios de los profesores sin colisiones.
                            </p>
                            <p className="text-amber-700 font-medium">
                                El horario actual de esta sección será reemplazado.
                            </p>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setIsRandomizeModalOpen(false)}
                                disabled={autoGenerate.isPending}
                                className="px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmRandomize}
                                disabled={autoGenerate.isPending}
                                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                            >
                                {autoGenerate.isPending ? <Loader2 size={15} className="animate-spin" /> : <Shuffle size={15} />}
                                Sí, ordenar al azar
                            </button>
                        </div>
                    </div>
                </div>
    );

    const salirDelEditor = async () => {
        if (isDirty && !(await confirmDialog({ title: '¿Salir sin guardar?', description: 'Los cambios del horario se perderán.' }))) return;
        if (window.history.length > 1) router.back();
        else router.push('/dashboard/horarios');
    };

    const superposicion = (
        <DragOverlay>
            {activeDragData?.type === 'sidebar-subject' ? (
                <div
                    className="p-2 rounded-md shadow-lg text-xs font-bold border opacity-90 cursor-grabbing"
                    style={{ backgroundColor: activeDragData.subject?.subject?.color ? `${activeDragData.subject.subject.color}20` : '#f3f4f6', borderColor: activeDragData.subject?.subject?.color || '#e5e7eb', color: '#1f2937' }}
                >
                    {activeDragData.subject?.subject?.name || 'Materia'}
                </div>
            ) : activeDragData?.type === 'grid-block' ? (
                <div
                    className="rounded-md p-1.5 shadow-xl text-[10px] flex flex-col justify-between overflow-hidden border opacity-90 cursor-grabbing w-[116px] h-[58px]"
                    style={{ backgroundColor: activeDragData.block.color ? `${activeDragData.block.color}20` : '#f3f4f6', borderLeft: `3px solid ${activeDragData.block.color || '#6366f1'}` }}
                >
                    <div className="font-bold text-gray-800 line-clamp-1 pointer-events-none">{activeDragData.block.subjectName}</div>
                    <div className="text-gray-500 line-clamp-1 pointer-events-none">{activeDragData.block.teacherName}</div>
                </div>
            ) : null}
        </DragOverlay>
    );

    if (esTelefono) {
        return (
            <DndContext sensors={sensores} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                <EditorDeHorarioTumbado
                    titulo={titulo || 'Horario'}
                    dias={DAYS}
                    periodos={dynamicPeriods}
                    cargando={isLoading}
                    materias={subjectsWithRemaining.map((s) => ({
                        id: s.id,
                        nombre: s.subject?.name || 'Materia',
                        color: s.subject?.color,
                        quedan: s.remaining,
                        total: s.weeklyBlocks || 0,
                        datos: s,
                    }))}
                    bloques={blocks}
                    turno={currentShift}
                    alCambiarTurno={setCurrentShift}
                    alColocar={colocarMateria}
                    alQuitar={handleRemoveBlock}
                    alGuardar={handleSave}
                    alAzar={() => setIsRandomizeModalOpen(true)}
                    guardando={bulkUpdate.isPending}
                    hayCambios={isDirty}
                    alSalir={salirDelEditor}
                />
                {superposicion}
                {isRandomizeModalOpen && modalDeAzar}
            </DndContext>
        );
    }

    return (
        <DndContext sensors={sensores} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="flex flex-col lg:flex-row gap-6">
                {/* Sidebar - Materias Disponibles */}
                <div className="w-full lg:w-64 flex-shrink-0">
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sticky top-6">
                        <h3 className="font-bold text-gray-800 mb-4 flex items-center justify-between">
                            <span>Materias</span>
                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">{subjects.length}</span>
                        </h3>

                        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                            {subjectsWithRemaining.filter(s => s.remaining > 0).length > 0 ? (
                                subjectsWithRemaining.filter(s => s.remaining > 0).map(subject => (
                                    <div key={subject.id} className="flex flex-col gap-1">
                                        <div className="flex justify-between items-center text-xs px-1 text-gray-500">
                                            <span>Restantes:</span>
                                            <span className="font-bold text-amber-600">
                                                {subject.remaining} / {subject.weeklyBlocks || 0}
                                            </span>
                                        </div>
                                        <DraggableSubject
                                            id={`subject-${subject.id}`}
                                            subject={subject}
                                        />
                                    </div>
                                ))
                            ) : (
                                <div className="py-6 text-center text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                                    <p className="text-sm italic">Todas las materias están asignadas</p>
                                </div>
                            )}
                        </div>

                        <div className="mt-6 pt-4 border-t border-gray-100 space-y-3">
                            <button
                                type="button"
                                onClick={() => setIsRandomizeModalOpen(true)}
                                disabled={autoGenerate.isPending}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-bold hover:from-purple-700 hover:to-indigo-700 shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                            >
                                {autoGenerate.isPending ? <Loader2 size={16} className="animate-spin" /> : <Shuffle size={16} />}
                                Ordenar al azar
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={!isDirty || bulkUpdate.isPending}
                                className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                                    isDirty
                                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                }`}
                            >
                                {bulkUpdate.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                Guardar Cambios
                            </button>
                        </div>
                    </div>
                </div>

                {/*
                    DE PIE, UN DÍA CADA VEZ

                    La rejilla necesita 700 px —cinco días por siete horas— y un
                    teléfono de pie tiene 390: había que arrastrarla de lado, y
                    al llegar al viernes ya no se sabía qué hora se miraba. El
                    corte se hace por ancho y no por «móvil»: la rejilla sale en
                    cuanto cabe, y eso incluye el mismo teléfono tumbado.
                */}
                <div className="flex-1 min-[700px]:hidden">
                    <HorarioPorDias
                        dias={DAYS}
                        periodos={dynamicPeriods}
                        cargando={isLoading}
                        motivoDelGiro="Para mover materias de hueco"
                        loDeLaHora={(dia, periodo) => {
                            const bloque = blocks.find((b) => b.cellId === `${dia.id}-${periodo.startTime}`);
                            if (!bloque) return null;
                            return {
                                titulo: bloque.subjectName,
                                subtitulo: bloque.teacherName,
                                color: bloque.color || undefined,
                            };
                        }}
                    />
                </div>

                {/* Grid del Horario */}
                <div className="rejilla-densa hidden flex-1 overflow-x-auto min-[700px]:block">
                    <div className="min-w-[700px] bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        {/* Selector de Turno */}
                        <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-gray-700">Turno de clase:</span>
                                <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-xs font-semibold">
                                    <button
                                        type="button"
                                        onClick={() => setCurrentShift('MANANA')}
                                        className={`rounded-md px-3 py-1 transition-colors ${
                                            currentShift === 'MANANA'
                                                ? 'bg-indigo-600 text-white shadow-sm'
                                                : 'text-gray-600 hover:text-gray-900'
                                        }`}
                                    >
                                        Mañana (07:00 - 12:15)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setCurrentShift('TARDE')}
                                        className={`rounded-md px-3 py-1 transition-colors ${
                                            currentShift === 'TARDE'
                                                ? 'bg-indigo-600 text-white shadow-sm'
                                                : 'text-gray-600 hover:text-gray-900'
                                        }`}
                                    >
                                        Tarde (13:00 - 17:30)
                                    </button>
                                </div>
                            </div>
                            <div className="text-[11px] text-gray-500">
                                {currentShift === 'MANANA' ? 'Bloques de 45 min • Turno Matutino' : 'Bloques de 45 min • Turno Vespertino'}
                            </div>
                        </div>

                        <div className="grid grid-cols-6 border-b border-gray-200 bg-gray-50/75">
                            <div className="p-3 text-center text-xs font-bold text-gray-500 uppercase">Hora</div>
                            {DAYS.map(day => (
                                <div key={day.id} className="p-3 text-center text-xs font-bold text-gray-700 uppercase border-l border-gray-200">
                                    {day.label}
                                </div>
                            ))}
                        </div>

                        {isLoading ? (
                            <div className="p-8 text-center text-gray-500">
                                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                                Cargando horario...
                            </div>
                        ) : dynamicPeriods.map(period => {
                            if (period.type === 'break') {
                                return (
                                    <div key={period.id} className="grid grid-cols-6 border-b border-gray-100 last:border-b-0 bg-gray-100/50">
                                        <div className="col-span-6 p-2 flex items-center justify-center gap-2 text-gray-500">
                                            <Coffee size={14} />
                                            <span className="text-[11px] font-bold uppercase tracking-wider">{period.label}</span>
                                            <span className="text-[11px]">({period.startTime} - {period.endTime})</span>
                                        </div>
                                    </div>
                                );
                            }

                            return (
                                <div key={period.id} className="grid grid-cols-6 border-b border-gray-100 last:border-b-0">
                                    {/* Time Header */}
                                    <div className="p-2 flex flex-col justify-center items-center bg-gray-50/50">
                                        <span className="text-[10px] font-bold text-gray-400 uppercase mb-1">{period.label}</span>
                                        <span className="text-xs font-semibold text-gray-700">{period.startTime}</span>
                                        <span className="text-[10px] text-gray-400">{period.endTime}</span>
                                    </div>

                                    {/* Droppable Cells */}
                                    {DAYS.map(day => {
                                        const cellId = `${day.id}-${period.startTime}`;
                                        const block = blocks.find(b => b.cellId === cellId);

                                        return (
                                            <div key={cellId} className="border-l border-gray-100">
                                                <DroppableCell
                                                    id={cellId}
                                                    block={block}
                                                    onRemove={() => handleRemoveBlock(cellId)}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {superposicion}

            {/* Modal de confirmación para Ordenar al Azar */}
            {isRandomizeModalOpen && modalDeAzar}
        </DndContext>
    );
}
