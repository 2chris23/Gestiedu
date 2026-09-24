import * as React from 'react';
import type { Aparato } from './guion';

/**
 * LOS TRES APARATOS, EN CSS
 *
 * Nada de imágenes: el marco es un par de cajas con bordes redondeados y un
 * degradado, y la pantalla es HTML de verdad. Cada pantalla se dibuja a su
 * tamaño «real» (`contenido`: lo que mediría en un aparato de verdad, con la
 * letra de la app a 12 px o más) y se encoge con `transform: scale` hasta el
 * hueco del marco. Así las pantallas se escriben con las mismas clases que la
 * app y no con medidas inventadas para que quepan.
 */
export const MEDIDAS: Record<Aparato, { ancho: number; alto: number; contenido: { ancho: number; alto: number } }> = {
    portatil: { ancho: 720, alto: 450, contenido: { ancho: 1024, alto: 640 } },
    tableta: { ancho: 360, alto: 480, contenido: { ancho: 600, alto: 800 } },
    telefono: { ancho: 250, alto: 520, contenido: { ancho: 360, alto: 749 } },
};

function Pantalla({ aparato, children }: { aparato: Aparato; children: React.ReactNode }) {
    const m = MEDIDAS[aparato];
    return (
        <div className="relative overflow-hidden bg-gray-50" style={{ width: m.ancho, height: m.alto }}>
            <div
                className="absolute left-0 top-0 origin-top-left"
                style={{
                    width: m.contenido.ancho,
                    height: m.contenido.alto,
                    transform: `scale(${m.ancho / m.contenido.ancho})`,
                }}
            >
                {children}
            </div>
            {/* El brillo del cristal: una diagonal casi invisible. */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent" />
        </div>
    );
}

export function Portatil({ children }: { children: React.ReactNode }) {
    return (
        <div className="relative" style={{ width: 800 }}>
            <div className="mx-auto w-fit rounded-t-[22px] bg-gradient-to-b from-slate-700 to-slate-900 p-[14px] pb-[18px] shadow-[0_30px_60px_-20px_rgba(30,27,75,0.45)] ring-1 ring-slate-950/60">
                <div className="absolute left-1/2 top-[5px] h-[5px] w-[5px] -translate-x-1/2 rounded-full bg-slate-600" />
                <div className="overflow-hidden rounded-[6px]">
                    <Pantalla aparato="portatil">{children}</Pantalla>
                </div>
            </div>
            {/* La base: una lámina de aluminio con su muesca para abrirla. */}
            <div className="relative -mt-px h-[16px] w-[800px] rounded-b-[14px] bg-gradient-to-b from-slate-200 via-slate-300 to-slate-400 shadow-[0_18px_30px_-12px_rgba(30,27,75,0.5)]">
                <div className="absolute left-1/2 top-0 h-[6px] w-[110px] -translate-x-1/2 rounded-b-[8px] bg-slate-400/70" />
            </div>
        </div>
    );
}

export function Tableta({ children }: { children: React.ReactNode }) {
    return (
        <div className="rounded-[30px] bg-gradient-to-br from-slate-700 to-slate-900 p-[14px] shadow-[0_30px_60px_-18px_rgba(30,27,75,0.5)] ring-1 ring-slate-950/60">
            <div className="overflow-hidden rounded-[16px]">
                <Pantalla aparato="tableta">{children}</Pantalla>
            </div>
        </div>
    );
}

export function Telefono({ children }: { children: React.ReactNode }) {
    return (
        <div className="relative rounded-[42px] bg-gradient-to-br from-slate-700 to-slate-950 p-[10px] shadow-[0_30px_50px_-16px_rgba(30,27,75,0.55)] ring-1 ring-slate-950/60">
            <div className="relative overflow-hidden rounded-[33px]">
                <Pantalla aparato="telefono">{children}</Pantalla>
                {/* La isla de la cámara. */}
                <div className="absolute left-1/2 top-[8px] h-[18px] w-[70px] -translate-x-1/2 rounded-full bg-slate-950" />
            </div>
        </div>
    );
}
