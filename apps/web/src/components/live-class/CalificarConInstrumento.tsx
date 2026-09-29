'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { ClipboardList, Loader2, X } from 'lucide-react';
import { useCalificarConInstrumento } from '@/hooks/useInstrumentos';
import { NIVELES_POR_DEFECTO, maximoDelInstrumento, notaDelInstrumento, type Instrumento, type Marcas } from '@/lib/instrumentos';
import { NOMBRE_DEL_TIPO } from '@/components/evaluation/nombres-de-instrumentos';
import { getApiErrorMessage, cn } from '@/lib/utils';

/**
 * CALIFICAR CON EL INSTRUMENTO: LA TABLA DE LA CLASE, CAMBIADA
 *
 * Al pulsar «Dar nota» en una actividad con instrumento, la tabla de alumnos
 * pasa a tener una columna por indicador del instrumento y la nota al final.
 * Antes era una tarjeta por alumno: treinta tarjetas que ocupaban la pantalla.
 *
 * Cada indicador se puntúa de 0 a lo que vale: la portada está pero mal hecha
 * saca 1 de 2 (en la lista de cotejo y por puntos). En la escala y la rúbrica,
 * el nivel. La nota sale sola y se guarda sola, en tandas (lo que se escribe
 * seguido va en UNA petición), como la asistencia. En el teléfono la tabla se
 * desliza de lado con el nombre fijo a la izquierda.
 */

type Alumno = { id: string; firstName: string; lastName: string };
type Detalle = Record<string, { marcas: Marcas; total: number | null }>;

const ESPERA_MS = 700;

/** Los puntos que enseña la casilla: una marca vieja de sí/no se lee como todo o nada. */
function puntosEnLaCasilla(m: Marcas[string] | undefined, vale: number): string {
    if (m === true) return String(vale);
    if (m === false) return '0';
    return typeof m === 'number' ? String(m) : '';
}

/**
 * UNA CASILLA DE PUNTOS
 *
 * Lleva su propio texto mientras se escribe: con la casilla atada al número,
 * «1,» se borraba al instante y no había forma de poner 1,5. Coma o punto, da
 * igual; más de lo que vale se queda en lo que vale.
 */
function CeldaDePuntos({
    valor,
    vale,
    disabled,
    etiqueta,
    alCambiar,
}: {
    valor: Marcas[string] | undefined;
    vale: number;
    disabled: boolean;
    etiqueta: string;
    alCambiar: (n: number | null) => void;
}) {
    const deFuera = puntosEnLaCasilla(valor, vale);
    const [texto, setTexto] = React.useState(deFuera);
    const escribiendo = React.useRef(false);
    React.useEffect(() => {
        if (!escribiendo.current) setTexto(deFuera);
    }, [deFuera]);
    return (
        <input
            type="text"
            inputMode="decimal"
            disabled={disabled}
            value={texto}
            placeholder="—"
            onFocus={() => (escribiendo.current = true)}
            onBlur={() => {
                escribiendo.current = false;
                setTexto(deFuera);
            }}
            onChange={(e) => {
                const t = e.target.value.replace(/[^\d.,]/g, '');
                setTexto(t);
                if (t === '') return alCambiar(null);
                const n = Number(t.replace(',', '.'));
                if (!Number.isFinite(n)) return;
                const puesto = Math.min(Math.max(n, 0), vale);
                if (puesto !== n) setTexto(String(puesto));
                alCambiar(puesto);
            }}
            className="min-h-[44px] w-20 rounded-lg border border-gray-300 px-2 text-right tabular-nums focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-gray-50"
            aria-label={etiqueta}
        />
    );
}

export default function CalificarConInstrumento({
    activityId,
    instrumento,
    detalle,
    alumnos,
    puedeEditar,
}: {
    activityId: string;
    instrumento: Instrumento;
    detalle: Detalle | null | undefined;
    alumnos: Alumno[];
    puedeEditar: boolean;
}) {
    const calificar = useCalificarConInstrumento();
    const [marcas, setMarcas] = React.useState<Record<string, Marcas>>(() =>
        Object.fromEntries(Object.entries(detalle ?? {}).map(([id, d]) => [id, d.marcas ?? {}]))
    );
    const [guardadoA, setGuardadoA] = React.useState<string | null>(null);
    const pendientes = React.useRef<Record<string, Marcas | null>>({});
    const reloj = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const maximo = maximoDelInstrumento(instrumento);
    const niveles = instrumento.niveles ?? NIVELES_POR_DEFECTO;
    const porPuntos = instrumento.tipo === 'COTEJO' || instrumento.tipo === 'PUNTOS';

    // `mutate` cambia en cada pintada: por referencia, para que la limpieza de
    // abajo no mande la tanda antes de tiempo.
    const mutar = React.useRef(calificar.mutate);
    React.useEffect(() => {
        mutar.current = calificar.mutate;
    });
    const enviar = React.useCallback(() => {
        const tanda = pendientes.current;
        pendientes.current = {};
        if (Object.keys(tanda).length === 0) return;
        mutar.current(
            { activityId, marcas: tanda },
            {
                onSuccess: () => setGuardadoA(new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })),
                onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudieron guardar las notas')),
            }
        );
    }, [activityId]);

    // Lo que quedara por mandar al salir, se manda.
    React.useEffect(
        () => () => {
            if (reloj.current) clearTimeout(reloj.current);
            enviar();
        },
        [enviar]
    );

    const marcar = (alumno: string, nuevas: Marcas | null) => {
        setMarcas((m) => {
            const copia = { ...m };
            if (nuevas === null) delete copia[alumno];
            else copia[alumno] = nuevas;
            return copia;
        });
        pendientes.current[alumno] = nuevas;
        if (reloj.current) clearTimeout(reloj.current);
        reloj.current = setTimeout(enviar, ESPERA_MS);
    };

    const notaDe = (m: Marcas | undefined) => {
        if (!m) return null;
        try {
            return notaDelInstrumento(instrumento, m);
        } catch {
            return null;
        }
    };

    const celda = 'border-b border-gray-100 px-2 py-1.5';

    return (
        <section className="space-y-3" aria-label="Calificar con el instrumento">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
                <span className="flex items-center gap-2">
                    <ClipboardList className="h-4 w-4" aria-hidden />
                    {NOMBRE_DEL_TIPO[instrumento.tipo]} · vale {maximo}
                    {porPuntos && <span className="text-xs text-indigo-800">· cada indicador de 0 a lo que vale</span>}
                </span>
                <span className="text-xs" role="status">
                    {calificar.isPending ? (
                        <span className="inline-flex items-center gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Guardando…
                        </span>
                    ) : guardadoA ? (
                        `Guardado ${guardadoA}`
                    ) : (
                        'Se guarda solo'
                    )}
                </span>
            </div>

            <div className="relative overflow-x-auto rounded-xl border border-gray-200 bg-white" data-carril-a-proposito>
                <table className="w-full border-collapse text-sm" aria-label="Notas con el instrumento">
                    <thead>
                        <tr className="bg-gray-50 text-left text-xs font-bold uppercase tracking-wide text-gray-700">
                            <th scope="col" className="sticky left-0 z-10 min-w-[10rem] border-b border-gray-200 bg-gray-50 px-3 py-2">
                                Alumno
                            </th>
                            {instrumento.criterios.map((c) => (
                                <th key={c.id} scope="col" className="min-w-[6.5rem] border-b border-gray-200 px-2 py-2 align-bottom normal-case">
                                    <span className="block text-xs font-semibold leading-tight text-gray-900">{c.texto}</span>
                                    <span className="block text-xs font-medium text-gray-600">
                                        {porPuntos ? `de 0 a ${c.puntos}` : (c.peso ?? 1) !== 1 ? `peso ${c.peso}` : 'nivel'}
                                    </span>
                                </th>
                            ))}
                            <th scope="col" className="border-b border-gray-200 px-2 py-2 text-right">
                                Nota / {maximo}
                            </th>
                            {puedeEditar && <th scope="col" className="w-12 border-b border-gray-200"><span className="sr-only">Quitar</span></th>}
                        </tr>
                    </thead>
                    <tbody>
                        {alumnos.map((a) => {
                            const suyas = marcas[a.id];
                            const nota = notaDe(suyas);
                            const nombre = `${a.lastName}, ${a.firstName}`;
                            return (
                                <tr key={a.id} className="hover:bg-indigo-50/30">
                                    <th scope="row" className={cn(celda, 'sticky left-0 z-10 bg-white px-3 text-left font-semibold text-gray-900')}>
                                        {nombre}
                                    </th>
                                    {instrumento.criterios.map((c) => {
                                        const valor = suyas?.[c.id];
                                        const cambiar = (v: boolean | string | number | null) => {
                                            const nuevas: Marcas = { ...(suyas ?? {}) };
                                            if (v === null) delete nuevas[c.id];
                                            else nuevas[c.id] = v;
                                            marcar(a.id, Object.keys(nuevas).length ? nuevas : null);
                                        };
                                        if (porPuntos) {
                                            const vale = c.puntos ?? 0;
                                            return (
                                                <td key={c.id} className={celda}>
                                                    <CeldaDePuntos
                                                        valor={valor}
                                                        vale={vale}
                                                        disabled={!puedeEditar}
                                                        etiqueta={`${nombre}: ${c.texto} (de 0 a ${vale})`}
                                                        alCambiar={cambiar}
                                                    />
                                                </td>
                                            );
                                        }
                                        return (
                                            <td key={c.id} className={celda}>
                                                <select
                                                    disabled={!puedeEditar}
                                                    value={typeof valor === 'string' ? valor : ''}
                                                    onChange={(e) => cambiar(e.target.value || null)}
                                                    title={typeof valor === 'string' ? instrumento.descriptores?.[c.id]?.[valor] : undefined}
                                                    className="min-h-[44px] w-24 rounded-lg border border-gray-300 bg-white px-2 text-sm font-semibold focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-gray-50"
                                                    aria-label={`${nombre}: ${c.texto}`}
                                                >
                                                    <option value="">—</option>
                                                    {niveles.map((n) => (
                                                        <option key={n.id} value={n.id}>
                                                            {n.id} · {n.nombre}
                                                        </option>
                                                    ))}
                                                </select>
                                            </td>
                                        );
                                    })}
                                    <td className={cn(celda, 'text-right')}>
                                        <span
                                            className={cn(
                                                'inline-block whitespace-nowrap rounded-lg px-2 py-1 text-sm font-bold tabular-nums',
                                                nota === null ? 'bg-gray-100 text-gray-700' : 'bg-emerald-50 text-emerald-800'
                                            )}
                                        >
                                            {nota === null ? (suyas ? 'Incompleto' : 'Sin nota') : nota}
                                        </span>
                                    </td>
                                    {puedeEditar && (
                                        <td className={celda}>
                                            {suyas && (
                                                <button
                                                    type="button"
                                                    onClick={() => marcar(a.id, null)}
                                                    aria-label={`Quitar la nota de ${nombre}`}
                                                    title="Quitar su nota"
                                                    className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-rose-50 hover:text-rose-700"
                                                >
                                                    <X className="h-4 w-4" aria-hidden />
                                                </button>
                                            )}
                                        </td>
                                    )}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </section>
    );
}
