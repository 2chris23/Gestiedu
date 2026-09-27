'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileText, Loader2, RotateCcw } from 'lucide-react';
import api from '@/lib/axios';
import { Lista } from '@/components/ui/lista';
import { getApiErrorMessage } from '@/lib/utils';

/**
 * LAS PLANTILLAS DE LAS CONSTANCIAS
 *
 * Cada constancia (estudio, buena conducta, prosecución, retiro, inscripción,
 * labor social) sale de un texto con marcadores entre llaves que el servidor
 * rellena con los datos del alumno. El liceo lo cambia aquí; la vista previa
 * lo enseña con datos de ejemplo. Un marcador que no existe no se guarda.
 * «Volver al texto de siempre» quita el del liceo.
 */

interface Plantilla {
    tipo: string;
    titulo: string;
    texto: string;
    propia: boolean;
    porDefecto: { titulo: string; texto: string };
    marcadores: Record<string, string>;
}

const NOMBRE: Record<string, string> = {
    ESTUDIO: 'Constancia de estudio',
    BUENA_CONDUCTA: 'Buena conducta',
    PROSECUCION: 'Prosecución',
    RETIRO: 'Retiro',
    INSCRIPCION: 'Inscripción',
    LABOR_SOCIAL: 'Labor social',
};

const EJEMPLO: Record<string, string> = {
    alumno: 'María Pérez',
    tipoDeCedula: 'cédula de identidad',
    cedula: 'V-30123456',
    grado: '3er año',
    seccion: 'A',
    turno: 'mañana',
    ciclo: '2026-2027',
    nivel: 'Educación Media General',
    liceo: 'U.E.N. Liceo Ejemplo',
    codigoDea: 'OD00541105',
    firmante: 'Carmen Páez, titular de la cédula de identidad V-9876543',
    cargo: 'Directora',
    cursa: 'cursa',
    lugarYFecha: 'en Valencia, a los 27 días del mes de septiembre de 2026',
    gradoSiguiente: '4to año',
    fechaDeRetiro: '15 de marzo de 2027',
    horas: '60',
    proyecto: ' en el proyecto «Huerto escolar»',
};

const rellenar = (texto: string) => texto.replace(/\{([a-zA-Z]+)\}/g, (m, n: string) => EJEMPLO[n] ?? m);

export function DocumentSettings() {
    const cola = useQueryClient();
    const { data, isLoading, error } = useQuery({
        queryKey: ['plantillas'],
        queryFn: async () => (await api.get('/institutes/current/plantillas')).data.data as Plantilla[],
    });
    const [tipo, setTipo] = React.useState('ESTUDIO');
    const actual = data?.find((p) => p.tipo === tipo);
    const [titulo, setTitulo] = React.useState('');
    const [texto, setTexto] = React.useState('');
    const areaRef = React.useRef<HTMLTextAreaElement>(null);
    React.useEffect(() => {
        if (actual) {
            setTitulo(actual.titulo);
            setTexto(actual.texto);
        }
    }, [actual]);

    const guardar = useMutation({
        mutationFn: async () => (await api.put(`/institutes/current/plantillas/${tipo}`, { titulo, texto })).data,
        onSuccess: () => {
            toast.success('Plantilla guardada');
            void cola.invalidateQueries({ queryKey: ['plantillas'] });
            void cola.invalidateQueries({ queryKey: ['constancia'] });
        },
        onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo guardar la plantilla')),
    });
    const restaurar = useMutation({
        mutationFn: async () => (await api.delete(`/institutes/current/plantillas/${tipo}`)).data,
        onSuccess: () => {
            toast.success('Vuelve el texto de siempre');
            void cola.invalidateQueries({ queryKey: ['plantillas'] });
            void cola.invalidateQueries({ queryKey: ['constancia'] });
        },
        onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo')),
    });

    const insertar = (marcador: string) => {
        const area = areaRef.current;
        const pieza = `{${marcador}}`;
        if (!area) return setTexto((t) => t + pieza);
        const [a, b] = [area.selectionStart ?? texto.length, area.selectionEnd ?? texto.length];
        setTexto(texto.slice(0, a) + pieza + texto.slice(b));
        requestAnimationFrame(() => {
            area.focus();
            area.setSelectionRange(a + pieza.length, a + pieza.length);
        });
    };

    if (isLoading) {
        return (
            <p className="flex items-center gap-2 py-8 text-sm text-gray-600">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando las plantillas…
            </p>
        );
    }
    if (error || !data || !actual) return <p className="text-sm text-rose-700">{getApiErrorMessage(error, 'No se pudieron cargar las plantillas.')}</p>;

    const desconocidos = [...texto.matchAll(/\{([a-zA-Z]+)\}/g)].map((m) => m[1]).filter((m) => !(m in actual.marcadores));
    const cambiado = titulo !== actual.titulo || texto !== actual.texto;

    return (
        <div className="space-y-6">
            <div>
                <h3 className="mb-1 text-lg font-medium text-gray-900">
                    <FileText className="mr-2 inline h-5 w-5" aria-hidden />
                    Constancias
                </h3>
                <p className="text-sm text-gray-600">
                    El texto de cada constancia, con marcadores entre llaves que se rellenan con los datos del alumno. Deja una
                    línea en blanco para separar párrafos.
                </p>
            </div>

            <div className="sm:w-72">
                <Lista etiqueta="Constancia" valor={tipo} alCambiar={setTipo} opciones={data.map((p) => ({ valor: p.tipo, texto: `${NOMBRE[p.tipo] ?? p.tipo}${p.propia ? ' (del liceo)' : ''}` }))} />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-700">
                        Título
                        <input value={titulo} maxLength={80} onChange={(e) => setTitulo(e.target.value)} className="mt-1 min-h-[44px] w-full rounded-lg border border-gray-300 px-3 text-sm" />
                    </label>
                    <label className="block text-sm font-medium text-gray-700">
                        Texto
                        <textarea
                            ref={areaRef}
                            value={texto}
                            maxLength={3000}
                            onChange={(e) => setTexto(e.target.value)}
                            rows={12}
                            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm leading-6"
                        />
                    </label>
                    {desconocidos.length > 0 && (
                        <p className="text-sm text-rose-700">No existen: {desconocidos.map((d) => `{${d}}`).join(', ')}</p>
                    )}
                    <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">Marcadores (toca para ponerlo)</p>
                        <div className="flex flex-wrap gap-2">
                            {Object.entries(actual.marcadores).map(([m, que]) => (
                                <button
                                    key={m}
                                    type="button"
                                    title={que}
                                    onClick={() => insertar(m)}
                                    className="min-h-[44px] rounded-lg border border-gray-200 px-2.5 font-mono text-xs text-indigo-800 hover:bg-indigo-50"
                                >
                                    {`{${m}}`}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => guardar.mutate()}
                            disabled={!cambiado || guardar.isPending || desconocidos.length > 0}
                            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                            {guardar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Guardar
                        </button>
                        {actual.propia && (
                            <button
                                type="button"
                                onClick={() => restaurar.mutate()}
                                disabled={restaurar.isPending}
                                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-gray-200 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                            >
                                <RotateCcw className="h-4 w-4" aria-hidden /> Volver al texto de siempre
                            </button>
                        )}
                    </div>
                </div>

                <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">Vista previa (datos de ejemplo)</p>
                    <article className="rounded-xl border border-gray-200 bg-white p-6 text-gray-900 shadow-xs" aria-label="Vista previa de la constancia">
                        <h4 className="text-center text-sm font-bold uppercase tracking-widest">{titulo}</h4>
                        {rellenar(texto)
                            .split(/\n\s*\n/)
                            .map((p) => p.replace(/\s+/g, ' ').trim())
                            .filter(Boolean)
                            .map((p, i) => (
                                <p key={i} className="mt-4 text-justify text-sm leading-7">
                                    {p}
                                </p>
                            ))}
                    </article>
                </div>
            </div>
        </div>
    );
}
