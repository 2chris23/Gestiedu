'use client';

import * as React from 'react';
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
    className,
}: Props<T>) {
    const principal = columnas.find((c) => c.principal) ?? columnas[0];
    const secundarias = columnas.filter((c) => c !== principal && !c.acciones);
    const deAcciones = columnas.filter((c) => c.acciones);

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
                                    className={cn(
                                        'px-5 py-3.5 text-etiqueta font-semibold uppercase tracking-wide text-tinta-suave',
                                        alineacion[col.alinear ?? 'izquierda'].split(' ')[0],
                                        col.ancho
                                    )}
                                >
                                    {col.acciones ? <span className="sr-only">{col.titulo}</span> : col.titulo}
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

            {/* ══ SI NO CABE: una tarjeta por fila, con TODOS los datos ══════ */}
            <ul className="flex flex-col gap-2.5 @2xl:hidden">
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
