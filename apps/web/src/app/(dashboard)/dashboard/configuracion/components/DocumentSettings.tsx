'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileText, Loader2, Plus, RotateCcw, X } from 'lucide-react';
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
    /** Cómo se llama el documento y un ejemplo de cada marcador (los da el servidor). */
    nombre?: string;
    ejemplo?: Record<string, string>;
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

const rellenar = (texto: string, ejemplo: Record<string, string> = {}) =>
    texto.replace(/\{([a-zA-Z]+)\}/g, (m, n: string) => ejemplo[n] ?? EJEMPLO[n] ?? m);

export function DocumentSettings() {
    return (
        <div className="space-y-10">
            <PlantillasDeDocumentos />
            <RecaudosDeInscripcion />
        </div>
    );
}

/**
 * LO QUE EL LICEO PIDE AL INSCRIBIR
 *
 * La lista de recaudos (partida de nacimiento, fotos…) que luego se marca en
 * la ficha de cada alumno. Por defecto, lo que suele pedir un liceo del MPPE.
 */
function RecaudosDeInscripcion() {
    const cola = useQueryClient();
    const { data, isLoading, error } = useQuery({
        queryKey: ['recaudos-del-liceo'],
        queryFn: async () => (await api.get('/institutes/current/recaudos')).data.data as Array<{ clave: string; nombre: string }>,
    });
    const [lista, setLista] = React.useState<Array<{ clave?: string; nombre: string }>>([]);
    const [nuevo, setNuevo] = React.useState('');
    React.useEffect(() => {
        if (data) setLista(data);
    }, [data]);
    const alGuardar = () => {
        toast.success('Recaudos guardados');
        void cola.invalidateQueries({ queryKey: ['recaudos-del-liceo'] });
        void cola.invalidateQueries({ queryKey: ['recaudos'] });
    };
    const guardar = useMutation({
        mutationFn: async () => (await api.put('/institutes/current/recaudos', { recaudos: lista.filter((r) => r.nombre.trim()) })).data,
        onSuccess: alGuardar,
        onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudieron guardar los recaudos')),
    });
    const deSiempre = useMutation({
        mutationFn: async () => (await api.delete('/institutes/current/recaudos')).data,
        onSuccess: alGuardar,
        onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo')),
    });

    if (isLoading) return <p className="text-sm text-gray-600">Cargando los recaudos…</p>;
    if (error || !data) return <p className="text-sm text-rose-700">{getApiErrorMessage(error, 'No se pudieron cargar los recaudos.')}</p>;
    const cambiado = JSON.stringify(lista) !== JSON.stringify(data);

    return (
        <section aria-labelledby="recaudos-titulo" className="space-y-3">
            <div>
                <h3 id="recaudos-titulo" className="mb-1 text-lg font-medium text-gray-900">
                    Recaudos de inscripción
                </h3>
                <p className="text-sm text-gray-600">
                    Lo que el liceo pide al inscribir. En la ficha de cada alumno se marca lo que ya entregó; crear su cuenta no lo pide.
                </p>
            </div>
            <ul className="space-y-2">
                {lista.map((r, i) => (
                    <li key={r.clave ?? `nuevo-${i}`} className="flex items-center gap-2">
                        <input
                            aria-label={`Recaudo ${i + 1}`}
                            value={r.nombre}
                            maxLength={80}
                            onChange={(e) => setLista((l) => l.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))}
                            className="min-h-[44px] flex-1 rounded-lg border border-gray-300 px-3 text-sm"
                        />
                        <button
                            type="button"
                            onClick={() => setLista((l) => l.filter((_, j) => j !== i))}
                            aria-label={`Quitar «${r.nombre}»`}
                            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                        >
                            <X className="h-4 w-4" aria-hidden />
                        </button>
                    </li>
                ))}
            </ul>
            <form
                className="flex gap-2"
                onSubmit={(e) => {
                    e.preventDefault();
                    if (nuevo.trim().length < 3) return;
                    setLista((l) => [...l, { nombre: nuevo.trim() }]);
                    setNuevo('');
                }}
            >
                <input
                    aria-label="Recaudo nuevo"
                    placeholder="Otro recaudo (p. ej. «Carpeta marrón»)"
                    value={nuevo}
                    maxLength={80}
                    onChange={(e) => setNuevo(e.target.value)}
                    className="min-h-[44px] flex-1 rounded-lg border border-gray-300 px-3 text-sm"
                />
                <button type="submit" className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50">
                    <Plus className="h-4 w-4" aria-hidden /> Añadir
                </button>
            </form>
            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={() => guardar.mutate()}
                    disabled={!cambiado || guardar.isPending}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                    {guardar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Guardar recaudos
                </button>
                <button
                    type="button"
                    onClick={() => deSiempre.mutate()}
                    disabled={deSiempre.isPending}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-gray-200 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                    <RotateCcw className="h-4 w-4" aria-hidden /> Volver a la lista de siempre
                </button>
            </div>
        </section>
    );
}

function PlantillasDeDocumentos() {
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
                    Textos de los documentos
                </h3>
                <p className="text-sm text-gray-600">
                    El texto de cada constancia y de los demás documentos del liceo, con marcadores entre llaves que se
                    rellenan solos. Deja una línea en blanco para separar párrafos.
                </p>
            </div>

            <div className="sm:w-72">
                <Lista etiqueta="Documento" valor={tipo} alCambiar={setTipo} opciones={data.map((p) => ({ valor: p.tipo, texto: `${p.nombre ?? NOMBRE[p.tipo] ?? p.tipo}${p.propia ? ' (del liceo)' : ''}` }))} />
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
                        {rellenar(texto, actual.ejemplo)
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
