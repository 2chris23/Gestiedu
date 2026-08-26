
'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { DndContext, DragOverlay, DragStartEvent, DragEndEvent, useDraggable, useDroppable } from '@dnd-kit/core';
import { useEvaluationPlanStore, TopicBlock as TopicBlockType, EvaluationType, InstrumentType } from './store/evaluation-store';
import TopicBlock from './TopicBlock';
import DistributionModal from './DistributionModal';
import EvaluationModal from './EvaluationModal';
import ConfigurationWizard from './ConfigurationWizard';
import { Undo2, Redo2, Plus, Save, UploadCloud, ChevronLeft } from 'lucide-react';

const packBlocks = (blocks: TopicBlockType[]) => {
    const sorted = [...blocks].sort((a, b) => a.startWeek - b.startWeek || b.duration - a.duration);
    const rows: TopicBlockType[][] = [];

    sorted.forEach(block => {
        let rowIndex = 0;
        while (true) {
            if (!rows[rowIndex]) rows[rowIndex] = [];
            const collision = rows[rowIndex].find(b => {
                const bEnd = b.startWeek + b.duration;
                const blockEnd = block.startWeek + block.duration;
                return (block.startWeek < bEnd && blockEnd > b.startWeek);
            });

            if (!collision) {
                rows[rowIndex].push(block);
                (block as TopicBlockType & { visualRow: number }).visualRow = rowIndex;
                break;
            }
            rowIndex++;
        }
    });

    return { packedBlocks: rows.flat(), totalRows: rows.length };
};

interface Props {
    termId?: number;
    onBack?: () => void;
}

export default function EvaluationPlanBuilder({ termId = 1, onBack }: Props) {
    const {
        settings, weeks, blocks, past, future,
        addTopic, moveBlock,
        addSubtopics, addEvaluation, getTotalPoints,
        undo, redo
    } = useEvaluationPlanStore();

    const [activeDragId, setActiveDragId] = useState<string | null>(null);

    // Modal States
    const [distributionModalOpen, setDistributionModalOpen] = useState(false);
    const [evaluationModalOpen, setEvaluationModalOpen] = useState(false);
    const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);

    const handleDragStart = (event: DragStartEvent) => {
        setActiveDragId(String(event.active.id));
    };

    const handleDragEnd = (event: DragEndEvent) => {
        setActiveDragId(null);
        const { active, over } = event;
        if (!over) return;

        const weekId = parseInt(over.id.toString().replace('week-', ''));
        if (isNaN(weekId)) return;

        if (active.id === 'new-topic-source') {
            addTopic('Nuevo Tema', weekId, 2);
        } else {
            moveBlock(String(active.id), weekId);
        }
    };

    // Handlers for modals
    const handleOpenDistribution = (blockId: string) => { setSelectedBlockId(blockId); setDistributionModalOpen(true); };
    const handleOpenEvaluation = (blockId: string) => { setSelectedBlockId(blockId); setEvaluationModalOpen(true); };
    const handleConfirmDistribution = (subtopics: string[], mode: 'sequential' | 'parallel' | 'manual') => {
        if (selectedBlockId) addSubtopics(selectedBlockId, subtopics, mode);
        setSelectedBlockId(null);
    };
    const handleConfirmEvaluation = (evaluation: { type: EvaluationType; instrument: InstrumentType; points: number; description: string }) => {
        if (selectedBlockId) addEvaluation(selectedBlockId, evaluation);
        setSelectedBlockId(null);
    };

    // Layout Calc
    const { packedBlocks, totalRows } = useMemo(() => packBlocks(Object.values(blocks)), [blocks]);

    const totalPoints = getTotalPoints();
    const pointsColor = totalPoints > 20 ? 'bg-red-500' : totalPoints === 20 ? 'bg-emerald-500' : 'bg-indigo-500';

    if (!settings.isConfigured) {
        return <ConfigurationWizard onCancel={onBack} />;
    }

    return (
        <div className="flex flex-col bg-gray-50 h-[calc(100vh-64px)]">

            {/* 1. Sticky Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between sticky top-0 z-30 shadow-sm">

                {/* Left: Title & History */}
                <div className="flex items-center gap-4">
                    {onBack && (
                        <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors" title="Volver a los lapsos">
                            <ChevronLeft size={20} />
                        </button>
                    )}
                    <h1 className="font-bold text-gray-800 text-lg">Planificación: {termId}º Lapso</h1>
                    <div className="h-6 w-px bg-gray-200"></div>
                    <div className="flex gap-1">
                        <button onClick={undo} disabled={past.length === 0} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg disabled:opacity-30"><Undo2 size={18} /></button>
                        <button onClick={redo} disabled={future.length === 0} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg disabled:opacity-30"><Redo2 size={18} /></button>
                    </div>
                </div>

                {/* Center: Points Budget */}
                <div className="flex-1 max-w-md mx-6">
                    <div className="flex justify-between text-xs font-bold mb-1">
                        <span className="text-gray-500 uppercase tracking-wide">Presupuesto de Notas</span>
                        <span className={totalPoints > 20 ? 'text-red-600' : 'text-gray-700'}>{totalPoints} / 20 pts</span>
                    </div>
                    <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                            className={`h-full transition-all duration-500 ${pointsColor}`}
                            style={{ width: `${Math.min((totalPoints / 20) * 100, 100)}%` }}
                        ></div>
                    </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-3">
                    <button className="flex items-center gap-2 px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg transition-colors">
                        <Save size={18} /> Borrador
                    </button>
                    <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-lg shadow-indigo-200 transition-all active:scale-95">
                        <UploadCloud size={18} /> Publicar
                    </button>
                </div>
            </div>

            {/* 2. Main Content */}
            <div className="flex flex-1 overflow-hidden relative">

                {/* Tools Palette (Floating or Fixed Left) */}
                <div className="w-16 bg-white border-r flex flex-col items-center py-4 gap-4 z-20">
                    <DraggableSource id="new-topic-source" />
                    {/* <div className="w-8 h-px bg-gray-200"></div> */}
                </div>

                <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                    <div className="flex-1 flex flex-col overflow-auto relative">

                        {/* Timeline Grid */}
                        <div className="flex min-w-[1000px]">

                            {/* Column 1: Timeline Dates (Left Sticky?) */}
                            <div className="w-48 flex-shrink-0 bg-white border-r z-10">
                                <div className="h-10 border-b bg-gray-50"></div> {/* Header Spacer */}
                                {weeks.map((week, idx) => (
                                    <div key={week.id} className="h-32 border-b p-4 flex flex-col justify-center relative">
                                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Semana {week.id}</span>
                                        <span className="font-semibold text-gray-700">{week.label}</span>
                                        {idx < weeks.length - 1 && (
                                            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-1 h-1 bg-gray-300 rounded-full"></div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Column 2: Canvas Dropzone */}
                            <div className="flex-1 bg-gray-50/30 relative">
                                {/* Grid Lines */}
                                {weeks.map(week => (
                                    <DroppableRow key={week.id} id={week.id} />
                                ))}

                                {/* Blocks Container (Overlay) */}
                                <div className="absolute top-0 left-0 right-0 bottom-0 pt-10 pl-4 pr-4">
                                    {/* Note: The 'pt-10' is to offset the header spacer if we align strictly. 
                                 Actually, let's use global grid positioning. 
                                 For simplicity in this 1D vertical list, acts as "Rows".
                             */}
                                    {packedBlocks.map((block: TopicBlockType) => (
                                        <div
                                            key={block.id}
                                            style={{
                                                top: `${(block.startWeek - 1) * 128}px`, // 128px = h-32 (row height)
                                                height: `${block.duration * 128 - 16}px`, // Minus gap
                                                position: 'absolute',
                                                left: '1rem',
                                                right: '1rem',
                                                zIndex: 10
                                            }}
                                        >
                                            <TopicBlock
                                                block={block}
                                                onAddSubtopics={() => handleOpenDistribution(block.id)}
                                                onAddEvaluation={() => handleOpenEvaluation(block.id)}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>

                        </div>
                    </div>

                    <DragOverlay>
                        {activeDragId === 'new-topic-source' ? (
                            <div className="bg-indigo-600 text-white px-4 py-3 rounded-xl shadow-xl font-medium w-48 flex items-center gap-2 cursor-grabbing">
                                <Plus size={18} /> Nuevo Tema
                            </div>
                        ) : null}
                    </DragOverlay>

                </DndContext>

            </div>

            {/* Modals */}
            {selectedBlockId && blocks[selectedBlockId] && (
                <>
                    <DistributionModal
                        isOpen={distributionModalOpen}
                        onClose={() => setDistributionModalOpen(false)}
                        onConfirm={handleConfirmDistribution}
                        parentDuration={blocks[selectedBlockId].duration}
                    />
                    <EvaluationModal
                        isOpen={evaluationModalOpen}
                        onClose={() => setEvaluationModalOpen(false)}
                        onConfirm={handleConfirmEvaluation}
                        maxPoints={20 - totalPoints}
                    />
                </>
            )}

        </div>
    );
}

function DroppableRow({ id }: { id: number }) {
    const { setNodeRef, isOver } = useDroppable({ id: `week-${id}` });
    return (
        <div
            ref={setNodeRef}
            className={`h-32 border-b border-gray-200 border-dashed w-full transition-colors ${isOver ? 'bg-indigo-50/50' : ''}`}
        />
    );
}

function DraggableSource({ id }: { id: string }) {
    const { attributes, listeners, setNodeRef } = useDraggable({ id });
    return (
        <div ref={setNodeRef} {...listeners} {...attributes} className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white cursor-grab hover:bg-indigo-700 shadow-md transition-all active:scale-90" title="Nuevo Tema">
            <Plus size={24} />
        </div>
    );
}
