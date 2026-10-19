'use client';

import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronDown, ScrollText } from 'lucide-react';
import api from '@/lib/axios';
import { elDuenoDeAhora } from '@/lib/el-dueno';
import { useOcuparLaPantalla } from '@/lib/turno-de-ofrecer';
import { useQuienSoy } from '@/hooks/useQuienSoy';
import { useCerrarSesion } from '@/hooks/useCerrarSesion';
import { losDocumentos, VERSION_LEGAL } from '@/lib/legal/documentos';
import { elTitular } from '@/lib/legal/titular';
import { TextoLegal } from '@/components/legal/TextoLegal';
import { cn, getApiErrorMessage } from '@/lib/utils';

/**
 * ANTES DE EMPEZAR: LOS TÉRMINOS Y LA PRIVACIDAD (19-oct-2026)
 *
 * Como hacen otras apps: la primera vez que alguien entra —y cada vez que
 * cambia la versión de lo que se acepta (`VERSION_LEGAL`)— se le enseñan los
 * Términos y la Política de privacidad, se pueden leer aquí mismo, y no se
 * sigue sin aceptarlos (o cerrar sesión). Queda la prueba en el servidor
 * (`routes/legal.routes.ts`).
 *
 *  - Por encima de todo, también de la descarga de la primera vez.
 *  - Sin conexión no se bloquea a nadie: si ya aceptó en este teléfono, no se
 *    pregunta; si no hay servidor, se pregunta la próxima vez.
 *  - Las pruebas de navegador no la ven (`navigator.webdriver`) salvo que
 *    pongan `gestiedu:pedir-lo-legal`, como los recorridos.
 */

const LLAVE = (dueno: string) => `gestiedu:legal:${dueno}`;
export const LLAVE_PEDIR_EN_PRUEBAS = 'gestiedu:pedir-lo-legal';

function yaAceptoAqui(dueno: string | null): boolean {
    if (!dueno) return false;
    try {
        return localStorage.getItem(LLAVE(dueno)) === VERSION_LEGAL;
    } catch {
        return false;
    }
}
export function apuntarQueAcepto(dueno: string | null) {
    if (!dueno) return;
    try {
        localStorage.setItem(LLAVE(dueno), VERSION_LEGAL);
    } catch {
        /* sin almacenamiento: se volverá a preguntar al servidor */
    }
}

export default function AceptarLoLegal() {
    const { yo } = useQuienSoy();
    const qc = useQueryClient();
    const cerrarSesion = useCerrarSesion();
    const [dueno, setDueno] = React.useState<string | null>(null);
    const [enPruebas, setEnPruebas] = React.useState(true);
    React.useEffect(() => {
        setDueno(elDuenoDeAhora());
        try {
            setEnPruebas(Boolean(navigator.webdriver) && localStorage.getItem(LLAVE_PEDIR_EN_PRUEBAS) !== '1');
        } catch {
            setEnPruebas(Boolean(navigator.webdriver));
        }
    }, [yo?.id]);

    const preguntar = !!yo?.id && !!dueno && !enPruebas && !yaAceptoAqui(dueno);
    const { data } = useQuery({
        queryKey: ['legal', 'mi-aceptacion', dueno],
        queryFn: async () => (await api.get('/legal/mi-aceptacion')).data.data as { version: string; aceptada: boolean },
        enabled: preguntar,
        retry: false,
        staleTime: Infinity,
    });
    React.useEffect(() => {
        if (data?.aceptada && data.version === VERSION_LEGAL) apuntarQueAcepto(dueno);
    }, [data, dueno]);

    const falta = preguntar && data?.aceptada === false;
    useOcuparLaPantalla(falta);

    const [leido, setLeido] = React.useState(false);
    const [abierto, setAbierto] = React.useState<string | null>(null);
    const [enviando, setEnviando] = React.useState(false);
    if (!falta) return null;

    const docs = losDocumentos(elTitular());
    const deMenores = yo?.role === 'STUDENT' || yo?.role === 'TUTOR';
    const aLeer = docs.filter((d) => d.seAcepta || (deMenores && d.id === 'menores'));

    async function aceptar() {
        setEnviando(true);
        try {
            await api.post('/legal/aceptar', { version: VERSION_LEGAL });
            apuntarQueAcepto(dueno);
            await qc.invalidateQueries({ queryKey: ['legal'] });
        } catch (e: any) {
            if (e?.response?.data?.code === 'VERSION_VIEJA') window.location.reload();
            else toast.error(getApiErrorMessage(e, 'No se pudo guardar. Revisa la conexión y vuelve a intentarlo.'));
        } finally {
            setEnviando(false);
        }
    }

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-legal"
            data-aceptar-lo-legal
            className="modo-claro fixed inset-0 z-[95] flex flex-col bg-gray-50 pb-[var(--zona-segura-abajo)] pt-[var(--zona-segura-arriba)]"
        >
            <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col overflow-hidden px-4 sm:px-6">
                <div className="pt-6 text-center">
                    <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white">
                        <ScrollText className="h-6 w-6" aria-hidden />
                    </span>
                    <h1 id="titulo-legal" className="mt-4 text-2xl font-extrabold text-gray-900">
                        Antes de empezar
                    </h1>
                    <p className="mx-auto mt-2 max-w-md text-[15px] leading-6 text-gray-600">
                        {yo?.role === 'STUDENT'
                            ? 'Tu liceo usa Gestiedu para llevar tus notas, tu asistencia y tu horario. Lee cómo funciona y cómo cuidamos tus datos.'
                            : 'Lee cómo funciona Gestiedu y cómo se cuidan los datos de tu liceo y de tu familia.'}
                    </p>
                </div>

                <div className="mt-5 flex-1 space-y-3 overflow-y-auto pb-4">
                    {aLeer.map((d) => {
                        const esEste = abierto === d.id;
                        return (
                            <div key={d.id} className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                                <button
                                    type="button"
                                    aria-expanded={esEste}
                                    onClick={() => setAbierto(esEste ? null : d.id)}
                                    className="flex min-h-[56px] w-full items-center justify-between gap-3 px-4 py-3 text-left"
                                >
                                    <span>
                                        <span className="block text-[15px] font-semibold text-gray-900">{d.titulo}</span>
                                        <span className="mt-0.5 block text-sm text-gray-600">{d.resumen}</span>
                                    </span>
                                    <ChevronDown className={cn('h-5 w-5 shrink-0 text-gray-500 transition-transform', esEste && 'rotate-180')} aria-hidden />
                                </button>
                                {esEste && (
                                    <div className="max-h-[50vh] overflow-y-auto border-t border-gray-100 px-4 py-4">
                                        <TextoLegal doc={d} />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    <p className="px-1 text-sm text-gray-600">
                        Toda la información legal está también, cuando quieras, en Configuración → Información legal.
                    </p>
                </div>

                <div className="space-y-3 border-t border-gray-200 bg-gray-50 py-4">
                    <label className="flex min-h-[44px] cursor-pointer items-start gap-3">
                        <input type="checkbox" checked={leido} onChange={(e) => setLeido(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-indigo-600" />
                        <span className="text-[15px] leading-6 text-gray-800">
                            He leído y acepto los Términos y condiciones de uso y la Política de privacidad
                            {deMenores ? ', y conozco cómo se cuidan los datos de los estudiantes' : ''}.
                        </span>
                    </label>
                    <button
                        type="button"
                        disabled={!leido || enviando}
                        onClick={() => void aceptar()}
                        className="inline-flex min-h-[48px] w-full items-center justify-center rounded-full bg-indigo-600 px-5 text-base font-semibold text-white disabled:opacity-50"
                    >
                        {enviando ? 'Guardando…' : 'Aceptar y continuar'}
                    </button>
                    <button type="button" onClick={() => void cerrarSesion()} className="inline-flex min-h-[44px] w-full items-center justify-center text-sm font-semibold text-gray-600">
                        No acepto: cerrar sesión
                    </button>
                </div>
            </div>
        </div>
    );
}
