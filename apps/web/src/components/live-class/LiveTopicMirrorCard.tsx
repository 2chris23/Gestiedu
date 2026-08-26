'use client';

import React, { useState, useEffect } from 'react';
import {
    BookOpen, Edit3, Plus, Save, X, Loader2, Sparkles, Trash2, CheckCircle2
} from 'lucide-react';
import { useSavePlanWeek, LiveClassPlanContent } from '@/hooks/useLiveClass';
import { DEFAULT_PLAN_COLUMNS, PlanColumnDef } from '@/components/evaluation/planColumns';
import { toast } from 'sonner';

interface Props {
    classroomId: string;
    subjectId: string;
    date: string;
    weekNumber?: number;
    weekRow?: any;
    planContent?: LiveClassPlanContent;
    planColumns?: PlanColumnDef[] | null;
    canEdit: boolean;
}

export default function LiveTopicMirrorCard({
    classroomId,
    subjectId,
    date,
    weekNumber,
    weekRow,
    planContent,
    planColumns,
    canEdit,
}: Props) {
    const savePlan = useSavePlanWeek();
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);

    // Las columnas activas vienen directamente del Plan de Evaluación (con sus títulos personalizados)
    const effectiveColumns: PlanColumnDef[] = React.useMemo(() => {
        if (planColumns && Array.isArray(planColumns) && planColumns.length > 0) {
            return planColumns;
        }
        return DEFAULT_PLAN_COLUMNS;
    }, [planColumns]);

    // Estado con los valores de cada columna (key -> string)
    const [formValues, setFormValues] = useState<Record<string, string>>({});
    // Bloques adicionales creados dinámicamente
    const [customBlocks, setCustomBlocks] = useState<Record<string, string>>({});
    // Estado para añadir nuevo bloque
    const [newBlockName, setNewBlockName] = useState('');
    const [isAddingBlock, setIsAddingBlock] = useState(false);

    // Sincronizar estado cuando cambia weekRow o effectiveColumns
    useEffect(() => {
        if (weekRow) {
            const vals: Record<string, string> = {};
            effectiveColumns.forEach((col) => {
                const v = (weekRow as any)[col.key];
                vals[col.key] = v !== null && v !== undefined ? String(v) : '';
            });

            // Leer campos de extraData si existen
            const extras: Record<string, string> = {};
            if (weekRow.extraData) {
                try {
                    const parsed = typeof weekRow.extraData === 'string' ? JSON.parse(weekRow.extraData) : weekRow.extraData;
                    Object.entries(parsed).forEach(([k, v]) => {
                        // Si no está ya en effectiveColumns, es un bloque extra
                        if (!effectiveColumns.some((c) => c.key === k)) {
                            extras[k] = String(v ?? '');
                        } else if (!vals[k] && v !== undefined && v !== null) {
                            vals[k] = String(v);
                        }
                    });
                } catch {
                    // ignorar json inválido
                }
            }

            setFormValues(vals);
            setCustomBlocks(extras);
        } else {
            // Inicializar vacío
            const emptyVals: Record<string, string> = {};
            effectiveColumns.forEach((col) => {
                emptyVals[col.key] = '';
            });
            setFormValues(emptyVals);
            setCustomBlocks({});
        }
    }, [weekRow, effectiveColumns]);

    const handleFieldChange = (key: string, value: string) => {
        setFormValues((prev) => ({ ...prev, [key]: value }));
    };

    const handleCustomBlockChange = (key: string, value: string) => {
        setCustomBlocks((prev) => ({ ...prev, [key]: value }));
    };

    const handleRemoveCustomBlock = (key: string) => {
        setCustomBlocks((prev) => {
            const copy = { ...prev };
            delete copy[key];
            return copy;
        });
    };

    const handleAddNewBlock = () => {
        if (!newBlockName.trim()) {
            toast.error('Escribe un nombre para el bloque');
            return;
        }
        const name = newBlockName.trim();
        setCustomBlocks((prev) => ({ ...prev, [name]: '' }));
        setNewBlockName('');
        setIsAddingBlock(false);
    };

    const handleSave = async () => {
        try {
            // Construir payload con todos los campos
            const valuesToSave: Record<string, any> = {};

            effectiveColumns.forEach((col) => {
                const raw = formValues[col.key];
                if (col.numeric) {
                    valuesToSave[col.key] = raw !== '' && raw !== undefined ? parseFloat(raw) : null;
                } else {
                    valuesToSave[col.key] = raw !== undefined ? raw.trim() : '';
                }
            });

            // Añadir bloques custom
            Object.entries(customBlocks).forEach(([k, v]) => {
                valuesToSave[k] = v.trim();
            });

            await savePlan.mutateAsync({
                classroomId,
                subjectId,
                date,
                values: valuesToSave,
                columns: effectiveColumns,
            });

            setIsEditModalOpen(false);
            toast.success('Plan de evaluación actualizado y sincronizado');
        } catch {
            // error manejado por el hook
        }
    };

    // Título principal (TEMA GENERADOR)
    const displayTitle = formValues['title'] || weekRow?.title || planContent?.headers?.[0]?.title || '';

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-full">
            {/* Header de la tarjeta */}
            <div className="p-4 sm:p-5 border-b border-gray-100 bg-gradient-to-r from-emerald-500/5 via-teal-500/5 to-transparent flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-xs">
                        <BookOpen className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md">
                                Plan de Evaluación
                            </span>
                            {weekNumber && (
                                <span className="text-[11px] font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">
                                    Semana {weekNumber}
                                </span>
                            )}
                        </div>
                        <h2 className="text-base font-bold text-gray-900 mt-0.5">
                            Tema y Contenido Pedagógico
                        </h2>
                    </div>
                </div>

                {canEdit && (
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                setIsAddingBlock(true);
                                setIsEditModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg shadow-2xs transition-colors"
                            title="Añadir bloque adicional"
                        >
                            <Plus className="w-3.5 h-3.5 text-gray-500" />
                            <span className="hidden sm:inline">Añadir Bloque</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsEditModalOpen(true)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors"
                        >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Editar</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Visualización del Tema y Bloques (Espejo con el Plan) */}
            <div className="p-5 space-y-4 flex-1 flex flex-col justify-between">
                <div className="space-y-3.5">
                    {/* Tema Generador (Primera columna) */}
                    <div>
                        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                            {effectiveColumns[0]?.label || 'TEMA GENERADOR'}
                        </p>
                        {displayTitle ? (
                            <h3 className="text-sm sm:text-base font-semibold text-gray-900 leading-relaxed bg-emerald-50/50 p-3 rounded-xl border border-emerald-100/80">
                                {displayTitle}
                            </h3>
                        ) : (
                            <div className="p-3.5 rounded-xl border border-dashed border-gray-200 bg-gray-50/50 text-center">
                                <p className="text-xs text-gray-400">
                                    No hay tema generador registrado para esta semana.
                                </p>
                                {canEdit && (
                                    <button
                                        type="button"
                                        onClick={() => setIsEditModalOpen(true)}
                                        className="mt-1.5 text-xs font-semibold text-emerald-600 hover:underline"
                                    >
                                        + Agregar tema ahora
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Grilla de las demás columnas del plan (con sus nombres y valores exactos) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {effectiveColumns.slice(1).map((col) => {
                            const val = formValues[col.key];
                            if (!val && val !== '0') return null;
                            return (
                                <div key={col.key} className="bg-gray-50/80 p-2.5 rounded-xl border border-gray-100 text-xs">
                                    <span className="font-bold text-gray-600 uppercase tracking-wider block text-[10px] truncate">
                                        {col.label}:
                                    </span>
                                    <span className="text-gray-800 font-medium block truncate mt-0.5">
                                        {col.numeric && col.key === 'ponderacion' ? `${val}%` : col.numeric && col.key === 'puntos' ? `${val} pts` : String(val)}
                                    </span>
                                </div>
                            );
                        })}

                        {/* Bloques extra personalizados */}
                        {Object.entries(customBlocks).map(([key, val]) => (
                            <div key={key} className="bg-emerald-50/40 p-2.5 rounded-xl border border-emerald-100 text-xs">
                                <span className="font-bold text-emerald-800 uppercase tracking-wider block text-[10px] truncate">
                                    {key}:
                                </span>
                                <span className="text-gray-800 font-medium block truncate mt-0.5">
                                    {val || '—'}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer sincronizado */}
                <div className="pt-2.5 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-400">
                    <span className="flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        Sincronizado con Plan de Evaluación
                    </span>
                    <span className="text-[10px] text-gray-400">
                        {canEdit ? 'Espejo en tiempo real' : 'Solo lectura'}
                    </span>
                </div>
            </div>

            {/* ===== MODAL DE EDICIÓN DEL TEMA Y PLAN ===== */}
            {isEditModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
                    <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
                        {/* Header Modal */}
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                            <div className="flex items-center gap-2">
                                <BookOpen className="w-5 h-5 text-emerald-600" />
                                <h3 className="text-base font-bold text-gray-900">
                                    Editar Tema y Plan (Semana {weekNumber || '1'})
                                </h3>
                            </div>
                            <button
                                onClick={() => setIsEditModalOpen(false)}
                                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-200 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Formulario generado 100% dinámicamente con los títulos del Plan de Evaluación */}
                        <div className="p-6 space-y-4 overflow-y-auto flex-1">
                            {effectiveColumns.map((col, index) => {
                                const isFirst = index === 0;
                                const isNumeric = col.numeric;
                                const currentVal = formValues[col.key] || '';

                                return (
                                    <div key={col.key} className={isFirst ? 'pb-2 border-b border-gray-100' : ''}>
                                        <label className="block text-xs font-bold uppercase text-gray-700 mb-1.5">
                                            {col.label} {isFirst ? '*' : ''}
                                        </label>
                                        {isNumeric ? (
                                            <input
                                                type="number"
                                                min="0"
                                                max={col.key === 'ponderacion' ? 100 : 20}
                                                value={currentVal}
                                                onChange={(e) => handleFieldChange(col.key, e.target.value)}
                                                placeholder="0"
                                                className="w-full sm:w-1/2 px-3.5 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                                            />
                                        ) : col.key === 'textContent' || col.key === 'criterios' ? (
                                            <textarea
                                                value={currentVal}
                                                onChange={(e) => handleFieldChange(col.key, e.target.value)}
                                                rows={2}
                                                placeholder={`Escribir ${col.label.toLowerCase()}...`}
                                                className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none resize-none"
                                            />
                                        ) : (
                                            <input
                                                type="text"
                                                value={currentVal}
                                                onChange={(e) => handleFieldChange(col.key, e.target.value)}
                                                placeholder={`Escribir ${col.label.toLowerCase()}...`}
                                                className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                                            />
                                        )}
                                    </div>
                                );
                            })}

                            {/* Bloques extra personalizados */}
                            {Object.entries(customBlocks).map(([key, val]) => (
                                <div key={key} className="p-3 bg-emerald-50/40 rounded-xl border border-emerald-100">
                                    <div className="flex items-center justify-between mb-1">
                                        <label className="text-xs font-bold uppercase text-emerald-800">
                                            {key}
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveCustomBlock(key)}
                                            className="text-gray-400 hover:text-rose-500 p-1 transition-colors"
                                            title="Eliminar este bloque"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                    <input
                                        type="text"
                                        value={val}
                                        onChange={(e) => handleCustomBlockChange(key, e.target.value)}
                                        placeholder={`Escribir contenido de ${key}...`}
                                        className="w-full px-3 py-1.5 border border-emerald-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
                                    />
                                </div>
                            ))}

                            {/* Sección para añadir nuevo bloque */}
                            {isAddingBlock ? (
                                <div className="p-3.5 bg-gray-50 rounded-xl border border-dashed border-gray-300 space-y-2">
                                    <label className="block text-xs font-bold uppercase text-gray-700">
                                        Nombre del Nuevo Bloque
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={newBlockName}
                                            onChange={(e) => setNewBlockName(e.target.value)}
                                            placeholder="Ej: FORMA DE EVALUAR, PROYECTO PEIC..."
                                            className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleAddNewBlock}
                                            className="px-3.5 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition-colors"
                                        >
                                            Añadir
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setIsAddingBlock(false)}
                                            className="px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-200 rounded-lg"
                                        >
                                            Cancelar
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setIsAddingBlock(true)}
                                    className="w-full py-2 border border-dashed border-gray-300 hover:border-emerald-500 hover:bg-emerald-50/50 text-gray-600 hover:text-emerald-700 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    Añadir otro bloque personalizado
                                </button>
                            )}
                        </div>

                        {/* Footer Modal */}
                        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setIsEditModalOpen(false)}
                                className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-200 rounded-xl transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={savePlan.isPending}
                                className="px-5 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
                            >
                                {savePlan.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                Guardar Cambios
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
