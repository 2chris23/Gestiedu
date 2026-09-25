'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Smartphone, Unlock } from 'lucide-react';
import { useConfirm } from '@/hooks/useConfirm';
import { useQuienSoy } from '@/hooks/useQuienSoy';
import { asistenciaQr, elMotivo } from '@/lib/asistencia-qr';

/**
 * EL TELÉFONO CON EL QUE EL ALUMNO PASA ASISTENCIA
 *
 * Una cuenta, un teléfono: el primero desde el que el alumno escanea el QR de
 * una clase queda suyo, y desde otro no se puede (así no se marca la
 * asistencia de un amigo cerrando sesión y entrando con su cuenta).
 *
 * Si el alumno vendió el teléfono, se le dañó o lo cambió, el admin lo
 * desbloquea aquí de un toque; el siguiente desde el que escanee queda
 * registrado. Solo el admin, y cada desbloqueo queda anotado (quién, cuándo, a
 * quién): si alguien desbloquea a los mismos alumnos cada semana, se ve.
 */
export function TelefonoDeAsistencia({ studentId }: { studentId: string }) {
    const { yo } = useQuienSoy();
    const esAdmin = yo?.role === 'ADMIN';
    const cola = useQueryClient();
    const confirmar = useConfirm();
    const clave = ['alumno', studentId, 'telefono-de-asistencia'];

    const { data: aparato, isLoading } = useQuery({
        queryKey: clave,
        queryFn: () => asistenciaQr.aparatoDe(studentId),
        enabled: esAdmin,
    });

    const desbloquear = useMutation({
        mutationFn: () => asistenciaQr.desbloquear(studentId),
        onSuccess: () => {
            toast.success('Teléfono desbloqueado: el próximo desde el que escanee quedará registrado.');
            void cola.invalidateQueries({ queryKey: clave });
        },
        onError: (e) => toast.error(elMotivo(e, 'No se pudo desbloquear.')),
    });

    if (!esAdmin) return null;

    const fecha = (iso?: string) =>
        iso ? new Date(iso).toLocaleDateString('es-VE', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

    return (
        <div className="mt-2 border-t border-gray-100 pt-4">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Teléfono para la asistencia por QR</span>
            {isLoading ? (
                <p className="mt-1 flex items-center gap-2 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" /> Consultando…
                </p>
            ) : aparato ? (
                <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                        <Smartphone className="h-5 w-5 shrink-0 text-gray-500" aria-hidden />
                        <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-gray-800">{aparato.descripcion || 'Teléfono registrado'}</p>
                            <p className="text-xs text-gray-500">
                                Desde el {fecha(aparato.registradoEn)} · último uso {fecha(aparato.ultimoUso)}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        disabled={desbloquear.isPending}
                        onClick={async () => {
                            const si = await confirmar({
                                title: '¿Desbloquear el teléfono de este alumno?',
                                description:
                                    'Úsalo si cambió de teléfono. El próximo desde el que pase asistencia quedará como el suyo. Queda anotado.',
                            });
                            if (si) desbloquear.mutate();
                        }}
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 text-sm font-semibold text-amber-900 disabled:opacity-60"
                    >
                        {desbloquear.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlock className="h-4 w-4" />}
                        Desbloquear
                    </button>
                </div>
            ) : (
                <p className="mt-1 text-sm italic text-gray-500">
                    Aún ninguno: el primero desde el que escanee el QR de una clase quedará como el suyo.
                </p>
            )}
        </div>
    );
}

export default TelefonoDeAsistencia;
