'use client';

import { useState, useEffect } from 'react';
import { X, Calendar, AlertCircle, RefreshCw, Layers, GraduationCap, CalendarDays, PencilRuler, Minus, Plus, ArrowRight } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { academicYearService, CreateAcademicYearDto, AcademicYear, Period } from '@/services/academic-year.service';
import { toast } from 'sonner';

interface AcademicYearModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    existingYears: AcademicYear[];
    yearToEdit?: AcademicYear | null;
}

// Helper to auto-split academic year dates into 3 equal periods
const autoSplitPeriods = (startStr: string, endStr: string, existingPeriods?: Period[]): Period[] => {
    if (!startStr || !endStr) return [];
    const start = new Date(startStr);
    const end = new Date(endStr);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) return [];

    const totalMs = end.getTime() - start.getTime();
    const totalDays = totalMs / (24 * 60 * 60 * 1000);
    const totalWeeks = Math.ceil(totalDays / 7);
    
    // Distribute weeks as evenly as possible
    const weeksP1 = Math.floor(totalWeeks / 3);
    const weeksP2 = Math.floor(totalWeeks / 3);
    // P3 gets whatever is left to cover the exact end date
    
    const p1Start = new Date(start);
    const p1End = new Date(p1Start.getTime() + (weeksP1 * 7 * 24 * 60 * 60 * 1000) - (24 * 60 * 60 * 1000));
    
    const p2Start = new Date(p1End.getTime() + (24 * 60 * 60 * 1000));
    const p2End = new Date(p2Start.getTime() + (weeksP2 * 7 * 24 * 60 * 60 * 1000) - (24 * 60 * 60 * 1000));
    
    const p3Start = new Date(p2End.getTime() + (24 * 60 * 60 * 1000));
    const p3End = new Date(end); // Force it to exactly match the cycle end date

    const fmt = (d: Date) => d.toISOString().split('T')[0];
    const names = ['Primer Lapso', 'Segundo Lapso', 'Tercer Lapso'];
    const dates = [
        { start: p1Start, end: p1End },
        { start: p2Start, end: p2End },
        { start: p3Start, end: p3End },
    ];

    return names.map((name, i) => {
        const existing = existingPeriods?.find(ep => ep.name === name);
        return {
            id: existing?.id,
            name,
            startDate: fmt(dates[i].start),
            endDate: fmt(dates[i].end),
            isActive: i === 0,
        };
    });
};

const fmtShort = (iso: string): string => {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const month = months[parseInt(m, 10) - 1] ?? m;
    return `${d} ${month} ${y}`;
};

export default function AcademicYearModal({ isOpen, onClose, onSuccess, existingYears = [], yearToEdit }: AcademicYearModalProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [isManual, setIsManual] = useState(false);
    const [startYear, setStartYear] = useState<number>(new Date().getFullYear());
    const [lapsoSplitMode, setLapsoSplitMode] = useState<'auto' | 'manual'>('auto');
    const [periods, setPeriods] = useState<Period[]>([
        { name: 'Primer Lapso', startDate: '', endDate: '', isActive: true },
        { name: 'Segundo Lapso', startDate: '', endDate: '', isActive: false },
        { name: 'Tercer Lapso', startDate: '', endDate: '', isActive: false },
    ]);

    const { register, handleSubmit, formState: { errors }, reset, setValue, watch, setError, clearErrors } = useForm<CreateAcademicYearDto>();

    const watchStartDate = watch('startDate');
    const watchEndDate = watch('endDate');

    // Init when opening
    useEffect(() => {
        if (isOpen) {
            if (yearToEdit) {
                setIsManual(true);
                setValue('name', yearToEdit.name);
                setValue('startDate', yearToEdit.startDate.split('T')[0]);
                setValue('endDate', yearToEdit.endDate.split('T')[0]);
                setValue('status', yearToEdit.status);
                if (yearToEdit.periods && yearToEdit.periods.length > 0) {
                    setPeriods(yearToEdit.periods.map(p => ({
                        id: p.id,
                        name: p.name,
                        startDate: p.startDate.split('T')[0],
                        endDate: p.endDate.split('T')[0],
                        isActive: p.isActive,
                    })));
                    setLapsoSplitMode('manual');
                } else {
                    setLapsoSplitMode('auto');
                }
            } else {
                setIsManual(false);
                setStartYear(new Date().getFullYear());
                reset({
                    name: '',
                    startDate: '',
                    endDate: '',
                    status: 'UPCOMING'
                });
                setLapsoSplitMode('auto');
            }
        }
    }, [isOpen, yearToEdit, setValue, reset]);

    // Derived values
    const endYear = startYear + 1;
    const calculatedName = `${startYear}-${endYear}`;

    // Auto-calculate dates logic
    useEffect(() => {
        if (!isManual && startYear) {
            const startDate = `${startYear}-08-20`;
            const endDate = `${endYear}-07-15`;

            setValue('name', calculatedName);
            setValue('startDate', startDate);
            setValue('endDate', endDate);
        }
    }, [startYear, endYear, isManual, setValue, calculatedName]);

    // Auto-calculate period splits
    useEffect(() => {
        if (lapsoSplitMode === 'auto' && watchStartDate && watchEndDate) {
            const split = autoSplitPeriods(watchStartDate, watchEndDate, yearToEdit?.periods);
            if (split.length > 0) {
                setPeriods(split);
            }
        }
    }, [lapsoSplitMode, watchStartDate, watchEndDate, yearToEdit]);

    // Validate for duplicates
    useEffect(() => {
        if (!isManual && startYear) {
            const isDuplicate = existingYears.some(y => y.name === calculatedName);
            if (isDuplicate) {
                setError('name', {
                    type: 'manual',
                    message: `El ciclo ${calculatedName} ya está registrado`
                });
            } else {
                clearErrors('name');
            }
        }
    }, [startYear, calculatedName, existingYears, isManual, setError, clearErrors]);

    // Close on Escape
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const handlePeriodChange = (index: number, field: keyof Period, value: any) => {
        setPeriods(prev => {
            const newPeriods = [...prev];
            newPeriods[index] = {
                ...newPeriods[index],
                [field]: value
            };
            return newPeriods;
        });
    };

    const validatePeriods = (): boolean => {
        if (!watchStartDate || !watchEndDate) return false;
        const mainStart = new Date(watchStartDate);
        const mainEnd = new Date(watchEndDate);

        for (let i = 0; i < periods.length; i++) {
            const p = periods[i];
            if (!p.startDate || !p.endDate) {
                toast.error(`Por favor, complete las fechas para el ${p.name}`);
                return false;
            }

            const start = new Date(p.startDate);
            const end = new Date(p.endDate);

            if (start >= end) {
                toast.error(`En el ${p.name}, la fecha de inicio debe ser anterior a la de fin.`);
                return false;
            }

            if (start < mainStart || end > mainEnd) {
                toast.error(`Las fechas del ${p.name} deben estar dentro del rango del año escolar (${watchStartDate} a ${watchEndDate}).`);
                return false;
            }

            // check overlap with next period
            if (i < periods.length - 1) {
                const nextP = periods[i + 1];
                if (nextP.startDate) {
                    const nextStart = new Date(nextP.startDate);
                    if (end >= nextStart) {
                        toast.error(`Las fechas del ${p.name} y del ${nextP.name} se superponen.`);
                        return false;
                    }
                }
            }
        }
        return true;
    };

    const onSubmit = async (data: CreateAcademicYearDto) => {
        try {
            if (!validatePeriods()) return;

            setIsLoading(true);

            // Construct payload with periods included!
            const periodPayload = periods.map(p => ({
                id: p.id,
                name: p.name,
                startDate: p.startDate,
                endDate: p.endDate,
                isActive: p.isActive
            }));

            if (yearToEdit) {
                // Update Mode
                const now = new Date();
                const start = new Date(data.startDate);
                const end = new Date(data.endDate);
                end.setHours(23, 59, 59, 999);

                let calculatedStatus: 'UPCOMING' | 'ACTIVE' | 'COMPLETED' = 'UPCOMING';

                if (now > end) {
                    calculatedStatus = 'COMPLETED';
                } else if (now >= start && now <= end) {
                    calculatedStatus = 'ACTIVE';
                }

                await academicYearService.updateAcademicYear(yearToEdit.id, {
                    name: data.name,
                    startDate: data.startDate,
                    endDate: data.endDate,
                    status: calculatedStatus,
                    periods: periodPayload
                });

                toast.success('Ciclo escolar y lapsos actualizados exitosamente');
            } else {
                // Create Mode
                const createData = (!isManual) ? {
                    name: calculatedName,
                    startDate: `${startYear}-08-20`,
                    endDate: `${endYear}-07-15`,
                } : {
                    name: data.name,
                    startDate: data.startDate,
                    endDate: data.endDate,
                };

                const now = new Date();
                const start = new Date(createData.startDate);
                const end = new Date(createData.endDate);
                end.setHours(23, 59, 59, 999);

                let calculatedStatus: 'UPCOMING' | 'ACTIVE' | 'COMPLETED' = 'UPCOMING';

                if (now > end) {
                    calculatedStatus = 'COMPLETED';
                } else if (now >= start && now <= end) {
                    calculatedStatus = 'ACTIVE';
                }

                const finalData = {
                    ...createData,
                    status: calculatedStatus,
                    periods: periodPayload
                };
                await academicYearService.createAcademicYear(finalData);
                toast.success('Ciclo escolar y lapsos creados exitosamente');
            }

            reset();
            onSuccess();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Error al procesar la solicitud');
        } finally {
            setIsLoading(false);
        }
    };

    const dotColors = ['bg-indigo-500', 'bg-emerald-500', 'bg-amber-500'];

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
            role="dialog"
            aria-modal="true"
            aria-label={yearToEdit ? 'Editar Ciclo Escolar' : 'Nuevo Ciclo Escolar'}
            onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
                {/* Header */}
                <div className="bg-gradient-to-r from-primary-600 to-indigo-500 px-7 py-5 flex items-start justify-between">
                    <div className="flex items-center gap-3.5">
                        <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center flex-shrink-0">
                            <GraduationCap className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white leading-tight">
                                {yearToEdit ? 'Editar Ciclo Escolar' : 'Nuevo Ciclo Escolar'}
                            </h2>
                            <p className="text-xs text-white/75 mt-0.5">
                                {yearToEdit ? 'Ajusta el periodo y sus lapsos' : 'Configura el periodo lectivo y los lapsos'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        type="button"
                        aria-label="Cerrar"
                        className="p-2 rounded-full text-white/70 hover:text-white hover:bg-white/15 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-y-auto">
                    {/* Hidden inputs to register form values in automatic mode */}
                    <input type="hidden" {...register('name')} />
                    <input type="hidden" {...register('startDate')} />
                    <input type="hidden" {...register('endDate')} />

                    <div className="px-7 py-6 space-y-6">
                        {/* ===== AUTO MODE: YEAR STEPPER ===== */}
                        {!isManual && !yearToEdit && (
                            <div className="text-center">
                                <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-3">Año escolar</p>
                                <div className="flex items-center justify-center gap-5">
                                    <button
                                        type="button"
                                        onClick={() => setStartYear(s => Math.max(2000, s - 1))}
                                        aria-label="Año anterior"
                                        className="w-11 h-11 rounded-full border-2 border-gray-200 text-gray-400 hover:text-primary-600 hover:border-primary-300 hover:bg-primary-50 flex items-center justify-center transition-all active:scale-90"
                                    >
                                        <Minus className="w-5 h-5" />
                                    </button>
                                    <div className="text-4xl font-extrabold tracking-tight text-gray-900 tabular-nums select-none">
                                        {startYear}<span className="text-gray-300 mx-2 font-light">—</span>{endYear}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setStartYear(s => Math.min(2100, s + 1))}
                                        aria-label="Año siguiente"
                                        className="w-11 h-11 rounded-full border-2 border-gray-200 text-gray-400 hover:text-primary-600 hover:border-primary-300 hover:bg-primary-50 flex items-center justify-center transition-all active:scale-90"
                                    >
                                        <Plus className="w-5 h-5" />
                                    </button>
                                </div>

                                <div className="flex items-center justify-center gap-2.5 mt-4 flex-wrap">
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary-50 border border-primary-100 text-xs font-semibold text-primary-700">
                                        <Calendar className="w-3.5 h-3.5" />
                                        20 Ago {startYear}
                                    </span>
                                    <ArrowRight className="w-4 h-4 text-gray-300" />
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary-50 border border-primary-100 text-xs font-semibold text-primary-700">
                                        <Calendar className="w-3.5 h-3.5" />
                                        15 Jul {endYear}
                                    </span>
                                </div>

                                {errors.name && (
                                    <div className="flex items-center justify-center gap-2 mt-4 text-red-600 bg-red-50 px-4 py-2.5 rounded-xl text-sm">
                                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                        <span>{errors.name.message}</span>
                                    </div>
                                )}

                                <button
                                    type="button"
                                    onClick={() => setIsManual(true)}
                                    className="mt-4 text-sm font-medium text-primary-600 hover:text-primary-700 underline-offset-4 hover:underline transition-colors"
                                >
                                    Editar fechas manualmente
                                </button>
                            </div>
                        )}

                        {/* ===== MANUAL MODE: CYCLE FIELDS ===== */}
                        {isManual && (
                            <div className="space-y-3.5">
                                <div className="flex items-center gap-2.5">
                                    <CalendarDays className="w-5 h-5 text-primary-600" />
                                    <span className="text-sm font-bold text-gray-900">Periodo del ciclo</span>
                                    {!yearToEdit && (
                                        <button
                                            type="button"
                                            onClick={() => setIsManual(false)}
                                            className="ml-auto text-xs font-medium text-gray-400 hover:text-primary-600 transition-colors"
                                        >
                                            Usar fechas automáticas
                                        </button>
                                    )}
                                </div>
                                <div className="grid grid-cols-3 gap-3">
                                    <div>
                                        <label htmlFor="cycleName" className="block text-xs font-semibold text-gray-500 mb-1.5">
                                            Nombre
                                        </label>
                                        <input
                                            id="cycleName"
                                            {...register('name', { required: 'El nombre es obligatorio' })}
                                            placeholder="2026-2027"
                                            className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="startDate" className="block text-xs font-semibold text-gray-500 mb-1.5">
                                            Inicio
                                        </label>
                                        <input
                                            id="startDate"
                                            {...register('startDate', { required: 'Fecha requerida' })}
                                            type="date"
                                            className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="endDate" className="block text-xs font-semibold text-gray-500 mb-1.5">
                                            Fin
                                        </label>
                                        <input
                                            id="endDate"
                                            {...register('endDate', { required: 'Fecha requerida' })}
                                            type="date"
                                            className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ===== LAPSOS ===== */}
                        <div className="pt-5 border-t border-gray-100 space-y-4">
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                                <div className="flex items-center gap-2">
                                    <Layers className="w-4 h-4 text-amber-500" />
                                    <span className="text-sm font-bold text-gray-900">Lapsos del ciclo</span>
                                </div>

                                <div className="flex bg-gray-100 p-1 rounded-full">
                                    <button
                                        type="button"
                                        onClick={() => setLapsoSplitMode('auto')}
                                        className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-full transition-all ${
                                            lapsoSplitMode === 'auto'
                                                ? 'bg-white text-slate-800 shadow-sm'
                                                : 'text-slate-500 hover:text-slate-700'
                                        }`}
                                    >
                                        <RefreshCw className="w-3.5 h-3.5" />
                                        Auto
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setLapsoSplitMode('manual')}
                                        className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-full transition-all ${
                                            lapsoSplitMode === 'manual'
                                                ? 'bg-white text-slate-800 shadow-sm'
                                                : 'text-slate-500 hover:text-slate-700'
                                        }`}
                                    >
                                        <PencilRuler className="w-3.5 h-3.5" />
                                        Manual
                                    </button>
                                </div>
                            </div>

                            {lapsoSplitMode === 'auto' && (
                                <p className="text-xs text-primary-700 bg-primary-50 px-3.5 py-2.5 rounded-xl border border-primary-100 leading-relaxed">
                                    Las fechas se reparten automáticamente en partes iguales según el periodo del ciclo.
                                </p>
                            )}

                            <div className="space-y-2.5">
                                {periods.map((period, index) => (
                                    <div
                                        key={period.name}
                                        className="flex items-center gap-3.5 px-4 py-3 rounded-xl bg-gray-50/70 border border-gray-100 hover:border-gray-200 transition-colors"
                                    >
                                        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotColors[index]}`} />
                                        <div className="w-36 flex-shrink-0">
                                            <p className="text-sm font-bold text-gray-800">
                                                {period.name === 'Primer Lapso' ? '1er Momento' : period.name === 'Segundo Lapso' ? '2do Momento' : '3er Momento'}
                                            </p>
                                            <p className="text-xs text-gray-400">{period.name}</p>
                                        </div>

                                        {lapsoSplitMode === 'auto' ? (
                                            <div className="flex-1 text-right text-xs font-medium text-gray-500 tabular-nums">
                                                {period.startDate && period.endDate
                                                    ? `${fmtShort(period.startDate)} → ${fmtShort(period.endDate)}`
                                                    : '—'}
                                            </div>
                                        ) : (
                                            <div className="flex-1 grid grid-cols-2 gap-3">
                                                <input
                                                    id={`period-start-${index}`}
                                                    type="date"
                                                    value={period.startDate}
                                                    onChange={(e) => handlePeriodChange(index, 'startDate', e.target.value)}
                                                    aria-label={`Inicio ${period.name}`}
                                                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                                                />
                                                <input
                                                    id={`period-end-${index}`}
                                                    type="date"
                                                    value={period.endDate}
                                                    onChange={(e) => handlePeriodChange(index, 'endDate', e.target.value)}
                                                    aria-label={`Cierre ${period.name}`}
                                                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                                                />
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="px-7 py-4 bg-gray-50/80 border-t border-gray-100 flex items-center justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-5 py-2.5 text-sm font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="px-6 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-primary-600 to-indigo-500 hover:from-primary-700 hover:to-indigo-600 rounded-xl shadow-lg shadow-primary-600/25 transition-all transform active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                        >
                            {isLoading ? 'Procesando...' : yearToEdit ? 'Guardar Cambios' : 'Crear Ciclo'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
