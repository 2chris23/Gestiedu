'use client';

import React, { useState, useEffect } from 'react';
import { useConfirm } from '@/hooks/useConfirm';
import { DndContext, useDraggable, useDroppable, DragEndEvent, DragOverlay } from '@dnd-kit/core';
import { useBulkUpdateSchedule, useAutoGenerateSchedule } from '@/hooks/useSchedules';
import { useSchedulePeriods } from '@/hooks/useSchedulePeriods';
import { toast } from 'sonner';
import { Loader2, Wand2, Save, X, Trash2, Coffee } from 'lucide-react';

interface ClassroomScheduleEditorProps {
    classroomId: string;
    initialBlocks: any[];
    subjects: any[]; // The subjects assigned to this classroom (ClassroomSubjects)
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
            
            <button 
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

export default function ClassroomScheduleEditor({ classroomId, initialBlocks, subjects }: ClassroomScheduleEditorProps) {
    const [blocks, setBlocks] = useState<any[]>([]);
    const [deletedIds, setDeletedIds] = useState<string[]>([]);
    const [isDirty, setIsDirty] = useState(false);
    const [activeDragData, setActiveDragData] = useState<any>(null);
    const confirmDialog = useConfirm();
    
    const bulkUpdate = useBulkUpdateSchedule(classroomId);
    const autoGenerate = useAutoGenerateSchedule();
    const { periods: dynamicPeriods, isLoading } = useSchedulePeriods();

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

    const handleDragEnd = (event: DragEndEvent) => {
        setActiveDragData(null);
        const { over, active } = event;
        if (!over) return;

        const cellId = over.id as string; // Format: "dayOfWeek-startTime"
        const [dayStr, startTimeStr] = cellId.split('-');
        const dayOfWeek = parseInt(dayStr);
        const startTime = startTimeStr;
        
        // Find end time for this start time
        const period = dynamicPeriods.find(p => p.startTime === startTime);
        if (!period || period.type === 'break') return;

        const dragType = active.data.current?.type;

        if (dragType === 'sidebar-subject') {
            const subjectData = active.data.current?.subject;
            if (!subjectData) return;

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
        } else if (dragType === 'grid-block') {
            const sourceBlock = active.data.current?.block;
            if (!sourceBlock) return;
            
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
            await bulkUpdate.mutateAsync({ blocks: payloadBlocks, deleteIds: deletedIds });
            toast.success('Horario guardado correctamente');
            setIsDirty(false);
            setDeletedIds([]);
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Error al guardar horario');
        }
    };

    const handleAutoGenerate = async () => {
        if (await confirmDialog({ title: '¿Estás seguro? Esto sobrescribirá el horario actual.' })) {
            try {
                await autoGenerate.mutateAsync(classroomId);
                toast.success('Horario generado automáticamente');
            } catch (error: any) {
                toast.error(error.response?.data?.error || 'Error al generar horario');
            }
        }
    };

    // Calcular bloques restantes por materia
    const subjectsWithRemaining = subjects.map(s => {
        const used = blocks.filter(b => b.classroomSubjectId === s.id).length;
        const total = s.weeklyBlocks || 0;
        return { ...s, remaining: total - used };
    });

    return (
        <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
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
                                onClick={handleAutoGenerate}
                                disabled={autoGenerate.isPending}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg text-sm font-semibold hover:from-purple-700 hover:to-indigo-700 transition-colors disabled:opacity-50"
                            >
                                {autoGenerate.isPending ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                                Auto-Generar
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

                {/* Grid del Horario */}
                <div className="flex-1 overflow-x-auto">
                    <div className="min-w-[700px] bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="grid grid-cols-6 border-b border-gray-200 bg-gray-50">
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
        </DndContext>
    );
}
