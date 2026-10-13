'use client';

import Link from 'next/link';
import { CalendarCheck, ChevronRight } from 'lucide-react';

/**
 * «6 ACTIVIDADES PARA HOY · VER» (diseño «Panel Admin»)
 *
 * La franja del color de la app con lo que hay hoy. La usan el Inicio del
 * admin y el del profesor, en el teléfono y en el ordenador: estaba escrita
 * dos veces, letra por letra.
 */
export function LoDeHoy({
    cantidad,
    una,
    varias,
    detalle,
    href,
    marca,
}: {
    cantidad: number;
    una: string;
    varias: string;
    detalle: string;
    /** «Ver» lleva aquí. Sin él, no hay «Ver»: Eventos es solo del admin (al profesor lo devolvía al Inicio). */
    href?: string;
    /** `data-recorrido`, si un paso del recorrido apunta aquí. */
    marca?: string;
}) {
    return (
        <div className="flex items-center gap-3 rounded-[18px] bg-[var(--acento-suave)] py-3 pl-3.5 pr-3 lateral:rounded-[20px] lateral:py-3.5 lateral:pl-4" data-recorrido={marca}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--acento)] text-[var(--sobre-acento)] lateral:h-11 lateral:w-11">
                <CalendarCheck className="h-5 w-5" aria-hidden />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-extrabold text-texto-fuerte lateral:text-base">
                    {cantidad === 0 ? 'Nada programado hoy' : `${cantidad} ${cantidad === 1 ? una : varias} para hoy`}
                </span>
                <span className="truncate text-xs font-semibold text-[var(--acento-hondo)] first-letter:uppercase lateral:text-[13px]">{detalle}</span>
            </span>
            {href && (
                <Link
                    href={href}
                    className="flex h-11 shrink-0 items-center gap-1 rounded-full bg-white px-[18px] text-sm font-extrabold text-cabecera-tinta transition-transform active:scale-[0.97]"
                >
                    Ver <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
                </Link>
            )}
        </div>
    );
}

/** Cuántos del calendario caen hoy («2026-10-12»). */
export function cuantosHoy(eventos: Array<{ date?: string | null }> | undefined, hoy: string): number {
    return (eventos ?? []).filter((e) => e.date?.slice(0, 10) === hoy).length;
}

export default LoDeHoy;
