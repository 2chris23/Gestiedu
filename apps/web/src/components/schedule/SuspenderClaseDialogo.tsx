'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Ban, Loader2, Repeat } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { useClassroomSubjects } from '@/hooks/useClassroomSubjects';
import { useSuspendClass } from '@/hooks/useLiveClass';
import { cn } from '@/lib/utils';

/**
 * SUSPENDER UNA CLASE (SOLO ADMIN)
 *
 * Antes era un `window.prompt` del navegador pidiendo el motivo. Ahora, en el
 * mismo sitio, el admin puede dejar la hora libre o poner OTRA materia de la
 * sección en ese hueco.
 *
 * Si el profesor que entra no está libre, el servidor lo dice con nombre y hora
 * y NO suspende nada: el mensaje sale aquí, y el admin elige otra materia o
 * suspende sin reemplazo.
 */
export function SuspenderClaseDialogo({
    abierto,
    alCerrar,
    classroomId,
    subjectId,
    fecha,
    nombreMateria,
}: {
    abierto: boolean;
    alCerrar: () => void;
    classroomId: string;
    subjectId: string;
    fecha: string;
    nombreMateria?: string;
}) {
    const suspender = useSuspendClass();
    const { data: materias = [], isLoading } = useClassroomSubjects(abierto ? classroomId : '');
    const [motivo, setMotivo] = React.useState('');
    const [reemplazo, setReemplazo] = React.useState<string | null>(null);
    const [problema, setProblema] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!abierto) {
            setMotivo('');
            setReemplazo(null);
            setProblema(null);
        }
    }, [abierto]);

    const opciones = (materias as any[]).filter((m) => m.subjectId !== subjectId);

    const confirmar = async () => {
        setProblema(null);
        try {
            const res = await suspender.mutateAsync({
                classroomId,
                subjectId,
                date: fecha,
                reason: motivo.trim() || undefined,
                replacementSubjectId: reemplazo ?? undefined,
            });
            const entra = opciones.find((m) => m.subjectId === reemplazo);
            toast.success(
                entra
                    ? `Clase suspendida. En su lugar: ${entra.subject?.name}.`
                    : res?.mergedTemaGenerador
                      ? 'Clase suspendida. Tema fusionado con la semana siguiente.'
                      : 'Clase suspendida.'
            );
            alCerrar();
        } catch (e: any) {
            setProblema(e?.response?.data?.error || 'No se pudo suspender la clase');
        }
    };

    return (
        <Dialog open={abierto} onOpenChange={(v) => !v && alCerrar()}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Suspender {nombreMateria ?? 'la clase'}</DialogTitle>
                    <DialogDescription>{fecha}. Las actividades pendientes pasan a la próxima clase.</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <label className="block">
                        <span className="text-xs font-semibold text-gray-700">Motivo (opcional)</span>
                        <textarea
                            value={motivo}
                            onChange={(e) => setMotivo(e.target.value)}
                            maxLength={200}
                            rows={2}
                            placeholder="Ej.: el profesor está de reposo"
                            className="mt-1 w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                        />
                    </label>

                    <fieldset>
                        <legend className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
                            <Repeat size={13} aria-hidden="true" /> ¿Otra materia en esta hora?
                        </legend>
                        <div className="mt-2 max-h-56 space-y-1.5 overflow-y-auto" role="radiogroup">
                            <Opcion activa={reemplazo === null} alElegir={() => setReemplazo(null)} titulo="No, dejar la hora libre" />
                            {isLoading && <p className="px-3 py-2 text-xs text-gray-600">Cargando materias…</p>}
                            {opciones.map((m) => (
                                <Opcion
                                    key={m.subjectId}
                                    activa={reemplazo === m.subjectId}
                                    alElegir={() => setReemplazo(m.subjectId)}
                                    titulo={m.subject?.name ?? 'Materia'}
                                    detalle={m.teacher ? `${m.teacher.firstName} ${m.teacher.lastName}` : 'Sin profesor asignado'}
                                    apagada={!m.teacher}
                                />
                            ))}
                        </div>
                    </fieldset>

                    {problema && (
                        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                            {problema}
                        </p>
                    )}
                </div>

                <DialogFooter className="gap-2 sm:gap-2">
                    <button
                        type="button"
                        onClick={alCerrar}
                        className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={confirmar}
                        disabled={suspender.isPending}
                        className="flex items-center justify-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"
                    >
                        {suspender.isPending ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />}
                        {reemplazo ? 'Suspender y reemplazar' : 'Suspender'}
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function Opcion({
    activa,
    alElegir,
    titulo,
    detalle,
    apagada,
}: {
    activa: boolean;
    alElegir: () => void;
    titulo: string;
    detalle?: string;
    apagada?: boolean;
}) {
    return (
        <button
            type="button"
            role="radio"
            aria-checked={activa}
            disabled={apagada}
            onClick={alElegir}
            className={cn(
                'flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                activa ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 bg-white hover:bg-gray-50'
            )}
        >
            <span
                aria-hidden="true"
                className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
                    activa ? 'border-indigo-600' : 'border-gray-400'
                )}
            >
                {activa && <span className="h-2 w-2 rounded-full bg-indigo-600" />}
            </span>
            <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-gray-900">{titulo}</span>
                {detalle && <span className="block truncate text-xs text-gray-600">{detalle}</span>}
            </span>
        </button>
    );
}
