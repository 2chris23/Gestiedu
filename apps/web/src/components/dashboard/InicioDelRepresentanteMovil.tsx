'use client';

import * as React from 'react';
import { Check } from 'lucide-react';
import { InicioMovil, type TarjetaMetricaMovil } from './InicioMovil';
import MisRepresentados from '@/components/dashboard/MisRepresentados';
import CitacionesDelRepresentante from '@/components/dashboard/CitacionesDelRepresentante';
import { PagosDelRepresentante } from '@/components/pagos/PagosDelRepresentante';

export interface RepresentadoItem {
    id: string;
    fullName: string;
    avatar: string | null;
    classroom: string | null;
    average: number;
    attendancePercentage: number;
    relationship: string;
}

export interface DatosDelRepresentanteMovil {
    children: RepresentadoItem[];
    conPagos?: boolean;
}

export function InicioDelRepresentanteMovil({ datos }: { datos: DatosDelRepresentanteMovil }) {
    const hijos = datos.children || [];

    // Promedio general de sus representados con notas
    const hijosConNotas = hijos.filter((h) => h.average > 0);
    const promedioGeneral =
        hijosConNotas.length > 0
            ? Math.round((hijosConNotas.reduce((sum, h) => sum + h.average, 0) / hijosConNotas.length) * 10) / 10
            : null;

    // Asistencia media
    const asistenciaMedia =
        hijos.length > 0
            ? Math.round(hijos.reduce((sum, h) => sum + (h.attendancePercentage || 0), 0) / hijos.length)
            : 0;

    // Representados en riesgo (< 10)
    const enRiesgo = hijos.filter((h) => h.average > 0 && h.average < 10).length;

    const tarjetaAsistencia: TarjetaMetricaMovil = {
        titulo: 'Asistencia media',
        valor: `${asistenciaMedia}%`,
        subtitulo: 'De tus representados',
        porcentajeBarra: Math.max(0, Math.min(100, asistenciaMedia)),
        colorBarra: 'var(--acento)',
        icono: (
            <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[var(--acento)] text-[var(--sobre-acento)]">
                <Check className="h-4 w-4" strokeWidth={2.4} aria-hidden />
            </span>
        ),
    };

    const tarjetaRiesgo: TarjetaMetricaMovil = {
        titulo: 'En riesgo',
        valor: enRiesgo,
        subtitulo: enRiesgo === 1 ? '1 representado' : `${enRiesgo} representados`,
        porcentajeBarra: hijos.length > 0 ? (enRiesgo / hijos.length) * 100 : 0,
        colorBarra: '#EF5350',
        icono: (
            <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[#EF5350] text-sm font-extrabold text-white" aria-hidden>
                !
            </span>
        ),
    };

    const cantHijos = hijos.length;
    const etiquetaSecundaria = `${cantHijos} ${cantHijos === 1 ? 'representado' : 'representados'}`;

    return (
        <InicioMovil
            tituloCifra="Promedio de tus representados"
            cifra={promedioGeneral}
            sufijoCifra="/ 20"
            etiquetaSecundaria={etiquetaSecundaria}
            tarjetaIzquierda={tarjetaAsistencia}
            tarjetaDerecha={tarjetaRiesgo}
            accesos={[]} // El representante no tiene carrusel de accesos; interactúa directamente con sus representados
            etiquetaAria="Inicio del representante"
        >
            {/* Citaciones si las hay */}
            <div data-recorrido="citaciones-del-representante">
                <CitacionesDelRepresentante />
            </div>

            {/* Pagos del representante */}
            {datos.conPagos && (
                <div data-recorrido="pagos-del-representante">
                    <PagosDelRepresentante />
                </div>
            )}

            {/* Lista interactiva de representados */}
            <div data-recorrido="mis-representados">
                <MisRepresentados />
            </div>
        </InicioMovil>
    );
}
