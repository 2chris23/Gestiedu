'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { finDeAno, type EstadoDelFinDeAno } from '@/lib/fin-de-ano';
import { calendarioComoElMPPE } from '@/lib/calendario-mppe';
import { getApiErrorMessage } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';

/**
 * PASO 5 — EL AÑO SIGUIENTE
 *
 * Se crea desde aquí, con el calendario del MPPE (editable después) y
 * copiando la estructura de este año: las mismas secciones por grado y turno
 * con su capacidad, y cada una con sus materias y sus horas. Si se pide,
 * también los profesores (guías y de cada materia) y los horarios. Sin año
 * siguiente no se cierra.
 */

const fechaCorta = (ymd: string) => {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('es-VE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

export default function PasoAnoSiguiente({ estado }: { estado: EstadoDelFinDeAno }) {
    const cola = useQueryClient();
    const [profesores, setProfesores] = React.useState(true);
    const [horarios, setHorarios] = React.useState(false);
    const inicio = Number(estado.ciclo.nombre.match(/(\d{4})/)?.[1] ?? new Date().getFullYear());
    const plantilla = calendarioComoElMPPE(inicio + 1);

    const crear = useMutation({
        mutationFn: () => finDeAno.crearAnoSiguiente(estado.ciclo.id, { copiar: { secciones: true, profesores, horarios } }),
        onSuccess: (r) => {
            toast.success(`Año ${r.nombre} creado: ${r.secciones} secciones y ${r.materias} materias copiadas`);
            void cola.invalidateQueries({ queryKey: ['fin-de-ano', estado.ciclo.id] });
            void cola.invalidateQueries({ queryKey: ['academicYears'] });
        },
        onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo crear el año siguiente')),
    });

    if (estado.anoSiguiente) {
        return (
            <p className="flex flex-wrap items-center gap-2 text-sm text-gray-800">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
                Ya existe <strong>{estado.anoSiguiente.nombre}</strong> con {estado.anoSiguiente.secciones} secciones.
                <Link href={`/dashboard/academico/${estado.anoSiguiente.nombre}`} className="font-semibold text-indigo-700 underline">
                    Ver y ajustar
                </Link>
            </p>
        );
    }

    return (
        <div className="space-y-4">
            <div className="rounded-xl border border-gray-200 p-4">
                <p className="text-sm font-semibold text-gray-900">
                    {plantilla.nombre}, con el calendario del MPPE: {fechaCorta(plantilla.inicio)} → {fechaCorta(plantilla.fin)}
                </p>
                <ul className="mt-2 space-y-1 text-sm text-gray-700">
                    {plantilla.lapsos.map((l) => (
                        <li key={l.nombre}>
                            {l.nombre}: {fechaCorta(l.inicio)} → {fechaCorta(l.fin)}
                            {l.inicioDelPlan ? ` (diagnóstico hasta el ${fechaCorta(l.inicioDelPlan)})` : ''}
                        </li>
                    ))}
                </ul>
                <p className="mt-2 text-xs text-gray-600">Las fechas se cambian después, en «Editar el ciclo».</p>
            </div>
            <div className="space-y-2 text-sm text-gray-800">
                <p>Se copian las secciones de este año (grado, turno y capacidad) con sus materias y horas. Además:</p>
                <label className="flex min-h-[44px] items-center gap-3">
                    <Checkbox checked={profesores} onCheckedChange={(v) => setProfesores(v === true)} aria-label="Copiar los profesores" />
                    Los mismos profesores (guías y de cada materia)
                </label>
                <label className="flex min-h-[44px] items-center gap-3">
                    <Checkbox checked={horarios} onCheckedChange={(v) => setHorarios(v === true)} aria-label="Copiar los horarios" />
                    Los mismos horarios de clase
                </label>
            </div>
            <button
                type="button"
                onClick={() => crear.mutate()}
                disabled={crear.isPending}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
                {crear.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Crear {plantilla.nombre}
            </button>
        </div>
    );
}
