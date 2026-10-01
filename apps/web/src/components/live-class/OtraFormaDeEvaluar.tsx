'use client';

import * as React from 'react';
import { NotebookPen } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { useEvaluarDeOtraForma, type OtraFormaDeEvaluar } from '@/hooks/useLiveClass';

/**
 * EVALUAR A UN ALUMNO DE OTRA FORMA
 *
 * «Un estudiante no puede hacer deporte: a ese se le evalúa con el cuaderno.»
 * Al calificar una actividad, cada alumno tiene este botón: se dice cómo se le
 * evalúa y, si hace falta, por qué. La nota se pone igual y cuenta igual; lo
 * que queda escrito es el método, y lo ven él y su representante.
 */
export function OtraFormaDeEvaluarBoton({
    activityId,
    studentId,
    studentName,
    actual,
    disabled,
}: {
    activityId: string;
    studentId: string;
    studentName: string;
    actual?: OtraFormaDeEvaluar | null;
    disabled?: boolean;
}) {
    const [abierto, setAbierto] = React.useState(false);
    const [metodo, setMetodo] = React.useState(actual?.metodo ?? '');
    const [motivo, setMotivo] = React.useState(actual?.motivo ?? '');
    const guardar = useEvaluarDeOtraForma();

    const abrir = () => {
        setMetodo(actual?.metodo ?? '');
        setMotivo(actual?.motivo ?? '');
        setAbierto(true);
    };
    const enviar = async (m: string) => {
        await guardar.mutateAsync({ activityId, studentId, metodo: m, motivo });
        setAbierto(false);
    };

    return (
        <>
            <button
                type="button"
                onClick={abrir}
                disabled={disabled}
                className={
                    actual
                        ? 'inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60'
                        : 'inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-60'
                }
                aria-label={actual ? `${studentName}: evaluado con ${actual.metodo}. Cambiar` : `Evaluar a ${studentName} de otra forma`}
                title={actual?.motivo || undefined}
            >
                <NotebookPen className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">{actual ? `Con: ${actual.metodo}` : 'Otra forma'}</span>
            </button>

            <Dialog open={abierto} onOpenChange={setAbierto}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Evaluar de otra forma</DialogTitle>
                        <DialogDescription>
                            {studentName}. Su nota se pone igual que la de los demás y cuenta igual; aquí queda cómo se
                            le evalúa.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <label htmlFor={`otra-forma-metodo-${studentId}`} className="block">
                            <span className="mb-1 block text-sm font-semibold text-gray-800">Cómo se le evalúa</span>
                            <input
                                id={`otra-forma-metodo-${studentId}`}
                                type="text"
                                maxLength={60}
                                value={metodo}
                                onChange={(e) => setMetodo(e.target.value)}
                                placeholder="Cuaderno, trabajo escrito, exposición…"
                                className="w-full min-h-[44px] rounded-xl border border-gray-300 px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </label>
                        <label htmlFor={`otra-forma-motivo-${studentId}`} className="block">
                            <span className="mb-1 block text-sm font-semibold text-gray-800">Por qué (si hace falta)</span>
                            <textarea
                                id={`otra-forma-motivo-${studentId}`}
                                maxLength={200}
                                rows={2}
                                value={motivo}
                                onChange={(e) => setMotivo(e.target.value)}
                                placeholder="Reposo médico, adaptación curricular…"
                                className="w-full resize-none rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </label>
                    </div>
                    <DialogFooter className="gap-2 sm:gap-2">
                        {actual && (
                            <button
                                type="button"
                                onClick={() => enviar('')}
                                disabled={guardar.isPending}
                                className="min-h-11 rounded-xl border border-gray-200 px-4 text-sm font-semibold text-red-700 hover:bg-red-50"
                            >
                                Como los demás
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => enviar(metodo)}
                            disabled={guardar.isPending || !metodo.trim()}
                            className="min-h-11 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                            Guardar
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

export default OtraFormaDeEvaluarBoton;
