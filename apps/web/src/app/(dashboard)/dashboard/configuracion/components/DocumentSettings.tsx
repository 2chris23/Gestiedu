'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileText, Plus, RotateCcw, X } from 'lucide-react';
import { Ajustes, BotonGuardar, CargandoAjustes, EN_LA_FILA, Fila, FilaCampo, Grupo } from '@/components/configuracion/ajustes';
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
        <Ajustes className="max-w-5xl">
            <PlantillasDeDocumentos />
            <RecaudosDeInscripcion />
        </Ajustes>
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

    if (isLoading) return <CargandoAjustes />;
    if (error || !data) return <p className="px-4 text-sm text-rose-700">{getApiErrorMessage(error, 'No se pudieron cargar los recaudos.')}</p>;
    const cambiado = JSON.stringify(lista) !== JSON.stringify(data);

    return (
        <div className="space-y-4">
            <Grupo
                id="recaudos"
                titulo="Recaudos de inscripción"
                descripcion="Lo que el liceo pide al inscribir. En la ficha de cada alumno se marca lo que ya entregó."
            >
                {lista.map((r, i) => (
                    <div key={r.clave ?? `nuevo-${i}`} className="flex min-h-[56px] items-center gap-2 px-4 py-1">
                        <input
                            aria-label={`Recaudo ${i + 1}`}
                            value={r.nombre}
                            maxLength={80}
                            onChange={(e) => setLista((l) => l.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))}
                            className="min-h-[44px] min-w-0 flex-1 bg-transparent text-[15px] text-gray-900 outline-none"
                        />
                        <button
                            type="button"
                            onClick={() => setLista((l) => l.filter((_, j) => j !== i))}
                            aria-label={`Quitar «${r.nombre}»`}
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-red-700"
                        >
                            <X className="h-[18px] w-[18px]" aria-hidden />
                        </button>
                    </div>
                ))}
                <form
                    className="flex min-h-[56px] items-center gap-2 px-4 py-1"
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
                        className="min-h-[44px] min-w-0 flex-1 bg-transparent text-[15px] text-gray-900 outline-none placeholder:text-gray-400"
                    />
                    <button type="submit" className="flex min-h-[40px] shrink-0 items-center gap-1 rounded-full bg-gray-100 px-4 text-sm font-medium text-gray-800 hover:bg-gray-200">
                        <Plus className="h-4 w-4" aria-hidden /> Añadir
                    </button>
                </form>
            </Grupo>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                <button
                    type="button"
                    onClick={() => deSiempre.mutate()}
                    disabled={deSiempre.isPending}
                    className="flex min-h-[48px] items-center justify-center gap-2 rounded-full px-5 text-sm font-medium text-gray-700 hover:bg-gray-100"
                >
                    <RotateCcw className="h-4 w-4" aria-hidden /> Volver a la lista de siempre
                </button>
                <BotonGuardar type="button" texto="Guardar recaudos" onClick={() => guardar.mutate()} guardando={guardar.isPending} disabled={!cambiado} />
            </div>
        </div>
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

    if (isLoading) return <CargandoAjustes />;
    if (error || !data || !actual) return <p className="px-4 text-sm text-rose-700">{getApiErrorMessage(error, 'No se pudieron cargar las plantillas.')}</p>;

    const desconocidos = [...texto.matchAll(/\{([a-zA-Z]+)\}/g)].map((m) => m[1]).filter((m) => !(m in actual.marcadores));
    const cambiado = titulo !== actual.titulo || texto !== actual.texto;

    return (
        <div className="space-y-4">
            <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
                <div className="space-y-4">
                    <Grupo
                        id="plantillas"
                        titulo="Textos de los documentos"
                        descripcion="El texto de cada constancia, con marcadores entre llaves que se rellenan solos. Una línea en blanco separa los párrafos."
                    >
                        <Fila icono={FileText} etiqueta="Documento">
                            <Lista
                                etiqueta="Documento"
                                valor={tipo}
                                alCambiar={setTipo}
                                className={EN_LA_FILA}
                                opciones={data.map((p) => ({ valor: p.tipo, texto: `${p.nombre ?? NOMBRE[p.tipo] ?? p.tipo}${p.propia ? ' (del liceo)' : ''}` }))}
                            />
                        </Fila>
                        <FilaCampo etiqueta="Título" value={titulo} maxLength={80} onChange={(e) => setTitulo(e.target.value)} />
                        <div className="px-4 py-3">
                            <label className="block text-[15px] text-gray-900">
                                Texto
                                <textarea
                                    ref={areaRef}
                                    value={texto}
                                    maxLength={3000}
                                    onChange={(e) => setTexto(e.target.value)}
                                    rows={12}
                                    className="mt-1.5 w-full resize-y rounded-xl bg-gray-50 px-3 py-2.5 font-mono text-sm leading-6 text-gray-800 outline-none ring-1 ring-gray-200/80 focus:ring-2 focus:ring-indigo-500"
                                />
                            </label>
                            {desconocidos.length > 0 && <p className="mt-1 text-sm text-rose-700">No existen: {desconocidos.map((d) => `{${d}}`).join(', ')}</p>}
                        </div>
                    </Grupo>

                    <Grupo id="marcadores" titulo="Marcadores" descripcion="Toca uno para ponerlo donde está el cursor.">
                        <div className="flex flex-wrap gap-2 p-4">
                            {Object.entries(actual.marcadores).map(([m, que]) => (
                                <button
                                    key={m}
                                    type="button"
                                    title={que}
                                    onClick={() => insertar(m)}
                                    className="min-h-[40px] rounded-full bg-indigo-50 px-3 font-mono text-xs text-indigo-800 hover:bg-indigo-100"
                                >
                                    {`{${m}}`}
                                </button>
                            ))}
                        </div>
                    </Grupo>

                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                        {actual.propia && (
                            <button
                                type="button"
                                onClick={() => restaurar.mutate()}
                                disabled={restaurar.isPending}
                                className="flex min-h-[48px] items-center justify-center gap-2 rounded-full px-5 text-sm font-medium text-gray-700 hover:bg-gray-100"
                            >
                                <RotateCcw className="h-4 w-4" aria-hidden /> Volver al texto de siempre
                            </button>
                        )}
                        <BotonGuardar type="button" texto="Guardar" onClick={() => guardar.mutate()} guardando={guardar.isPending} disabled={!cambiado || desconocidos.length > 0} />
                    </div>
                </div>

                <Grupo id="vista-previa" titulo="Vista previa (datos de ejemplo)">
                    <article className="modo-claro bg-white p-6 text-gray-900" aria-label="Vista previa de la constancia">
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
                </Grupo>
            </div>
        </div>
    );
}
