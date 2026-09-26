'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { IdCard, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Lista } from '@/components/ui/lista';
import { useQuienSoy } from '@/hooks/useQuienSoy';
import { esCedulaEscolar } from '@/lib/cedula-escolar';
import api from '@/lib/axios';

/**
 * CAMBIAR LA CÉDULA
 *
 * El alumno entró con cédula escolar y ya sacó la de identidad, o se escribió
 * mal al inscribirlo. La cédula es la llave de su cuenta, así que no se edita
 * en el formulario: se cambia aquí, escribiéndola dos veces, y el servidor
 * arrastra todo lo suyo (notas, asistencia, pagos…). Si la de antes era
 * escolar, queda guardada.
 *
 * Solo el admin. La persona pierde la sesión abierta y vuelve a entrar con su
 * correo y su contraseña, que no cambian.
 */
export function CambiarCedula({ cedula }: { cedula: string }) {
    const { yo } = useQuienSoy();
    const [abierto, setAbierto] = React.useState(false);

    if (yo?.role !== 'ADMIN' || yo.id === cedula) return null;

    return (
        <>
            <button
                type="button"
                onClick={() => setAbierto(true)}
                className="mt-1 inline-flex min-h-[44px] w-fit items-center gap-2 justify-self-start rounded-lg border border-gray-200 px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
                <IdCard className="h-4 w-4" aria-hidden /> Cambiar cédula
            </button>
            {abierto && <VentanaDeCambio cedula={cedula} alCerrar={() => setAbierto(false)} />}
        </>
    );
}

function VentanaDeCambio({ cedula, alCerrar }: { cedula: string; alCerrar: () => void }) {
    const router = useRouter();
    const cola = useQueryClient();
    const [nueva, setNueva] = React.useState('');
    const [otraVez, setOtraVez] = React.useState('');
    const [tipo, setTipo] = React.useState<'IDENTIDAD' | 'ESCOLAR'>('IDENTIDAD');
    const [error, setError] = React.useState('');
    const [guardando, setGuardando] = React.useState(false);

    const limpia = (t: string) => t.trim().toUpperCase();
    const distintas = otraVez !== '' && limpia(nueva) !== limpia(otraVez);

    const cambiarNueva = (t: string) => {
        setNueva(t);
        setError('');
        if (esCedulaEscolar(limpia(t))) setTipo('ESCOLAR');
    };

    const guardar = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!nueva.trim() || distintas) return;
        setGuardando(true);
        setError('');
        try {
            const { data } = await api.put(`/users/${encodeURIComponent(cedula)}/cedula`, {
                nueva: limpia(nueva),
                confirmacion: limpia(otraVez),
                tipo,
            });
            const id: string = data?.data?.id ?? limpia(nueva);
            toast.success(`Cédula cambiada: ahora es ${id}. Tendrá que volver a entrar con su correo y contraseña.`);
            await cola.invalidateQueries();
            alCerrar();
            router.replace(`/dashboard/usuarios/${encodeURIComponent(id)}`);
        } catch (e: any) {
            setError(e?.response?.data?.error || e?.message || 'No se pudo cambiar la cédula.');
        } finally {
            setGuardando(false);
        }
    };

    return (
        <Dialog open onOpenChange={(v) => !v && !guardando && alCerrar()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Cambiar la cédula</DialogTitle>
                    <DialogDescription>
                        Ahora es <strong>{cedula}</strong>. Todo lo suyo (notas, asistencia, pagos, documentos) pasa a la
                        nueva. Se cierra su sesión y vuelve a entrar con su correo y su contraseña.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={guardar} className="space-y-4">
                    <div className="space-y-1.5">
                        <label htmlFor="cedula-nueva" className="text-sm font-semibold text-gray-700">
                            Cédula nueva
                        </label>
                        <Input
                            id="cedula-nueva"
                            value={nueva}
                            onChange={(e) => cambiarNueva(e.target.value)}
                            autoComplete="off"
                            maxLength={20}
                            placeholder="V-30123456"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="cedula-otra-vez" className="text-sm font-semibold text-gray-700">
                            Escríbela otra vez
                        </label>
                        <Input
                            id="cedula-otra-vez"
                            value={otraVez}
                            onChange={(e) => {
                                setOtraVez(e.target.value);
                                setError('');
                            }}
                            onPaste={(e) => e.preventDefault()}
                            autoComplete="off"
                            maxLength={20}
                            aria-invalid={distintas}
                        />
                        {distintas && <p className="text-sm text-rose-700">No coinciden.</p>}
                    </div>
                    <div className="space-y-1.5">
                        <span className="text-sm font-semibold text-gray-700">Qué cédula es</span>
                        <Lista
                            etiqueta="Qué cédula es"
                            valor={tipo}
                            alCambiar={(v) => setTipo(v as 'IDENTIDAD' | 'ESCOLAR')}
                            opciones={[
                                { valor: 'IDENTIDAD', texto: 'Cédula de identidad' },
                                { valor: 'ESCOLAR', texto: 'Cédula escolar' },
                            ]}
                        />
                    </div>
                    {error && (
                        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800">
                            {error}
                        </p>
                    )}
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <button
                            type="button"
                            onClick={alCerrar}
                            disabled={guardando}
                            className="min-h-[44px] rounded-lg border border-gray-200 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={guardando || !nueva.trim() || !otraVez.trim() || distintas}
                            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                        >
                            {guardando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                            Cambiar cédula
                        </button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export default CambiarCedula;
