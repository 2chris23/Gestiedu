'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check, ChevronRight, CalendarCheck } from 'lucide-react';
import { losAccesosDe } from '@/lib/el-menu';
import { CuadroDeHonorWidget } from '@/components/dashboard/widgets';
import { InicioMovil, EsqueletoDelInicioMovil, type TarjetaMetricaMovil } from './InicioMovil';

export { EsqueletoDelInicioMovil };

/**
 * EL INICIO DEL ADMIN EN EL TELÉFONO (diseño «Panel Admin — App móvil», 2026-10-05)
 *
 * Construido sobre la pieza común `InicioMovil` (Fase C).
 * Arriba, en azul y pegado a la cabecera: el promedio del liceo, el ciclo, y
 * asistencia y alumnos en riesgo. Debajo, sobre una hoja que se monta en el
 * azul: los accesos, lo de hoy y el cuadro de honor.
 *
 * En el ordenador sigue el Inicio de siempre: esto es `lateral:hidden`.
 */

export interface DatosDelInicioMovil {
    promedioGeneral: number | null;
    ciclo: string | null;
    estudiantes: number;
    asistencia: number;
    enRiesgo: number;
    actividadesDeHoy: number;
    hoyLeido: string;
    lapso: string | null;
}

const PRIMERO = ['/dashboard/academico', '/dashboard/horarios', '/dashboard/pagos', '/dashboard/eventos'];

export function InicioDelAdminMovil({ datos, conPagos }: { datos: DatosDelInicioMovil; conPagos: boolean }) {
    const accesos = losAccesosDe('ADMIN', conPagos);
    const ordenados = [
        ...(PRIMERO.map((h) => accesos.find((a) => a.href === h)).filter(Boolean) as typeof accesos),
        ...accesos.filter((a) => !PRIMERO.includes(a.href)),
    ];

    const tarjetaAsistencia: TarjetaMetricaMovil = {
        titulo: 'Asistencia',
        valor: `${datos.asistencia}%`,
        subtitulo: 'Últimos 30 días',
        porcentajeBarra: Math.max(0, Math.min(100, datos.asistencia)),
        colorBarra: 'var(--acento)',
        icono: (
            <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[var(--acento)] text-[var(--sobre-acento)]">
                <Check className="h-4 w-4" strokeWidth={2.4} aria-hidden />
            </span>
        ),
        href: '/dashboard/academico',
    };

    const tarjetaRiesgo: TarjetaMetricaMovil = {
        titulo: 'En riesgo',
        valor: datos.enRiesgo,
        subtitulo: 'Con materias reprobadas',
        porcentajeBarra: datos.estudiantes > 0 ? Math.min(100, (datos.enRiesgo / datos.estudiantes) * 100) : 0,
        colorBarra: '#EF5350',
        icono: (
            <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[#EF5350] text-sm font-extrabold text-white" aria-hidden>
                !
            </span>
        ),
        href: '/dashboard/academico',
    };

    return (
        <InicioMovil
            tituloCifra="Promedio general"
            cifra={datos.promedioGeneral}
            sufijoCifra="/ 20"
            etiquetaSecundaria={[datos.ciclo ? `Ciclo ${datos.ciclo}` : 'Sin ciclo activo', `${datos.estudiantes} estudiantes`].join(' · ')}
            tarjetaIzquierda={tarjetaAsistencia}
            tarjetaDerecha={tarjetaRiesgo}
            accesos={ordenados}
            etiquetaAria="El liceo hoy"
        >
            <div className="flex items-center gap-3 rounded-[18px] bg-[var(--acento-suave)] py-3 pl-3.5 pr-3" data-recorrido="calendario-del-liceo">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--acento)] text-[var(--sobre-acento)]">
                    <CalendarCheck className="h-5 w-5" aria-hidden />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[15px] font-extrabold text-[#0B1B33]">
                        {datos.actividadesDeHoy === 0
                            ? 'Nada programado hoy'
                            : `${datos.actividadesDeHoy} ${datos.actividadesDeHoy === 1 ? 'actividad' : 'actividades'} para hoy`}
                    </span>
                    <span className="truncate text-xs font-semibold text-[var(--acento-hondo)] first-letter:uppercase">
                        {[datos.hoyLeido, datos.lapso].filter(Boolean).join(' · ')}
                    </span>
                </span>
                <Link
                    href="/dashboard/eventos"
                    className="flex h-11 shrink-0 items-center gap-1 rounded-full bg-white px-[18px] text-sm font-extrabold text-[#0D47A1]"
                >
                    Ver <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
                </Link>
            </div>

            <div data-recorrido="cuadro-de-honor">
                <CuadroDeHonorWidget />
            </div>
        </InicioMovil>
    );
}
