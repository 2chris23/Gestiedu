'use client';

import * as React from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * LA TABLA QUE EN EL TELÉFONO NO ESCONDE NADA
 *
 * ─── EL PROBLEMA ────────────────────────────────────────────────────────────
 *
 * Una tabla de siete columnas en una pantalla de 375 px no cabe. Lo que hacen
 * casi todos los sistemas es una de estas tres, y las tres están mal:
 *
 *   1. Dejarla salirse: aparece una barra horizontal y el profesor tiene que
 *      arrastrar a ciegas para ver la nota, sin saber ya de qué alumno era.
 *   2. Esconder columnas en pantalla pequeña: el dato existe, se pagó por
 *      calcularlo, viajó por la red... y no se enseña. El profesor no sabe que
 *      le falta algo.
 *   3. Encoger la letra hasta que quepa: ilegible.
 *
 * ─── LO QUE HACE ESTA ───────────────────────────────────────────────────────
 *
 * En pantalla ancha es una tabla de verdad, con sus columnas.
 *
 * En el teléfono **cada fila se convierte en una tarjeta** y cada columna en una
 * línea de «etiqueta → valor». No se esconde ni una: lo que estaba en la fila
 * está en la tarjeta, con su nombre delante para saber qué es.
 *
 * Es el mismo dato, contado en vertical porque el teléfono es vertical.
 *
 * ─── CÓMO SE USA ────────────────────────────────────────────────────────────
 *
 *   <TablaAdaptable
 *       datos={alumnos}
 *       clave={(a) => a.id}
 *       columnas={[
 *           { id: 'nombre', titulo: 'Alumno', principal: true, celda: (a) => <Persona {...a} /> },
 *           { id: 'cedula', titulo: 'Cédula', celda: (a) => a.cedula },
 *           { id: 'promedio', titulo: 'Promedio', alinear: 'derecha', celda: (a) => a.promedio },
 *       ]}
 *       alPulsar={(a) => router.push(`/alumno/${a.id}`)}
 *   />
 *
 * `principal` marca la columna que hace de titular de la tarjeta en el teléfono.
 * Si no se marca ninguna, se usa la primera.
 *
 * ─── ORDENAR ────────────────────────────────────────────────────────────────
 *
 * Se marca `ordenable` en las columnas que lo admitan y se pasan `orden` y
 * `alOrdenar`. En pantalla ancha, la cabecera se pulsa, como siempre. En el
 * teléfono NO hay cabecera que pulsar —son tarjetas—, así que sale una fila de
 * fichas: «Ordenar por: Nombre · Cédula · Promedio». Sin eso, ordenar una lista
 * desde el móvil era imposible: la función existía y no había dónde tocarla.
 */

export interface ColumnaAdaptable<T> {
    /** Identificador único de la columna. */
    id: string;
    /** Lo que se lee en la cabecera, y la etiqueta en el teléfono. */
    titulo: string;
    /** Qué se pinta en la celda. */
    celda: (fila: T, indice: number) => React.ReactNode;
    /** El titular de la tarjeta en pantalla pequeña. Solo una. */
    principal?: boolean;
    /** Alineación en pantalla ancha. Los números, a la derecha. */
    alinear?: 'izquierda' | 'centro' | 'derecha';
    /**
     * Ancho sugerido en pantalla ancha (`w-40`, `w-[12rem]`…).
     * En el teléfono no se usa: allí manda el contenido.
     */
    ancho?: string;
    /**
     * Columna de acciones (botones). En la tarjeta va abajo del todo, sin
     * etiqueta, separada por una línea.
     */
    acciones?: boolean;
    /** Se puede ordenar por ella: cabecera pulsable y ficha en el teléfono. */
    ordenable?: boolean;
    /**
     * No se repite en la tarjeta del teléfono porque ese dato YA está dentro
     * del titular (la cédula debajo del nombre, por ejemplo). Es la única
     * excepción a «en la tarjeta está todo», y solo vale cuando el dato se ve
     * igualmente: esconderlo de verdad es lo que esta tabla existe para evitar.
     */
    soloAncha?: boolean;
    /** El nombre corto para la ficha del teléfono, si el título es largo. */
    tituloCorto?: string;
    /**
     * En la lista COMPACTA del teléfono (`compacta` en la tabla), esta columna
     * sale como una columna estrecha de la fila: su ancho (`w-11`…) y, si hace
     * falta, otro contenido más corto y otro título. Una columna sin esto no
     * sale en la lista compacta: su dato tiene que estar ya en el titular
     * (`celdaCompacta`) o en la ficha a la que lleva la fila.
     */
    compacta?: {
        ancho: string;
        celda?: (fila: T, indice: number) => React.ReactNode;
        titulo?: string;
    };
    /** El titular en la lista compacta: más bajo que el de la tarjeta. */
    celdaCompacta?: (fila: T, indice: number) => React.ReactNode;
}

/** Por qué columna está ordenada la lista, y en qué sentido. */
export interface OrdenDeTabla {
    por: string;
    hacia: 'asc' | 'desc';
}

interface Props<T> {
    datos: T[];
    columnas: Array<ColumnaAdaptable<T>>;
    clave: (fila: T, indice: number) => string;
    /** Si se pasa, la fila entera se puede pulsar. */
    alPulsar?: (fila: T) => void;
    /** Qué enseñar cuando no hay nada. */
    vacio?: React.ReactNode;
    /** Mientras llegan los datos. */
    cargando?: boolean;
    /** Cuántos esqueletos pintar mientras carga. */
    filasFantasma?: number;
    /** Por qué columna está ordenada ahora mismo. */
    orden?: OrdenDeTabla | null;
    /** Se llama al pulsar una columna ordenable. Le toca a quien usa la tabla
     *  decidir si invierte el sentido o empieza de nuevo. */
    alOrdenar?: (por: string) => void;
    /**
     * En el teléfono, una FILA por persona en vez de una tarjeta: el titular a
     * la izquierda y las columnas que llevan `compacta`, estrechas, a la
     * derecha, con una cabecera arriba que sirve para ordenar. Para listas
     * largas que se recorren con la vista (los alumnos de una sección): la
     * tarjeta de cada uno medía 330 px de alto y en la pantalla cabían dos.
     *
     * Las acciones (sacar de la sección) no caben en la fila: salen al pulsar
     * «Editar» en la cabecera.
     */
    compacta?: boolean;
    className?: string;
}

const alineacion = {
    izquierda: 'text-left justify-start',
    centro: 'text-center justify-center',
    derecha: 'text-right justify-end',
} as const;

export function TablaAdaptable<T>({
    datos,
    columnas,
    clave,
    alPulsar,
    vacio,
    cargando = false,
    filasFantasma = 5,
    orden,
    alOrdenar,
    compacta = false,
    className,
}: Props<T>) {
    const [editando, setEditando] = React.useState(false);
    const principal = columnas.find((c) => c.principal) ?? columnas[0];
    const secundarias = columnas.filter((c) => c !== principal && !c.acciones && !c.soloAncha);
    const deAcciones = columnas.filter((c) => c.acciones);
    const ordenables = columnas.filter((c) => c.ordenable && !c.acciones);

    if (cargando) return <Fantasma columnas={columnas.length} filas={filasFantasma} />;

    if (datos.length === 0) {
        return (
            <div className="rounded-lg border border-linea bg-tarjeta px-6 py-14 text-center shadow-1">
                {vacio ?? <p className="text-cuerpo text-tinta-suave">No hay nada que mostrar todavía.</p>}
            </div>
        );
    }

    return (
        <div className={cn('@container w-full', className)}>
            {/* ══ SI LA CAJA DA DE SÍ: la tabla de verdad ════════════════════
                El corte mira el ancho de ESTA CAJA (`@2xl`), no el de la
                ventana. Una tabla metida en una columna estrecha de una
                pantalla grande se comporta como en un teléfono, que es lo
                correcto: lo que importa es el sitio que tiene, no el que tiene
                la pantalla. ══════════════════════════════════════════════ */}
            <div className="hidden overflow-hidden rounded-lg border border-linea bg-tarjeta shadow-1 @2xl:block">
                <table className="w-full border-collapse">
                    <thead>
                        <tr className="border-b border-linea bg-lienzo-hundido/60">
                            {columnas.map((col) => (
                                <th
                                    key={col.id}
                                    scope="col"
                                    aria-sort={
                                        orden?.por === col.id
                                            ? orden.hacia === 'asc'
                                                ? 'ascending'
                                                : 'descending'
                                            : undefined
                                    }
                                    className={cn(
                                        'px-5 py-3.5 text-etiqueta font-semibold uppercase tracking-wide text-tinta-suave',
                                        alineacion[col.alinear ?? 'izquierda'].split(' ')[0],
                                        col.ancho
                                    )}
                                >
                                    {col.acciones ? (
                                        <span className="sr-only">{col.titulo}</span>
                                    ) : col.ordenable && alOrdenar ? (
                                        <button
                                            type="button"
                                            onClick={() => alOrdenar(col.id)}
                                            className={cn(
                                                'inline-flex items-center gap-1 uppercase transition-colors hover:text-tinta',
                                                orden?.por === col.id && 'text-tinta'
                                            )}
                                        >
                                            {col.titulo}
                                            <FlechaDeOrden columna={col.id} orden={orden} />
                                        </button>
                                    ) : (
                                        col.titulo
                                    )}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {datos.map((fila, i) => (
                            <tr
                                key={clave(fila, i)}
                                onClick={alPulsar ? () => alPulsar(fila) : undefined}
                                className={cn(
                                    'border-b border-linea/70 transition-colors duration-150 last:border-0',
                                    alPulsar && 'cursor-pointer hover:bg-indigo-claro/60'
                                )}
                            >
                                {columnas.map((col) => (
                                    <td
                                        key={col.id}
                                        className={cn(
                                            'px-5 py-4 text-cuerpo text-tinta',
                                            alineacion[col.alinear ?? 'izquierda'].split(' ')[0]
                                        )}
                                    >
                                        {col.celda(fila, i)}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* ══ SI NO CABE: una tarjeta por fila, con TODOS los datos ══════
                Y antes, cómo ordenarlas: en una tarjeta no hay cabecera que
                pulsar, así que ordenar se quedaba sin sitio. Se envuelven las
                fichas (`flex-wrap`) en vez de ponerlas en un carril: una fila
                que se arrastra de lado es justo lo que no queremos. */}
            {compacta && (
                <ListaCompacta
                    datos={datos}
                    columnas={columnas}
                    principal={principal}
                    deAcciones={deAcciones}
                    clave={clave}
                    alPulsar={alPulsar}
                    orden={orden}
                    alOrdenar={alOrdenar}
                    editando={editando}
                    alEditar={() => setEditando((e) => !e)}
                />
            )}

            {!compacta && ordenables.length > 0 && alOrdenar && (
                <div className="mb-3 flex flex-wrap items-center gap-2 @2xl:hidden">
                    <span className="text-etiqueta font-medium uppercase tracking-wide text-tinta-tenue">
                        Ordenar por
                    </span>
                    {ordenables.map((col) => {
                        const activa = orden?.por === col.id;
                        return (
                            <button
                                key={col.id}
                                type="button"
                                onClick={() => alOrdenar(col.id)}
                                aria-pressed={activa}
                                className={cn(
                                    'inline-flex min-h-[44px] items-center gap-1 rounded-pastilla border px-3 text-etiqueta font-semibold transition-colors',
                                    activa
                                        ? 'border-indigo bg-indigo text-indigo-encima'
                                        : 'border-linea bg-tarjeta text-tinta-suave'
                                )}
                            >
                                {col.tituloCorto ?? col.titulo}
                                <FlechaDeOrden columna={col.id} orden={orden} />
                            </button>
                        );
                    })}
                </div>
            )}

            <ul className={cn('flex flex-col gap-2.5 @2xl:hidden', compacta && 'hidden')}>
                {datos.map((fila, i) => (
                    <li key={clave(fila, i)}>
                        <div
                            onClick={alPulsar ? () => alPulsar(fila) : undefined}
                            role={alPulsar ? 'button' : undefined}
                            tabIndex={alPulsar ? 0 : undefined}
                            onKeyDown={
                                alPulsar
                                    ? (e) => {
                                          if (e.key === 'Enter' || e.key === ' ') {
                                              e.preventDefault();
                                              alPulsar(fila);
                                          }
                                      }
                                    : undefined
                            }
                            className={cn(
                                'rounded-lg border border-linea bg-tarjeta p-4 shadow-1 transition-transform duration-200 ease-suave',
                                alPulsar && 'cursor-pointer active:scale-[0.985]'
                            )}
                        >
                            {/* El titular */}
                            <div className="text-titulo font-semibold text-tinta">
                                {principal.celda(fila, i)}
                            </div>

                            {/* Y todo lo demás, con su nombre delante */}
                            {secundarias.length > 0 && (
                                <dl className="mt-3 flex flex-col gap-2 border-t border-linea/70 pt-3">
                                    {secundarias.map((col) => (
                                        <div key={col.id} className="flex items-start justify-between gap-4">
                                            <dt className="shrink-0 text-etiqueta font-medium uppercase tracking-wide text-tinta-tenue">
                                                {col.titulo}
                                            </dt>
                                            <dd className="min-w-0 text-right text-cuerpo text-tinta">
                                                {col.celda(fila, i)}
                                            </dd>
                                        </div>
                                    ))}
                                </dl>
                            )}

                            {deAcciones.length > 0 && (
                                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-linea/70 pt-3">
                                    {deAcciones.map((col) => (
                                        <React.Fragment key={col.id}>{col.celda(fila, i)}</React.Fragment>
                                    ))}
                                </div>
                            )}
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}

/**
 * LA LISTA COMPACTA DEL TELÉFONO
 *
 * Una fila por persona: el titular, y las columnas estrechas con su cabecera
 * arriba (que se pulsa para ordenar). La fila entera se pulsa para abrir.
 */
function ListaCompacta<T>({
    datos,
    columnas,
    principal,
    deAcciones,
    clave,
    alPulsar,
    orden,
    alOrdenar,
    editando,
    alEditar,
}: {
    datos: T[];
    columnas: Array<ColumnaAdaptable<T>>;
    principal: ColumnaAdaptable<T>;
    deAcciones: Array<ColumnaAdaptable<T>>;
    clave: (fila: T, indice: number) => string;
    alPulsar?: (fila: T) => void;
    orden?: OrdenDeTabla | null;
    alOrdenar?: (por: string) => void;
    editando: boolean;
    alEditar: () => void;
}) {
    const estrechas = columnas.filter((c) => c.compacta && c !== principal && !c.acciones);
    const sePulsa = Boolean(alPulsar) && !editando;

    const cabecera = (col: ColumnaAdaptable<T>, className?: string) => {
        const titulo = col.compacta?.titulo ?? col.tituloCorto ?? col.titulo;
        if (!col.ordenable || !alOrdenar) {
            return <span className={cn('text-xs font-semibold uppercase tracking-wide text-tinta-tenue', className)}>{titulo}</span>;
        }
        return (
            <button
                type="button"
                onClick={() => alOrdenar(col.id)}
                aria-label={`Ordenar por ${col.titulo}`}
                className={cn(
                    'inline-flex min-h-[44px] items-center gap-0.5 text-xs font-semibold uppercase tracking-wide transition-colors',
                    orden?.por === col.id ? 'text-tinta' : 'text-tinta-tenue',
                    className
                )}
            >
                {titulo}
                {orden?.por === col.id && <FlechaDeOrden columna={col.id} orden={orden} />}
            </button>
        );
    };

    return (
        <div className="overflow-hidden rounded-lg border border-linea bg-tarjeta shadow-1 @2xl:hidden" role="table">
            <div role="row" className="flex items-center gap-1 border-b border-linea bg-lienzo-hundido/60 px-3">
                <div role="columnheader" className="flex min-w-0 flex-1 items-center gap-3">
                    {cabecera(principal)}
                    {deAcciones.length > 0 && (
                        <button
                            type="button"
                            onClick={alEditar}
                            aria-pressed={editando}
                            className="inline-flex min-h-[44px] min-w-[44px] items-center px-1 text-xs font-semibold text-indigo"
                        >
                            {editando ? 'Listo' : 'Editar'}
                        </button>
                    )}
                </div>
                {estrechas.map((col) => (
                    <div
                        key={col.id}
                        role="columnheader"
                        aria-sort={orden?.por === col.id ? (orden.hacia === 'asc' ? 'ascending' : 'descending') : undefined}
                        className={cn('flex shrink-0 justify-center', col.compacta!.ancho)}
                    >
                        {cabecera(col, 'justify-center')}
                    </div>
                ))}
                {editando && deAcciones.length > 0 && <div className="w-11 shrink-0" aria-hidden />}
            </div>

            {datos.map((fila, i) => (
                <div
                    key={clave(fila, i)}
                    role="row"
                    onClick={sePulsa ? () => alPulsar!(fila) : undefined}
                    className={cn(
                        'flex min-h-[56px] items-center gap-1 border-b border-linea/70 px-3 py-1.5 last:border-0',
                        sePulsa && 'cursor-pointer active:bg-indigo-claro/60'
                    )}
                >
                    <div
                        role="cell"
                        className="min-w-0 flex-1"
                        tabIndex={sePulsa ? 0 : undefined}
                        onKeyDown={
                            sePulsa
                                ? (e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                          e.preventDefault();
                                          alPulsar!(fila);
                                      }
                                  }
                                : undefined
                        }
                    >
                        {(principal.celdaCompacta ?? principal.celda)(fila, i)}
                    </div>
                    {estrechas.map((col) => (
                        <div key={col.id} role="cell" className={cn('flex shrink-0 justify-center text-center', col.compacta!.ancho)}>
                            {(col.compacta!.celda ?? col.celda)(fila, i)}
                        </div>
                    ))}
                    {editando &&
                        deAcciones.map((col) => (
                            <div key={col.id} role="cell" className="flex w-11 shrink-0 justify-center">
                                {col.celda(fila, i)}
                            </div>
                        ))}
                </div>
            ))}
        </div>
    );
}

/** La flecha que dice por dónde va el orden. Sin color, para no gritar. */
function FlechaDeOrden({ columna, orden }: { columna: string; orden?: OrdenDeTabla | null }) {
    if (orden?.por !== columna) return <ArrowUpDown className="h-3.5 w-3.5 opacity-40" aria-hidden />;
    return orden.hacia === 'asc' ? (
        <ArrowUp className="h-3.5 w-3.5" aria-hidden />
    ) : (
        <ArrowDown className="h-3.5 w-3.5" aria-hidden />
    );
}

/** Lo que se ve mientras llegan los datos: la forma, sin el contenido. */
function Fantasma({ columnas, filas }: { columnas: number; filas: number }) {
    return (
        <div className="overflow-hidden rounded-lg border border-linea bg-tarjeta shadow-1">
            {Array.from({ length: filas }).map((_, f) => (
                <div
                    key={f}
                    className="flex items-center gap-4 border-b border-linea/70 px-5 py-4 last:border-0"
                >
                    {Array.from({ length: columnas }).map((__, c) => (
                        <div
                            key={c}
                            className="h-4 flex-1 animate-latir rounded-xs bg-lienzo-hundido"
                            style={{ animationDelay: `${(f * columnas + c) * 40}ms` }}
                        />
                    ))}
                </div>
            ))}
        </div>
    );
}
