'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { losAccesosDe } from '@/lib/el-menu';

/**
 * LO QUE ESTABA EN LA CORTINA, A LA VISTA
 *
 * En el teléfono, todo lo que no cabía en la barra de abajo vivía detrás de un
 * botón de «Menú» que abría una cortina lateral: dos toques para llegar a
 * cualquier sitio, y la cortina tapando la pantalla que se acababa de abrir.
 *
 * Aquí está lo mismo, en el panel de inicio, de un vistazo y de un toque.
 * Por eso la cortina ya no existe en el móvil.
 *
 * En pantalla grande estos accesos también se pintan: la barra lateral sigue
 * ahí, pero un panel que solo tiene cuatro cifras y nada más desaprovecha el
 * sitio, y el mismo botón grande funciona igual de bien con un ratón.
 */
export function AccesosDelLiceo({ rol, conPagos }: { rol?: string; conPagos: boolean }) {
    const accesos = losAccesosDe(rol, conPagos);
    if (accesos.length === 0) return null;

    return (
        <section aria-labelledby="accesos-del-liceo">
            <h2 id="accesos-del-liceo" className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                Ir a
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {accesos.map(({ name, href, icon: Icono, pista }) => (
                    <Link
                        key={href}
                        href={href}
                        className="group flex min-h-[92px] flex-col justify-between rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition-colors active:bg-indigo-50 hover:border-indigo-200"
                    >
                        <span className="flex items-center justify-between">
                            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50">
                                <Icono className="h-5 w-5 text-indigo-600" aria-hidden />
                            </span>
                            <ChevronRight className="h-4 w-4 text-gray-300" aria-hidden />
                        </span>
                        <span className="mt-2 block">
                            <span className="block text-sm font-semibold text-gray-900">{name}</span>
                            {pista && <span className="mt-0.5 block text-xs leading-snug text-gray-500">{pista}</span>}
                        </span>
                    </Link>
                ))}
            </div>
        </section>
    );
}

export default AccesosDelLiceo;
