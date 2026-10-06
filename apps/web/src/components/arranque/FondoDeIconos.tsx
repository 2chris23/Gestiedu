import { Atom, Award, BookOpen, Calculator, Compass, FlaskConical, Globe, GraduationCap, Lightbulb, Microscope, Music, NotebookPen, Palette, PencilLine, Ruler, Sigma } from 'lucide-react';

/**
 * EL FONDO DE LA PANTALLA DE BLOQUEO (pedido por Cristian: «que se vea muy
 * profesional»)
 *
 * Los iconos de lo que se hace en un liceo —libros, birrete, ciencia,
 * música…— en blanco casi transparente, flotando despacio sobre el azul, y
 * dos luces suaves. Las posiciones están fijas (no al azar) para que la
 * pantalla sea siempre la misma y no salte al volver. Con «reducir
 * movimiento», quietos. CSS: `.icono-que-flota` en `globals.css`.
 */

const ICONOS = [
    { Icono: BookOpen, x: 8, y: 10, t: 34, d: 0, v: 9 },
    { Icono: GraduationCap, x: 78, y: 7, t: 40, d: 1.2, v: 11 },
    { Icono: Atom, x: 44, y: 4, t: 26, d: 2.1, v: 8 },
    { Icono: PencilLine, x: 88, y: 30, t: 26, d: 0.6, v: 10 },
    { Icono: Calculator, x: 4, y: 36, t: 28, d: 1.8, v: 9 },
    { Icono: Globe, x: 66, y: 22, t: 30, d: 3, v: 12 },
    { Icono: FlaskConical, x: 22, y: 24, t: 24, d: 2.6, v: 8 },
    { Icono: Music, x: 90, y: 52, t: 24, d: 1, v: 10 },
    { Icono: Ruler, x: 12, y: 58, t: 30, d: 3.4, v: 11 },
    { Icono: Lightbulb, x: 32, y: 46, t: 22, d: 0.3, v: 9 },
    { Icono: Microscope, x: 72, y: 46, t: 28, d: 2.4, v: 10 },
    { Icono: Palette, x: 52, y: 60, t: 24, d: 1.5, v: 12 },
    { Icono: Sigma, x: 28, y: 70, t: 22, d: 2.9, v: 8 },
    { Icono: Compass, x: 80, y: 70, t: 26, d: 0.9, v: 11 },
    { Icono: NotebookPen, x: 56, y: 80, t: 24, d: 3.2, v: 9 },
    { Icono: Award, x: 6, y: 82, t: 26, d: 1.4, v: 10 },
];

export function FondoDeIconos() {
    return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            {/* Dos luces suaves, para que el azul no sea plano. */}
            <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-[#42A5F5]/25 blur-3xl" />
            <div className="absolute -right-20 top-1/3 h-64 w-64 rounded-full bg-[var(--acento)]/20 blur-3xl" />
            {ICONOS.map(({ Icono, x, y, t, d, v }, i) => (
                <span
                    key={i}
                    className="icono-que-flota absolute text-white"
                    style={{
                        left: `${x}%`,
                        top: `${y}%`,
                        animationDelay: `${-d}s`,
                        animationDuration: `${v}s`,
                        opacity: i % 3 === 0 ? 0.16 : 0.11,
                    }}
                >
                    <Icono width={t} height={t} strokeWidth={1.6} />
                </span>
            ))}
        </div>
    );
}

export default FondoDeIconos;
