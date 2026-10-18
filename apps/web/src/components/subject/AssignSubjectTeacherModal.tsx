'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, Minus, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import UserAvatar from '@/components/ui/UserAvatar';
import { useTeachers } from '@/hooks/useTeachers';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useAcademicConfig } from '@/hooks/useAcademicConfig';
import { useAssignTeacherToSubject, useUpdateClassroomSubject } from '@/hooks/useClassroomSubjects';
import { turnosDeLaConfig } from '@/lib/franjas-del-horario';
import { BarraDeCarga, colorDeLaCarga, estadoDeLaCarga, horas, type EstadoDeLaCarga } from '@/lib/carga-horaria';
import api from '@/lib/axios';
import { cn } from '@/lib/utils';

interface AssignModalProps {
    sectionId: string;
    sectionName: string;
    subjectSlug: string;
    currentTeacherId?: string;
    initialWeeklyBlocks?: number;
    /** El turno de la sección: la hora de clase de la tarde puede durar otra cosa. */
    turno?: string;
    onClose: () => void;
}

interface CargaDelProfesor {
    total: number;
    cargo: number;
    horasDelCargo: number | null;
    estado: EstadoDeLaCarga;
}

/**
 * ASIGNAR EL PROFESOR DE UNA CLASE (y sus bloques)
 *
 * Cada profesor dice cuánto lleva ya y contra qué se mide: sus horas del
 * cargo o, sin ellas, el máximo del liceo (`personal.service`, una sola
 * cuenta). Antes: 45 min por bloque y «30 – 40 h» fijos para todos.
 */
export function AssignSubjectTeacherModal({ sectionId, sectionName, subjectSlug, currentTeacherId, initialWeeklyBlocks, turno, onClose }: AssignModalProps) {
    const [buscar, setBuscar] = useState('');
    const [elegido, setElegido] = useState(currentTeacherId || '');
    const [bloques, setBloques] = useState(initialWeeklyBlocks || 4);

    const { data: config } = useAcademicConfig();
    const duracion = useMemo(() => {
        const turnos = turnosDeLaConfig(config?.schedule);
        return (turno === 'TARDE' ? turnos.TARDE : turnos.MANANA).duracion;
    }, [config, turno]);
    const horasDeEsta = Math.round(((bloques * duracion) / 60) * 100) / 100;

    const { data: reglas } = useQuery({
        queryKey: ['reglas-carga-horaria'],
        queryFn: async () => (await api.get('/institutes/current/carga-horaria')).data.data as { minimo: number; maximo: number },
    });

    const debounced = useDebouncedValue(buscar, 300);
    const { data: teachersData, isLoading } = useTeachers(debounced);
    const profes: any[] = Array.isArray(teachersData) ? teachersData : [];
    const asignar = useAssignTeacherToSubject();
    const ponerBloques = useUpdateClassroomSubject();
    const qc = useQueryClient();

    const cargaDe = (t: any): CargaDelProfesor => {
        const total = Number(t.cargaHoraria?.total ?? t.totalWeeklyHours ?? 0);
        const cargo = Number(t.cargaHoraria?.cargo ?? reglas?.maximo ?? 40);
        return { total, cargo, horasDelCargo: t.cargaHoraria?.horasDelCargo ?? null, estado: t.cargaHoraria?.estado ?? 'POR_DEBAJO' };
    };

    const elProfe = profes.find((t) => t.id === elegido);
    // Si ya es suyo, sus horas de hoy ya cuentan esta clase: no se suman dos veces.
    const proyeccion = elProfe
        ? (() => {
              const c = cargaDe(elProfe);
              const base = elegido === currentTeacherId ? Math.max(0, c.total - ((initialWeeklyBlocks || 0) * duracion) / 60) : c.total;
              const total = Math.round((base + horasDeEsta) * 100) / 100;
              return { ...c, antes: c.total, total, estado: estadoDeLaCarga(total, reglas ?? { minimo: 30, maximo: 40 }, c.horasDelCargo) };
          })()
        : null;

    const guardar = async () => {
        if (!elegido) return toast.error('Elige un profesor');
        try {
            await asignar.mutateAsync({ classroomId: sectionId, subjectId: subjectSlug, data: { teacherId: elegido } });
            // Las horas las pone el servidor: los bloques por la hora de clase del turno.
            await ponerBloques.mutateAsync({ classroomId: sectionId, subjectId: subjectSlug, data: { weeklyBlocks: bloques } });
            for (const k of ['subject', 'subjects', 'classroomSubject', 'teachers', 'profesores']) qc.invalidateQueries({ queryKey: [k] });
            toast.success('Profesor asignado');
            onClose();
        } catch {
            // Los ganchos ya dicen qué pasó.
        }
    };
    const guardando = asignar.isPending || ponerBloques.isPending;

    return (
        <Dialog open onOpenChange={(v) => !v && onClose()}>
            <DialogContent
                aria-label="Asignar Profesor"
                className="flex max-h-[calc(100dvh-2rem)] max-w-lg flex-col gap-0 overflow-hidden rounded-[28px] bg-gray-50 p-0 sm:rounded-[28px]"
            >
                <DialogHeader className="shrink-0 px-5 pb-3 pr-14 pt-5 text-left">
                    <DialogTitle className="text-lg font-bold text-gray-900">Asignar profesor</DialogTitle>
                    <DialogDescription className="text-sm text-gray-600">{sectionName}</DialogDescription>
                </DialogHeader>

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-4">
                    {/* Los bloques: menos y más, con lo que suman. */}
                    <div className="flex items-center gap-3 rounded-[22px] bg-white px-4 py-3 ring-1 ring-gray-200">
                        <span className="min-w-0 flex-1">
                            <span className="block text-[15px] font-medium text-gray-900">Bloques a la semana</span>
                            <span className="block text-sm text-gray-600">
                                {horas(horasDeEsta)} h · clases de {duracion} min
                            </span>
                        </span>
                        <button
                            type="button"
                            aria-label="Un bloque menos"
                            disabled={bloques <= 1}
                            onClick={() => setBloques((b) => Math.max(1, b - 1))}
                            className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40"
                        >
                            <Minus className="h-4 w-4" aria-hidden />
                        </button>
                        <span className="w-8 text-center text-2xl font-bold tabular-nums text-gray-900" aria-live="polite" aria-label={`${bloques} bloques`}>
                            {bloques}
                        </span>
                        <button
                            type="button"
                            aria-label="Un bloque más"
                            disabled={bloques >= 20}
                            onClick={() => setBloques((b) => Math.min(20, b + 1))}
                            className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40"
                        >
                            <Plus className="h-4 w-4" aria-hidden />
                        </button>
                    </div>

                    <label className="relative block">
                        <span className="sr-only">Buscar profesor</span>
                        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden />
                        <input
                            value={buscar}
                            onChange={(e) => setBuscar(e.target.value)}
                            placeholder="Buscar profesor"
                            className="!h-12 w-full !rounded-full !border-0 !bg-white pl-11 pr-4 text-[15px] !ring-1 !ring-gray-200 focus:!ring-2 focus:!ring-indigo-500"
                        />
                    </label>

                    <ul className="divide-y divide-gray-100 overflow-hidden rounded-[22px] bg-white ring-1 ring-gray-200" aria-label="Profesores">
                        {isLoading ? (
                            <li className="flex items-center justify-center gap-2 py-8 text-sm text-gray-600">
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando profesores
                            </li>
                        ) : profes.length === 0 ? (
                            <li className="py-8 text-center text-sm text-gray-600">No hay profesores con ese nombre</li>
                        ) : (
                            profes.map((t) => {
                                const c = cargaDe(t);
                                const esta = t.id === elegido;
                                const nombre = `${t.firstName ?? ''} ${t.lastName ?? ''}`.trim() || 'Sin nombre';
                                return (
                                    <li key={t.id}>
                                        <button
                                            type="button"
                                            aria-pressed={esta}
                                            onClick={() => setElegido(t.id)}
                                            className={cn('flex w-full items-center gap-3 px-4 py-3 text-left transition-colors', esta ? 'bg-indigo-50' : 'hover:bg-gray-50')}
                                        >
                                            <UserAvatar name={nombre} src={t.avatar} className="h-10 w-10 shrink-0" initialsClassName="text-xs" />
                                            <span className="min-w-0 flex-1">
                                                <span className="flex items-baseline justify-between gap-2">
                                                    <span className="truncate text-[15px] font-medium text-gray-900">{nombre}</span>
                                                    <span className={cn('shrink-0 text-sm font-semibold tabular-nums', colorDeLaCarga(c.estado).texto)}>
                                                        {horas(c.total)} / {c.cargo} h
                                                    </span>
                                                </span>
                                                <BarraDeCarga total={c.total} cargo={c.cargo} estado={c.estado} className="mt-1.5" />
                                            </span>
                                            {esta && <Check className="h-5 w-5 shrink-0 text-indigo-600" aria-hidden />}
                                        </button>
                                    </li>
                                );
                            })
                        )}
                    </ul>
                </div>

                {/* Lo que quedaría: sus horas de hoy → con esta clase. */}
                <div className="zona-segura-abajo shrink-0 space-y-3 border-t border-gray-200 bg-gray-50 px-5 pb-5 pt-3">
                    {proyeccion && (
                        <p className={cn('rounded-[18px] px-4 py-2.5 text-sm', colorDeLaCarga(proyeccion.estado).fondo)} aria-live="polite">
                            <span className="font-semibold">
                                {horas(proyeccion.antes)} → {horas(proyeccion.total)} h
                            </span>{' '}
                            de {proyeccion.cargo} h{proyeccion.horasDelCargo ? ' de su cargo' : ' (el máximo del liceo)'}
                            {proyeccion.estado === 'SOBRECARGA' && ' · se pasa'}
                        </p>
                    )}
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={guardando}
                            className="min-h-[48px] flex-1 rounded-full bg-white px-4 text-sm font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-100 disabled:opacity-60"
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={guardar}
                            disabled={guardando || !elegido}
                            className="flex min-h-[48px] flex-[2] items-center justify-center gap-2 rounded-full bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                        >
                            {guardando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                            Asignar
                        </button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
