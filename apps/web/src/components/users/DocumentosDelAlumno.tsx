'use client';

import * as React from 'react';
import Link from 'next/link';
import { FileText, FolderOpen, IdCard, ScrollText } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useQuienSoy } from '@/hooks/useQuienSoy';
import { CONSTANCIAS_DE_LA_FICHA, NOMBRE_DE_LA_CONSTANCIA, type TipoDeConstancia } from '@/hooks/useConstancia';

/**
 * LOS PAPELES DEL ALUMNO, EN UNA SOLA VENTANA
 *
 * Antes eran una fila de botones al final de «Información personal». Aquí:
 * las constancias, el carnet y la certificación de calificaciones. El admin,
 * todo; el resto del personal, la constancia de estudio (el servidor decide).
 * Las boletas y las notas parciales van en cada ciclo, con su lapso.
 */
export function DocumentosDelAlumno({ cedula }: { cedula: string }) {
    const { yo } = useQuienSoy();
    const [abierta, setAbierta] = React.useState(false);
    const esAdmin = yo?.role === 'ADMIN';
    const alumno = encodeURIComponent(cedula);
    const constancias: TipoDeConstancia[] = esAdmin ? CONSTANCIAS_DE_LA_FICHA : ['ESTUDIO'];

    const papel =
        'flex min-h-11 items-center gap-3 rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-900 hover:border-indigo-300 hover:bg-indigo-50';

    return (
        <>
            <button
                type="button"
                onClick={() => setAbierta(true)}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
            >
                <FolderOpen className="h-4 w-4" aria-hidden /> Documentos
            </button>
            {abierta && (
                <Dialog open onOpenChange={(v) => !v && setAbierta(false)}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Documentos</DialogTitle>
                            <DialogDescription>Cada uno se abre listo para imprimir.</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                            <div>
                                <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-gray-600">Constancias</p>
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    {constancias.map((tipo) => (
                                        <Link
                                            key={tipo}
                                            href={`/dashboard/constancia/${alumno}${tipo === 'ESTUDIO' ? '' : `?tipo=${tipo}`}`}
                                            className={papel}
                                        >
                                            <FileText className="h-4 w-4 shrink-0 text-indigo-600" aria-hidden />
                                            {NOMBRE_DE_LA_CONSTANCIA[tipo]}
                                        </Link>
                                    ))}
                                </div>
                            </div>
                            {esAdmin && (
                                <div>
                                    <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-gray-600">Otros</p>
                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                        <Link href={`/dashboard/carnets?alumno=${alumno}`} className={papel}>
                                            <IdCard className="h-4 w-4 shrink-0 text-indigo-600" aria-hidden /> Carnet
                                        </Link>
                                        <Link href={`/dashboard/certificacion/${alumno}`} className={papel}>
                                            <ScrollText className="h-4 w-4 shrink-0 text-indigo-600" aria-hidden /> Certificación de calificaciones
                                        </Link>
                                    </div>
                                </div>
                            )}
                            <p className="text-xs text-gray-600">Las boletas y las notas parciales están en cada ciclo escolar, según el lapso que elijas.</p>
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </>
    );
}

export default DocumentosDelAlumno;
