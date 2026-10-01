import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * LA CABECERA DE UNA PANTALLA
 *
 * Había siete maneras distintas de empezar una pantalla: título a 18, 24 y
 * 30 px; en negrita, extranegrita o «black»; dentro de una tarjeta blanca, sobre
 * un degradado o a pelo; con un margen de más en el teléfono (el título de
 * Académico y el de Usuarios empezaban 16 px más adentro que el resto de la
 * pantalla); y el botón principal en cuatro azules. Cada pantalla, sola, se veía
 * bien; al pasar de una a otra, el liceo parecía hecho por cuatro personas.
 *
 * Aquí se dice una vez:
 *
 *  · el título, a la izquierda y alineado con el contenido de abajo;
 *  · debajo, una línea que dice para qué sirve la pantalla;
 *  · a la derecha, las acciones. **En el teléfono bajan a su propia fila**
 *    cuando no caben, en vez de aplastarse: «Nuevo Ciclo» salía partido en dos
 *    líneas, con el icono flotando en medio.
 *
 * `migas` va encima del título (Académico › 2026-2027 › …) y `pie` debajo de
 * todo (filtros, pestañas…).
 */
export interface EncabezadoDePantallaProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
    titulo: React.ReactNode;
    descripcion?: React.ReactNode;
    migas?: React.ReactNode;
    /** Lo que va junto al título (una etiqueta de estado, el turno…). */
    junto?: React.ReactNode;
    acciones?: React.ReactNode;
    pie?: React.ReactNode;
}

export function EncabezadoDePantalla({
    titulo,
    descripcion,
    migas,
    junto,
    acciones,
    pie,
    className,
    ...resto
}: EncabezadoDePantallaProps) {
    return (
        <header className={cn('space-y-3', className)} {...resto}>
            {migas}
            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
                <div className="min-w-0 flex-[1_1_16rem]">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <h1 className="text-seccion font-bold text-gray-900 sm:text-pantalla">{titulo}</h1>
                        {junto}
                    </div>
                    {descripcion && <p className="mt-1 text-cuerpo text-gray-600">{descripcion}</p>}
                </div>
                {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
            </div>
            {pie}
        </header>
    );
}

export default EncabezadoDePantalla;
