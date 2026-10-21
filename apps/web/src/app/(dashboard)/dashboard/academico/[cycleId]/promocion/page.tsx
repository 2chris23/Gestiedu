'use client';

import { usePromocion } from '@/components/promocion/usePromocion';

import {
    ArrowLeft,
    CheckCircle2,
    Wand2,
    Loader2,
} from 'lucide-react';
import { VentanasDeLaPromocion } from '@/components/promocion/VentanasDeLaPromocion';
import { ListaDeLaPromocion } from '@/components/promocion/ListaDeLaPromocion';

export default function PromotionPage() {
    const c = usePromocion();
    const {
        router,
        loading,
        yearName,
        suggestions,
        strategies,
        applyingStrategy,
        nextYear,
        setConfirmOpen,
        allAssignedCount,
        applyStrategy,
    } = c;

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50/50 flex items-center justify-center text-gray-500 font-medium">
                <Loader2 className="w-6 h-6 animate-spin mr-2 text-indigo-600" /> Cargando panel de promoción...
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* LA FRANJA DE ARRIBA, DE BORDE A BORDE Y ALINEADA
                Iba con su propio `px-4` DENTRO del margen del marco: una franja
                blanca que no llegaba a los bordes y un título 16 px más adentro
                que todo lo demás. Ahora sale de borde a borde (márgenes negativos
                iguales a los del marco) y su contenido cae en la misma columna.
                Pegada arriba solo con barra lateral: en el teléfono, título,
                botón y estrategias pegados se comían media pantalla al bajar. */}
            <header className="-mx-4 -mt-6 border-b border-gray-200 bg-white px-4 py-4 shadow-xs sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 lateral:sticky lateral:top-0 lateral:z-30">
                <div>
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => router.push(`/dashboard/academico/${yearName}/cierre`)}
                                className="-ml-2.5 flex h-11 w-11 shrink-0 items-center justify-center hover:bg-gray-100 rounded-full text-gray-500 transition-colors"
                                title="Volver al panel académico"
                                aria-label="Volver al ciclo"
                            >
                                <ArrowLeft className="w-5 h-5" aria-hidden />
                            </button>
                            <div>
                                <h1 className="text-seccion font-bold text-gray-900 sm:text-pantalla">
                                    Colocar y cerrar — Ciclo {yearName}
                                </h1>
                                <p className="text-sm text-gray-500">
                                    {suggestions.length} estudiantes matriculados · <strong className="text-indigo-600">{allAssignedCount}</strong> con destino asignado
                                </p>
                            </div>
                        </div>

                        <button
                            onClick={() => setConfirmOpen(true)}
                            disabled={!nextYear}
                            className="min-h-[44px] px-5 py-2.5 text-sm font-bold rounded-xl shadow-sm transition-all flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                        >
                            <CheckCircle2 className="w-4 h-4" />
                            Confirmar y Cerrar Ciclo
                        </button>
                    </div>

                    {!nextYear && (
                        <p role="alert" className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                            Falta el año escolar siguiente. Créalo en el{' '}
                            <a href={`/dashboard/academico/${yearName}/cierre`} className="font-semibold underline">
                                paso 5 del fin de año
                            </a>{' '}
                            (con el calendario del MPPE y las secciones de este año) y vuelve aquí para colocar a los alumnos.
                        </p>
                    )}

                    {/* Barra de Estrategias Automáticas */}
                    <div className="mt-4 pt-3 border-t border-gray-100 flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-gray-600 uppercase tracking-wide flex items-center gap-1">
                            <Wand2 className="w-3.5 h-3.5 text-indigo-600" /> Estrategia Automática:
                        </span>
                        {strategies.map(s => (
                            <button
                                key={s.key}
                                onClick={() => applyStrategy(s.key)}
                                disabled={applyingStrategy !== null}
                                className="whitespace-nowrap px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-200 bg-white text-gray-700 hover:border-indigo-400 hover:bg-indigo-50/50 hover:text-indigo-700 transition-colors disabled:opacity-50"
                                title={s.description}
                            >
                                {applyingStrategy === s.key ? 'Aplicando...' : s.name}
                            </button>
                        ))}
                    </div>
                </div>
            </header>

            <ListaDeLaPromocion c={c} />

            <VentanasDeLaPromocion c={c} />
        </div>
    );
}
