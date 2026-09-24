'use client';

import * as React from 'react';
import { BookOpen, CalendarClock, Ban, CheckCircle2, Clock } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ActividadDelDia, LiveOverviewSubject } from '@/hooks/useLiveClass';
import { cn } from '@/lib/utils';
import { useQuienSoy } from '@/hooks/useQuienSoy';
import { BotonesDeAsistencia } from '@/components/asistencia/AsistenciaDelAlumno';

/**
 * ENTRAR A UNA CLASE SIENDO ALUMNO
 *
 * El alumno veía su horario y no podía abrir nada: los bloques solo respondían
 * al profesor. Lo que necesita ver es lo de esa hora —el tema, qué hay que
 * hacer y su nota si ya se la pusieron—, y nada más.
 *
 * Es SOLO LECTURA, a propósito: el alumno no sube, no edita y no agrega nada
 * (y el servidor tampoco se lo permitiría). Lo único que hace es identificarse
 * para la asistencia por QR, que decide el servidor.
 */

interface Props {
    abierto: boolean;
    alCerrar: () => void;
    materia?: string;
    hora?: string;
    profesor?: string;
    aula?: string;
    fecha?: string;
    reemplazaA?: string;
    datos?: LiveOverviewSubject | null;
}

const NOMBRE_DEL_TIPO: Record<string, string> = {
    TAREA: 'Tarea',
    EXAMEN: 'Examen',
    EVALUACION: 'Evaluación',
    ACTIVIDAD: 'Actividad',
};

function Actividad({ a }: { a: ActividadDelDia }) {
    const tieneNota = typeof a.miNota === 'number';
    return (
        <li className="rounded-xl border border-gray-200 bg-white p-3">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900">{a.title}</p>
                    <p className="mt-0.5 text-xs text-gray-600">
                        {a.tag || NOMBRE_DEL_TIPO[a.type] || a.type}
                        {a.paraOtroDia && ' · dejada para otro día'}
                    </p>
                </div>
                {tieneNota ? (
                    <span className="shrink-0 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-900">
                        {a.miNota} / {a.maxScore ?? 20}
                    </span>
                ) : (
                    <span className="shrink-0 rounded-full border border-gray-300 bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-700">
                        Sin nota
                    </span>
                )}
            </div>
        </li>
    );
}

export function ClaseDelAlumnoDialogo({
    abierto,
    alCerrar,
    materia,
    hora,
    profesor,
    aula,
    fecha,
    reemplazaA,
    datos,
}: Props) {
    const { yo } = useQuienSoy();
    const actividades = datos?.actividades ?? [];
    const deHoy = actividades.filter((a) => !a.paraOtroDia);
    const paraOtroDia = actividades.filter((a) => a.paraOtroDia);

    return (
        <Dialog open={abierto} onOpenChange={(v) => !v && alCerrar()}>
            <DialogContent className="max-h-[92dvh] max-w-lg overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{materia || 'Clase'}</DialogTitle>
                    <DialogDescription>
                        {[fecha, hora, profesor, aula].filter(Boolean).join(' · ')}
                    </DialogDescription>
                </DialogHeader>

                {/* Pasar asistencia con QR: solo el propio alumno (el representante mira). */}
                {yo?.role === 'STUDENT' && !datos?.suspendida && <BotonesDeAsistencia antes={alCerrar} />}

                {datos?.suspendida && (
                    <p className="flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-900">
                        <Ban size={16} /> Esta clase fue suspendida
                    </p>
                )}

                {reemplazaA && (
                    <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
                        Reemplaza a {reemplazaA}
                    </p>
                )}

                <section className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-600">
                        <BookOpen size={14} /> {datos?.firstColumnLabel || 'Tema Generador'}
                        {datos?.weekNumber ? <span className="font-medium normal-case">· Semana {datos.weekNumber}</span> : null}
                    </h3>
                    <p className={cn('mt-1 text-sm', datos?.temaGenerador ? 'font-semibold text-gray-900' : 'italic text-gray-600')}>
                        {datos?.temaGenerador || 'El profesor aún no registró el tema de esta semana'}
                    </p>
                </section>

                <section>
                    <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-600">
                        <Clock size={14} /> Para esta clase
                    </h3>
                    {deHoy.length === 0 ? (
                        <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-700">
                            <CheckCircle2 size={15} className="text-emerald-600" /> No hay nada pendiente para hoy
                        </p>
                    ) : (
                        <ul className="mt-2 space-y-2">
                            {deHoy.map((a) => (
                                <Actividad key={a.id} a={a} />
                            ))}
                        </ul>
                    )}
                </section>

                {paraOtroDia.length > 0 && (
                    <section>
                        <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-600">
                            <CalendarClock size={14} /> Se dejó en esta clase para otro día
                        </h3>
                        <ul className="mt-2 space-y-2">
                            {paraOtroDia.map((a) => (
                                <Actividad key={a.id} a={a} />
                            ))}
                        </ul>
                    </section>
                )}
            </DialogContent>
        </Dialog>
    );
}

export default ClaseDelAlumnoDialogo;
