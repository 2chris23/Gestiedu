'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, X, Trash2, AlertCircle } from 'lucide-react';

/**
 * Alta y edición de una hora personal del profesor (planificación, guardia…).
 *
 * Se persiste de inmediato, sin pasar por "Guardar Cambios": es un registro
 * independiente que no pertenece a ninguna sección, así que mezclarlo en el
 * lote del horario de clases solo daría estados a medio guardar.
 */

export interface PersonalBlockDraft {
    id?: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    title: string;
    notes: string;
}

interface PersonalBlockModalProps {
    open: boolean;
    draft: PersonalBlockDraft | null;
    dayLabel: string;
    isSaving: boolean;
    isDeleting?: boolean;
    conflicts: any[];
    onClose: () => void;
    onSave: (draft: PersonalBlockDraft) => void;
    onDelete?: (id: string) => void;
}

export default function PersonalBlockModal({
    open,
    draft,
    dayLabel,
    isSaving,
    isDeleting = false,
    conflicts,
    onClose,
    onSave,
    onDelete,
}: PersonalBlockModalProps) {
    const [title, setTitle] = useState('');
    const [notes, setNotes] = useState('');

    useEffect(() => {
        setTitle(draft?.title ?? '');
        setNotes(draft?.notes ?? '');
    }, [draft]);

    if (!open || !draft) return null;

    const isEditing = Boolean(draft.id);
    const canSave = title.trim().length > 0 && !isSaving && !isDeleting;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={isEditing ? 'Editar hora personal' : 'Nueva hora personal'}>
            <div
                className="absolute inset-0 bg-black/40"
                onClick={() => (!isSaving && !isDeleting ? onClose() : undefined)}
            />

            <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100">
                <div className="flex items-start justify-between p-5 border-b border-gray-100">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">
                            {isEditing ? 'Editar hora personal' : 'Nueva hora personal'}
                        </h2>
                        <p className="text-xs text-gray-500 mt-0.5">
                            {dayLabel} · {draft.startTime} – {draft.endTime}
                        </p>
                    </div>
                    <button aria-label="Cerrar"
                        type="button"
                        onClick={onClose}
                        disabled={isSaving || isDeleting}
                        className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer disabled:opacity-50"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    <div>
                        <label htmlFor="pb-title" className="block text-sm font-medium text-gray-700 mb-1.5">
                            Título
                        </label>
                        <input
                            id="pb-title"
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            maxLength={100}
                            autoFocus
                            placeholder="Planificación, guardia, coordinación…"
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                    </div>

                    <div>
                        <label htmlFor="pb-notes" className="block text-sm font-medium text-gray-700 mb-1.5">
                            Descripción <span className="text-gray-400 font-normal">(opcional)</span>
                        </label>
                        <textarea
                            id="pb-notes"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={3}
                            placeholder="Para qué se reserva esta hora"
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                    </div>

                    {conflicts.length > 0 && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                            <div className="flex items-center gap-2 text-red-700 font-bold text-xs mb-1.5">
                                <AlertCircle size={14} />
                                No se guardó: la hora está ocupada
                            </div>
                            <ul className="space-y-1">
                                {conflicts.map((c, i) => (
                                    <li key={i} className="text-[11px] text-red-700 leading-snug">
                                        • {c.message}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between gap-3 p-5 border-t border-gray-100">
                    {isEditing && onDelete ? (
                        <button
                            type="button"
                            onClick={() => onDelete(draft.id as string)}
                            disabled={isSaving || isDeleting}
                            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                        >
                            {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                            Eliminar
                        </button>
                    ) : (
                        <span />
                    )}

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isSaving || isDeleting}
                            className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={() => onSave({ ...draft, title: title.trim(), notes: notes.trim() })}
                            disabled={!canSave}
                            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                                canSave
                                    ? 'bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer'
                                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            }`}
                        >
                            {isSaving && <Loader2 size={16} className="animate-spin" />}
                            {isEditing ? 'Guardar' : 'Crear'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
