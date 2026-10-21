'use client';

import * as React from 'react';
import { ChevronRight, Loader2 } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { VerMas } from '@/components/pagos/listas-de-finanzas';
import { NOMBRE_DEL_TURNO } from '@/lib/grupos-estables';
import { useClasesSinProfesor, type ClaseSinProfesor } from '@/lib/profesores';
import { cn } from '@/lib/utils';

const NOMBRE_DEL_ANO: Record<number, string> = { 1: 'Primer año', 2: 'Segundo año', 3: 'Tercer año', 4: 'Cuarto año', 5: 'Quinto año' };

/**
 * LAS CLASES SIN PROFESOR, EN UNA HOJA
 *
 * Por año y sección (cada sección una fila que se abre: nunca más de 20 filas
 * de golpe). Tocar una clase la entrega a quien abrió la hoja: la lista de
 * Profesores abre «Asignar profesor»; la ficha de un profesor, ya con él.
 */
export function ClasesSinProfesor({
    titulo = 'Clases sin profesor',
    descripcion = 'Elige una para asignarle profesor',
    alElegir,
    alCerrar,
}: {
    titulo?: string;
    descripcion?: string;
    alElegir: (c: ClaseSinProfesor) => void;
    alCerrar: () => void;
}) {
    const { data, isLoading } = useClasesSinProfesor();
    const [abierta, setAbierta] = React.useState<string | null>(null);

    const porAno = React.useMemo(() => {
        const anos = new Map<number, Map<string, ClaseSinProfesor[]>>();
        for (const c of data ?? []) {
            const secciones = anos.get(c.grado) ?? new Map<string, ClaseSinProfesor[]>();
            secciones.set(c.classroomId, [...(secciones.get(c.classroomId) ?? []), c]);
            anos.set(c.grado, secciones);
        }
        return [...anos.entries()].sort(([a], [b]) => a - b);
    }, [data]);

    return (
        <Sheet open onOpenChange={(v) => !v && alCerrar()}>
            <SheetContent
                side="bottom"
                onOpenAutoFocus={(e) => e.preventDefault()}
                className="zona-segura-abajo flex max-h-[90dvh] flex-col rounded-t-[28px] bg-gray-50 px-4 pb-4 pt-6 sm:mx-auto sm:max-w-lg"
            >
                <SheetTitle className="pr-12 text-lg font-bold text-gray-900">{titulo}</SheetTitle>
                <SheetDescription className="text-sm text-gray-600">{descripcion}</SheetDescription>
                <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto">
                    {isLoading ? (
                        <p className="flex items-center justify-center gap-2 py-8 text-sm text-gray-600">
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando
                        </p>
                    ) : porAno.length === 0 ? (
                        <p className="rounded-[22px] bg-white px-4 py-8 text-center text-sm text-gray-600 ring-1 ring-gray-200">Todas las clases tienen profesor.</p>
                    ) : (
                        porAno.map(([ano, secciones]) => (
                            <section key={ano} aria-label={NOMBRE_DEL_ANO[ano] ?? `${ano}.º año`}>
                                <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-600">{NOMBRE_DEL_ANO[ano] ?? `${ano}.º año`}</h3>
                                <ul className="mt-2 divide-y divide-gray-100 overflow-hidden rounded-[22px] bg-white ring-1 ring-gray-200">
                                    {[...secciones.values()].map((clases) => {
                                        const s = clases[0];
                                        const esta = abierta === s.classroomId;
                                        return (
                                            <li key={s.classroomId}>
                                                <button
                                                    type="button"
                                                    aria-expanded={esta}
                                                    onClick={() => setAbierta(esta ? null : s.classroomId)}
                                                    className="flex min-h-[56px] w-full items-center gap-3 px-4 py-2 text-left hover:bg-gray-50"
                                                >
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block text-[15px] font-medium text-gray-900">{s.seccion}</span>
                                                        <span className="block text-sm text-gray-600">
                                                            {clases.length} sin profesor · {NOMBRE_DEL_TURNO[s.turno] ?? s.turno}
                                                        </span>
                                                    </span>
                                                    <ChevronRight className={cn('h-5 w-5 shrink-0 text-gray-500 transition-transform', esta && 'rotate-90')} aria-hidden />
                                                </button>
                                                {esta && (
                                                    <div className="border-t border-gray-100 bg-gray-50/60">
                                                        <VerMas cosas={clases} etiqueta={`Sin profesor en ${s.seccion}`}>
                                                            {(c) => (
                                                                <li key={c.claseId}>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => alElegir(c)}
                                                                        className="flex min-h-[52px] w-full items-center gap-3 py-2 pl-8 pr-4 text-left hover:bg-white"
                                                                    >
                                                                        <span className="min-w-0 flex-1 truncate text-[15px] text-gray-900">{c.materia}</span>
                                                                        <span className="shrink-0 rounded-full bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-700">Asignar</span>
                                                                    </button>
                                                                </li>
                                                            )}
                                                        </VerMas>
                                                    </div>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            </section>
                        ))
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}
