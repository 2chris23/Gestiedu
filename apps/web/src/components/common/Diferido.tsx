'use client';

import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import { WifiOff } from 'lucide-react';

/**
 * CARGAR UNA PARTE DE LA PANTALLA SOLO CUANDO HACE FALTA
 *
 * Un modal, una pestaña o una gráfica que no se ve al abrir la pantalla no
 * tiene por qué bajar con ella: se baja al abrirlo. En un teléfono con datos
 * lentos es la diferencia entre que la pantalla salga ya o dentro de un rato.
 *
 *   const FormularioDeUsuario = diferido(() => import('@/components/users/UserForm'), { alto: 480 });
 *
 * Mientras llega sale un esqueleto (barras sin texto) del alto que se diga,
 * para que la pantalla no salte.
 *
 * SIN SEÑAL. Lo que se abrió alguna vez con internet queda guardado en el
 * teléfono (`public/sw.js` guarda todo `/_next/static/`), así que se vuelve a
 * ver igual. Lo que no se abrió nunca no está: en vez de romper la pantalla
 * entera, esa parte dice que no está guardada y ofrece reintentar.
 */

export function Esqueleto({ alto = 160 }: { alto?: number }) {
    return (
        <div className="w-full space-y-3 p-4" style={{ minHeight: alto }} aria-hidden data-esqueleto>
            <div className="h-4 w-1/3 animate-pulse rounded bg-gray-100" />
            <div className="h-4 w-full animate-pulse rounded bg-gray-100" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-gray-100" />
        </div>
    );
}

export function NoEstaGuardado() {
    return (
        <div role="status" className="flex flex-col items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-center text-sm text-amber-900">
            <WifiOff className="h-5 w-5" aria-hidden />
            <p>Esta parte no se ha abierto nunca con internet, así que no está guardada en el teléfono.</p>
            <button
                type="button"
                onClick={() => window.location.reload()}
                className="min-h-11 rounded-lg px-4 font-semibold text-amber-900 underline hover:bg-amber-100"
            >
                Reintentar
            </button>
        </div>
    );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function diferido<C extends ComponentType<any>>(
    cargar: () => Promise<{ default: C }>,
    { alto, sinEsqueleto }: { alto?: number; sinEsqueleto?: boolean } = {}
): C {
    return dynamic(
        () => cargar().catch(() => ({ default: NoEstaGuardado as unknown as C })),
        { ssr: false, loading: () => (sinEsqueleto ? null : <Esqueleto alto={alto} />) }
    ) as unknown as C;
}
