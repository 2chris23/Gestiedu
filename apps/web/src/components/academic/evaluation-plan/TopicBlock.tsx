
import React, { useState, useEffect } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { useEvaluationPlanStore, TopicBlock as ITopicBlock } from './store/evaluation-store';
import { GripVertical, Layers, GraduationCap, Layout, ChevronDown } from 'lucide-react';

interface Props {
    block: ITopicBlock;
    onAddSubtopics?: () => void;
    onAddEvaluation?: () => void;
}

const getPastelColor = (str: string) => {
    const colors = [
        'bg-blue-50 border-blue-200 text-blue-900 group-hover:border-blue-300',
        'bg-emerald-50 border-emerald-200 text-emerald-900 group-hover:border-emerald-300',
        'bg-amber-50 border-amber-200 text-amber-900 group-hover:border-amber-300',
        'bg-violet-50 border-violet-200 text-violet-900 group-hover:border-violet-300',
        'bg-rose-50 border-rose-200 text-rose-900 group-hover:border-rose-300',
        'bg-cyan-50 border-cyan-200 text-cyan-900 group-hover:border-cyan-300',
    ];
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
};

export default function TopicBlock({ block, onAddSubtopics, onAddEvaluation }: Props) {
    const { resizeBlock } = useEvaluationPlanStore();
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: block.id,
    });

    const aesthetics = getPastelColor(block.title + block.id);
    const isParent = !block.parentId;
    const hasChildren = block.childrenIds && block.childrenIds.length > 0;
    const blockPoints = block.evaluations?.reduce((acc, ev) => acc + ev.points, 0) || 0;

    // Resize Logic
    const handleResizeStart = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const startY = e.clientY;
        const startDuration = block.duration;
        const rowHeight = 128; // Must match the Builder's row height

        const onMove = (moveEvent: PointerEvent) => {
            const deltaY = moveEvent.clientY - startY;
            const deltaWeeks = Math.round(deltaY / rowHeight);
            const newDuration = Math.max(1, startDuration + deltaWeeks);

            // Just local visual feedback could go here, but for MVP we rely on store update on UP
        };

        const onUp = (upEvent: PointerEvent) => {
            const deltaY = upEvent.clientY - startY;
            const deltaWeeks = Math.round(deltaY / rowHeight);
            const newDuration = Math.max(1, startDuration + deltaWeeks);

            if (newDuration !== block.duration) {
                resizeBlock(block.id, newDuration);
            }

            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
    };

    return (
        <div
            ref={setNodeRef}
            className={`
                w-full h-full rounded-xl border-2 transition-all duration-200 group flex flex-col items-start relative shadow-sm hover:shadow-lg
                ${aesthetics} 
                ${isDragging ? 'opacity-50 ring-4 ring-indigo-400 rotate-2 z-50 scale-105' : 'hover:scale-[1.01]'}
            `}
        >
            {/* Header / Grab Area */}
            <div className="flex items-start w-full gap-2 p-3 pb-0">
                <div
                    {...listeners}
                    {...attributes}
                    className="cursor-pointer mt-0.5 text-current opacity-40 hover:opacity-100 transition-opacity p-1 -ml-1 rounded hover:bg-black/5"
                >
                    <GripVertical size={18} />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="font-bold text-base leading-tight line-clamp-2 pr-6">
                        {block.title}
                    </div>
                    <div className="text-[11px] uppercase font-bold opacity-60 mt-1 tracking-wide">
                        {block.duration} Semana{block.duration > 1 ? 's' : ''}
                    </div>
                </div>
            </div>

            {/* Badges / Indicators */}
            <div className="flex flex-wrap gap-2 mt-auto w-full p-3 pt-2 border-t border-black/5 pb-5">
                {blockPoints > 0 && (
                    <div className="text-xs font-bold px-2.5 py-1 rounded-lg bg-white/60 border border-black/5 flex items-center gap-1.5 shadow-sm">
                        <GraduationCap size={12} className="text-amber-600" />
                        <span className="text-gray-800">{blockPoints} pts</span>
                    </div>
                )}
                {hasChildren && (
                    <div className="text-xs font-bold px-2.5 py-1 rounded-lg bg-white/60 border border-black/5 flex items-center gap-1.5 shadow-sm">
                        <Layout size={12} className="text-indigo-600" />
                        <span className="text-gray-800">{block.childrenIds?.length} Sub</span>
                    </div>
                )}
            </div>

            {/* Hover Actions */}
            <div className="absolute top-2 right-2 flex flex-col gap-1 transform translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all duration-200">
                {isParent && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onAddSubtopics?.(); }}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="p-2 bg-white rounded-lg text-indigo-600 shadow-md border border-indigo-100 hover:bg-indigo-50 hover:text-indigo-800 transition-colors"
                        title="Dividir en Subtemas"
                    >
                        <Layers size={16} />
                    </button>
                )}

                <button
                    onClick={(e) => { e.stopPropagation(); onAddEvaluation?.(); }}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="p-2 bg-white rounded-lg text-emerald-600 shadow-md border border-emerald-100 hover:bg-emerald-50 hover:text-emerald-800 transition-colors"
                    title="Evaluar (Asignar Nota)"
                >
                    <GraduationCap size={16} />
                </button>
            </div>

            {/* Resize Handle (Bottom) */}
            <div
                onPointerDown={handleResizeStart}
                className="absolute bottom-0 left-0 right-0 h-4 cursor-s-resize flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-black/5 transition-all rounded-b-xl"
            >
                <div className="w-12 h-1 rounded-full bg-black/10"></div>
            </div>
        </div>
    );
}
