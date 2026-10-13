'use client';

import * as React from 'react';
import { losAccesosDe } from '@/lib/el-menu';
import { CuadroDeHonorWidget } from '@/components/dashboard/widgets';
import { LoDeHoy } from './LoDeHoy';
import { InicioMovil, EsqueletoDelInicioMovil } from './InicioMovil';
import { tarjetaDeAsistencia, tarjetaDeRiesgo, elCiclo, cuantos } from './cifras-del-inicio';

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

    const tarjetaAsistencia = tarjetaDeAsistencia(datos.asistencia, 'Últimos 30 días', '/dashboard/academico');
    const tarjetaRiesgo = tarjetaDeRiesgo(
        datos.enRiesgo,
        datos.estudiantes > 0 ? (datos.enRiesgo / datos.estudiantes) * 100 : 0,
        'Con materias reprobadas',
        '/dashboard/academico'
    );

    return (
        <InicioMovil
            tituloCifra="Promedio general"
            cifra={datos.promedioGeneral}
            sufijoCifra="/ 20"
            etiquetaSecundaria={[elCiclo(datos.ciclo), cuantos(datos.estudiantes, 'estudiante', 'estudiantes')].join(' · ')}
            tarjetaIzquierda={tarjetaAsistencia}
            tarjetaDerecha={tarjetaRiesgo}
            accesos={ordenados}
            etiquetaAria="El liceo hoy"
        >
            <LoDeHoy
                cantidad={datos.actividadesDeHoy}
                una="actividad"
                varias="actividades"
                detalle={[datos.hoyLeido, datos.lapso].filter(Boolean).join(' · ')}
                href="/dashboard/eventos"
                marca="calendario-del-liceo"
            />

            <div data-recorrido="cuadro-de-honor">
                <CuadroDeHonorWidget />
            </div>
        </InicioMovil>
    );
}
