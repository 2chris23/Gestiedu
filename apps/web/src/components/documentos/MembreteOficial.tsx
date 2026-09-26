'use client';

import { getAssetUrl } from '@/config/env';
import { useMembrete, type Membrete } from '@/hooks/useMembrete';

/**
 * EL MEMBRETE OFICIAL DEL LICEO
 *
 * Lo que va arriba de toda hoja que el liceo imprime: las líneas del
 * ministerio, el nombre oficial, los códigos del plantel (DEA, estadístico,
 * dependencia), dónde está (zona educativa, parroquia, municipio, entidad), la
 * dirección, el teléfono y el logo. Es el mismo en la boleta, la constancia, el
 * resumen final, el plan de evaluación y el acta de compromiso: antes cada
 * hoja escribía el suyo, el plan con el texto del ministerio fijo en el código
 * y el acta sin el nombre del liceo.
 *
 * Si el membrete no llega (sin señal y sin haberlo guardado), sale al menos el
 * nombre que traiga la hoja (`respaldo`): una boleta sin cabecera no sirve.
 */

/** «Municipio Valencia · Estado Carabobo»: el Distrito Capital no es un estado. */
export function lugarDelPlantel(m: Pick<Membrete, 'zonaEducativa' | 'parroquia' | 'municipio' | 'entidadFederal'>): string {
    const entidad = m.entidadFederal
        ? /^(Distrito Capital|Dependencias Federales)$/.test(m.entidadFederal)
            ? m.entidadFederal
            : `Estado ${m.entidadFederal}`
        : null;
    return [
        m.zonaEducativa,
        m.parroquia && `Parroquia ${m.parroquia}`,
        m.municipio && `Municipio ${m.municipio}`,
        entidad,
    ]
        .filter(Boolean)
        .join(' · ');
}

export function codigosDelPlantel(m: Pick<Membrete, 'codigoDea' | 'codigoEstadistico' | 'codigoDependencia'>): string {
    return [
        m.codigoDea && `Código DEA: ${m.codigoDea}`,
        m.codigoEstadistico && `Código estadístico: ${m.codigoEstadistico}`,
        m.codigoDependencia && `Código de dependencia: ${m.codigoDependencia}`,
    ]
        .filter(Boolean)
        .join(' · ');
}

export function MembreteOficial({
    respaldo,
    className = '',
}: {
    /** El nombre y la dirección que ya trae la hoja, por si el membrete no llega. */
    respaldo?: { nombre?: string | null; direccion?: string | null };
    className?: string;
}) {
    const { data: m, isLoading } = useMembrete();

    if (isLoading && !m) {
        return (
            <div className={`flex flex-col items-center gap-2 py-2 ${className}`} aria-hidden>
                <div className="h-3 w-64 max-w-full rounded bg-gray-100" />
                <div className="h-4 w-48 max-w-full rounded bg-gray-100" />
            </div>
        );
    }

    const nombre = m?.nombre || respaldo?.nombre || '';
    const codigos = m ? codigosDelPlantel(m) : '';
    const lugar = m ? lugarDelPlantel(m) : '';
    const direccion = [m?.direccion ?? respaldo?.direccion, m?.telefono && `Telf. ${m.telefono}`].filter(Boolean).join(' · ');
    const logo = m?.logo ? getAssetUrl(m.logo) : null;

    return (
        <div className={`flex items-center gap-3 ${className}`} data-membrete>
            {logo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt="" className="h-14 w-14 shrink-0 object-contain sm:h-16 sm:w-16" />
            )}
            <div className="min-w-0 flex-1 text-center">
                {m?.ministerio?.map((linea) => (
                    <p key={linea} className="text-xs font-semibold uppercase tracking-wide text-gray-800">
                        {linea}
                    </p>
                ))}
                {nombre && <p className="mt-0.5 text-base font-bold text-gray-900 sm:text-lg">{nombre}</p>}
                {codigos && <p className="text-xs text-gray-800">{codigos}</p>}
                {lugar && <p className="text-xs text-gray-700">{lugar}</p>}
                {direccion && <p className="text-xs text-gray-700">{direccion}</p>}
            </div>
            {/* Del mismo ancho que el logo: el texto queda centrado en la hoja. */}
            {logo && <div className="h-14 w-14 shrink-0 sm:h-16 sm:w-16" aria-hidden />}
        </div>
    );
}

export default MembreteOficial;
