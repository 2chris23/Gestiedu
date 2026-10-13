'use client';

import * as React from 'react';
import { InicioMovil } from './InicioMovil';
import { cifrasDelRepresentante, type Representado } from './cifras-del-inicio';
import MisRepresentados from '@/components/dashboard/MisRepresentados';
import CitacionesDelRepresentante from '@/components/dashboard/CitacionesDelRepresentante';
import { PagosDelRepresentante } from '@/components/pagos/PagosDelRepresentante';

export type RepresentadoItem = Representado;

export interface DatosDelRepresentanteMovil {
    children: RepresentadoItem[];
    conPagos?: boolean;
}

export function InicioDelRepresentanteMovil({ datos }: { datos: DatosDelRepresentanteMovil }) {
    const hijos = datos.children || [];

    const { promedio: promedioGeneral, asistencia: tarjetaAsistencia, riesgo: tarjetaRiesgo, etiqueta: etiquetaSecundaria } =
        cifrasDelRepresentante(hijos);

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
