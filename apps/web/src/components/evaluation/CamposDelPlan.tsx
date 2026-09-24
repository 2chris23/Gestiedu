'use client';

import * as React from 'react';
import { ChevronDown, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ColumnaDelPlan } from './PlanPorBloques';

/**
 * LOS CAMPOS DEL PLAN, ALCANZABLES CON UN DEDO
 *
 * Las columnas del plan las pone el profesor: se añaden, se borran y se les
 * cambia el nombre. Todo eso se hacía con dos iconos de 16 px (➕ y ✕) metidos
 * en la cabecera de una tabla de mil píxeles de ancho — es decir, fuera de la
 * pantalla en cualquier teléfono.
 *
 * Aquí está lo mismo en una lista: el nombre se escribe, se dice si el campo
 * abarca varias semanas o es de cada semana, y se quita con un botón que se
 * puede pulsar.
 *
 * Lo de «abarca varias semanas» no es un adorno: es lo que decide si el campo
 * se escribe una vez por bloque —el tema generador— o una vez por semana —la
 * actividad—. Antes venía fijo en el código para dos columnas concretas, y una
 * columna añadida por el profesor no podía serlo nunca.
 */

interface Props {
    columnas: ColumnaDelPlan[];
    alRenombrar: (key: string, nombre: string) => void;
    alQuitar: (key: string) => void;
    alAnadir: () => void;
    alCambiarSiAbarca: (key: string, abarca: boolean) => void;
    alRestaurar: () => void;
    className?: string;
}

export function CamposDelPlan({
    columnas,
    alRenombrar,
    alQuitar,
    alAnadir,
    alCambiarSiAbarca,
    alRestaurar,
    className,
}: Props) {
    const [abierto, setAbierto] = React.useState(false);

    return (
        <section className={cn('overflow-hidden rounded-xl border border-gray-200 bg-white', className)}>
            <button
                type="button"
                onClick={() => setAbierto((v) => !v)}
                aria-expanded={abierto}
                className="flex min-h-[52px] w-full items-center justify-between gap-2 px-4 py-3 text-left"
            >
                <span>
                    <span className="block text-sm font-bold text-gray-900">Campos del plan</span>
                    <span className="block text-xs text-gray-500">{columnas.length} campos</span>
                </span>
                <ChevronDown
                    className={cn('h-4 w-4 shrink-0 text-gray-400 transition-transform', abierto && 'rotate-180')}
                    aria-hidden
                />
            </button>

            {abierto && (
                <div className="space-y-3 border-t border-gray-100 bg-gray-50 px-4 py-4">
                    {columnas.map((col) => (
                        <div key={col.key} className="rounded-lg border border-gray-200 bg-white p-3">
                            <div className="flex items-center gap-2">
                                <input
                                    value={col.label}
                                    onChange={(e) => alRenombrar(col.key, e.target.value)}
                                    aria-label="Nombre del campo"
                                    className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-semibold text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                                <button
                                    type="button"
                                    onClick={() => alQuitar(col.key)}
                                    title={`Quitar ${col.label}`}
                                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-red-600 transition-colors active:bg-red-50"
                                >
                                    <Trash2 className="h-4 w-4" aria-hidden />
                                    <span className="sr-only">Quitar {col.label}</span>
                                </button>
                            </div>

                            <label className="mt-2 flex min-h-[44px] items-center gap-2.5 text-sm text-gray-700">
                                <input
                                    type="checkbox"
                                    checked={col.mergeable}
                                    onChange={(e) => alCambiarSiAbarca(col.key, e.target.checked)}
                                    className="h-5 w-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                Abarca varias semanas
                            </label>
                        </div>
                    ))}

                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={alAnadir}
                            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white"
                        >
                            <Plus className="h-4 w-4" aria-hidden /> Añadir campo
                        </button>
                        <button
                            type="button"
                            onClick={alRestaurar}
                            title="Volver a los campos del Ministerio"
                            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700"
                        >
                            <RotateCcw className="h-4 w-4" aria-hidden /> Restaurar
                        </button>
                    </div>
                </div>
            )}
        </section>
    );
}

export default CamposDelPlan;
