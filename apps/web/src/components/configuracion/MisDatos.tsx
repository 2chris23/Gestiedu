'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, ShieldCheck } from 'lucide-react';
import api from '@/lib/axios';
import { entregarArchivo } from '@/lib/horario-en-archivo';
import { Grupo, CargandoAjustes } from '@/components/configuracion/ajustes';
import { getApiErrorMessage } from '@/lib/utils';

/**
 * «DESCARGAR TODOS MIS DATOS» (19-oct-2026; servidor: `services/mis-datos.service.ts`)
 *
 * Cristian: pase lo que pase con Gestiedu —aunque deje de funcionar para
 * siempre— el liceo se queda con todo lo suyo, sin pedírselo a nadie. El
 * director elige una contraseña, el servidor arma un ZIP con los Excel de cada
 * ciclo, las fotos y las facturas, y aquí se baja. Se abre con 7-Zip o
 * cualquier programa de ZIP con AES, sin Gestiedu.
 */

interface Estado {
    id: string;
    estado: 'ARMANDO' | 'LISTA' | 'FALLO' | 'CADUCADA';
    progreso: number;
    paso: string | null;
    bytes: number | null;
    error: string | null;
    creadaEn: string;
    caducaEn: string | null;
}

const MB = (b: number) => (b < 1_048_576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1_048_576).toFixed(1).replace('.', ',')} MB`);
const hora = (iso: string) => new Date(iso).toLocaleString('es-VE', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false });

export default function MisDatos() {
    const qc = useQueryClient();
    const [clave, setClave] = React.useState('');
    const [otraVez, setOtraVez] = React.useState('');
    const [bajando, setBajando] = React.useState(false);
    const { data, isLoading } = useQuery({
        queryKey: ['mis-datos'],
        queryFn: async () => (await api.get('/mis-datos')).data.data as Estado | null,
        // Mientras se arma, se pregunta cada 2 s cómo va.
        refetchInterval: (q) => ((q.state.data as Estado | null)?.estado === 'ARMANDO' ? 2000 : false),
    });
    const pedir = useMutation({
        mutationFn: async () => (await api.post('/mis-datos', { contrasena: clave })).data.data as Estado,
        onSuccess: () => {
            setClave('');
            setOtraVez('');
            void qc.invalidateQueries({ queryKey: ['mis-datos'] });
        },
        onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo empezar')),
    });

    async function bajar(e: Estado) {
        setBajando(true);
        try {
            const r = await api.get(`/mis-datos/${e.id}/archivo`, { responseType: 'blob', timeout: 30 * 60_000 });
            const fecha = new Date().toISOString().slice(0, 10);
            const hecho = await entregarArchivo(r.data as Blob, `datos-del-liceo-${fecha}.zip`);
            if (hecho === 'actualizar') toast.error('Actualiza la app para poder guardar el archivo');
        } catch (err) {
            toast.error(getApiErrorMessage(err, 'No se pudo bajar'));
        } finally {
            setBajando(false);
        }
    }

    if (isLoading) return <CargandoAjustes />;
    const armando = data?.estado === 'ARMANDO';
    const coinciden = clave.length >= 8 && clave === otraVez;

    return (
        <div className="space-y-5">
            <Grupo titulo="Todos los datos del liceo, en tus manos">
                <div className="space-y-2 px-4 py-3 text-sm text-gray-700">
                    <p>
                        Un archivo con todo lo que el liceo ha hecho en Gestiedu: estudiantes, profesores y representantes; las notas, la asistencia y las
                        observaciones de cada ciclo; las finanzas; las fotos y las facturas.
                    </p>
                    <p>
                        Se abre <strong>sin Gestiedu</strong>: los datos van en Excel. Guárdalo en un lugar seguro (un pendrive, el Drive del liceo). Así, pase
                        lo que pase, el liceo nunca pierde su información.
                    </p>
                </div>
            </Grupo>

            {data?.estado === 'LISTA' && (
                <Grupo titulo="Listo para bajar" pie={data.caducaEn ? `Se puede bajar hasta el ${hora(data.caducaEn)}. Después se borra del servidor.` : undefined}>
                    <div className="flex items-center justify-between gap-3 px-4 py-3">
                        <span className="text-sm text-gray-700">
                            Preparado el {hora(data.creadaEn)} · {MB(data.bytes ?? 0)}
                        </span>
                        <button
                            type="button"
                            disabled={bajando}
                            onClick={() => void bajar(data)}
                            className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-60"
                        >
                            <Download className="h-4 w-4" aria-hidden /> {bajando ? 'Bajando…' : 'Descargar'}
                        </button>
                    </div>
                </Grupo>
            )}

            {armando ? (
                <Grupo titulo="Preparando el archivo">
                    <div className="space-y-2 px-4 py-4" role="status" aria-live="polite">
                        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                            <div className="h-full rounded-full bg-indigo-600 transition-[width] duration-500" style={{ width: `${Math.max(3, data.progreso)}%` }} />
                        </div>
                        <p className="text-sm text-gray-700">
                            {data.progreso}% · {data.paso ?? 'Empezando'}
                        </p>
                        <p className="text-xs text-gray-600">Puedes salir de esta pantalla: sigue preparándose.</p>
                    </div>
                </Grupo>
            ) : (
                <Grupo
                    titulo={data?.estado === 'LISTA' ? 'Preparar uno nuevo' : 'Preparar el archivo'}
                    pie="La contraseña no se guarda en ningún sitio: si la olvidas, el archivo no se puede abrir. Anótala en papel y guárdala con el archivo."
                >
                    <form
                        className="space-y-3 px-4 py-3"
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (coinciden) pedir.mutate();
                        }}
                    >
                        {data?.estado === 'FALLO' && <p className="text-sm font-semibold text-red-700">{data.error ?? 'No se pudo preparar.'}</p>}
                        <label className="block text-sm font-medium text-gray-800" htmlFor="clave-mis-datos">
                            Contraseña del archivo (8 o más caracteres)
                        </label>
                        <input
                            id="clave-mis-datos"
                            type="password"
                            autoComplete="new-password"
                            value={clave}
                            onChange={(e) => setClave(e.target.value)}
                            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[15px]"
                        />
                        <label className="block text-sm font-medium text-gray-800" htmlFor="clave-mis-datos-2">
                            Repítela
                        </label>
                        <input
                            id="clave-mis-datos-2"
                            type="password"
                            autoComplete="new-password"
                            value={otraVez}
                            onChange={(e) => setOtraVez(e.target.value)}
                            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[15px]"
                        />
                        {otraVez.length > 0 && clave !== otraVez && <p className="text-sm text-red-700">No coinciden.</p>}
                        <button
                            type="submit"
                            disabled={!coinciden || pedir.isPending}
                            className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-full bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
                        >
                            <ShieldCheck className="h-4 w-4" aria-hidden /> Preparar el archivo con contraseña
                        </button>
                    </form>
                </Grupo>
            )}
        </div>
    );
}
