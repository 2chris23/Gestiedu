import { EditorBlock } from './TeacherScheduleEditor';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { X, AlertCircle, Plus, UserCog } from 'lucide-react';

export function BlockCard({
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

/** Asignación de la barra lateral (arrastrable si no es solo lectura). */
export function DraggableAssignment({ assignment, readOnly = false }: { assignment: any; readOnly?: boolean }) {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `assignment-${assignment.id}`,
        data: { type: 'sidebar-assignment', assignment },
        disabled: readOnly,
    });

    return (
        <div
            ref={setNodeRef}
            {...(readOnly ? {} : listeners)}
            {...(readOnly ? {} : attributes)}
            className={`p-2 rounded-md shadow-sm text-xs border ${readOnly ? '' : 'cursor-grab active:cursor-grabbing'} ${isDragging ? 'opacity-50' : 'opacity-100'}`}
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
    readOnly = false,
}: {
    block: EditorBlock;
    onRemove: () => void;
    onEdit: () => void;
    hasConflict?: boolean;
    stackIndex?: number;
    stackSize?: number;
    readOnly?: boolean;
}) {
    // El id es el del BLOQUE, no el de la celda: si dos bloques comparten celda,
    // con el id de la celda se pisarían y solo uno sería arrastrable.
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `grid-${block.id}`,
        data: { type: 'grid-block', block },
        disabled: readOnly,
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
            {...(readOnly ? {} : listeners)}
            {...(readOnly ? {} : attributes)}
            onClick={block.isPersonal && !readOnly ? onEdit : undefined}
            className={`${stacked ? 'absolute left-1 right-1' : 'absolute inset-1'} group ${readOnly ? '' : 'cursor-grab active:cursor-grabbing'} ${
                isDragging ? 'opacity-40' : ''
            }`}
            style={{ zIndex: isDragging ? 10 : 1, ...position }}
        >
            <BlockCard block={block} hasConflict={hasConflict} compact={stacked} />
            {!block.isPersonal && !readOnly && (
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

export function DroppableCell({
    id,
    cellBlocks,
    onRemove,
    onEdit,
    onCreatePersonal,
    hasConflict,
    readOnly = false,
}: {
    id: string;
    cellBlocks: EditorBlock[];
    onRemove: (block: EditorBlock) => void;
    onEdit: (block: EditorBlock) => void;
    onCreatePersonal: () => void;
    hasConflict?: boolean;
    readOnly?: boolean;
}) {
    const { isOver, setNodeRef } = useDroppable({ id, disabled: readOnly });
    // Dos o más bloques en la misma celda son, por definición, un choque.
    const shared = cellBlocks.length > 1;

    return (
        <div
            ref={setNodeRef}
            className={`relative h-16 transition-colors group/cell ${!readOnly && isOver ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-300' : ''}`}
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
                        readOnly={readOnly}
                    />
                ))
            ) : !readOnly ? (
                <button
                    type="button"
                    onClick={onCreatePersonal}
                    title="Reservar esta hora para el profesor"
                    className="absolute inset-1 flex items-center justify-center rounded-md opacity-0 group-hover/cell:opacity-100 text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all cursor-pointer"
                >
                    <Plus size={14} />
                </button>
            ) : null}
        </div>
    );
}
