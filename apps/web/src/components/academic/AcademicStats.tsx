import { AlertTriangle, Bell, Calendar, GraduationCap, Users, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * LAS CIFRAS DE UN CICLO, UNA SECCIÓN O UNA MATERIA, EN UN SOLO BLOQUE
 *
 * Eran cinco tarjetas sueltas de 110 px de alto cada una: en un teléfono, dos
 * por fila, se comían la pantalla entera antes de llegar a lo que se venía a
 * ver (los años, las secciones). Visto en un Motorola: el promedio y el riesgo
 * ocupaban lo que ahora ocupa todo.
 *
 * Ahora es un bloque: el promedio grande a la izquierda —es la cifra que se
 * viene a mirar— y las otras cuatro en una rejilla de dos por dos a su lado.
 * En pantalla ancha, las cinco en una fila.
 *
 * Ninguna letra baja de 12 px (regla `letra` de `npm run movil`), y «en
 * riesgo» no dice «menos de 10»: la nota mínima la pone cada liceo.
 */

type Tono = 'azul' | 'rojo' | 'verde' | 'indigo' | 'ambar';

const TONOS: Record<Tono, string> = {
    azul: 'text-blue-600',
    rojo: 'text-red-600',
    verde: 'text-emerald-600',
    indigo: 'text-indigo-600',
    ambar: 'text-amber-600',
};

interface Cifra {
    titulo: string;
    valor: string | number;
    detalle?: string;
    icono: LucideIcon;
    tono: Tono;
    /** La cifra en rojo cuando no es cero (el riesgo). */
    alerta?: boolean;
}

function Celda({ cifra, className }: { cifra: Cifra; className?: string }) {
    const Icono = cifra.icono;
    return (
        <div className={cn('flex min-w-0 flex-col justify-center bg-white px-2.5 py-2 sm:px-3', className)} title={cifra.detalle}>
            <span className="flex items-center gap-1 text-xs font-medium text-gray-500 sm:gap-1.5">
                {/* En el teléfono, sin icono: con él «Observaciones» no cabía
                    (y con la letra del teléfono agrandada, tampoco otras). */}
                <Icono className={cn('hidden h-3.5 w-3.5 shrink-0 sm:block', TONOS[cifra.tono])} aria-hidden />
                <span className="truncate">{cifra.titulo}</span>
            </span>
            <span
                className={cn(
                    'mt-0.5 truncate text-lg font-bold tabular-nums leading-6',
                    cifra.alerta ? 'text-red-600' : 'text-gray-900'
                )}
            >
                {cifra.valor}
            </span>
            {cifra.detalle && <span className="sr-only">{cifra.detalle}</span>}
        </div>
    );
}

interface AcademicStatsProps {
    stats?: {
        average: number;
        minAverage?: number;
        maxAverage?: number;
        riskCount: number;
        occupancy: string;
        attendance: string;
        observations: number;
    };
    isStudentView?: boolean;
    averageTitle?: string;
    /** Lo que cuenta «en riesgo» aquí. Se lee al dejar el dedo o el ratón encima. */
    riskSubtext?: string;
    className?: string;
}

export default function AcademicStats({
    stats,
    isStudentView = false,
    averageTitle = 'Promedio',
    riskSubtext,
    className,
}: AcademicStatsProps) {
    const data = stats || {
        average: 0,
        minAverage: 0,
        maxAverage: 0,
        riskCount: 0,
        occupancy: '0/0',
        attendance: '0%',
        observations: 0,
    };

    const conRango = !isStudentView && data.minAverage !== undefined && data.minAverage > 0;

    const resto: Cifra[] = [
        {
            titulo: 'En riesgo',
            valor: data.riskCount,
            detalle: riskSubtext || (isStudentView ? 'Materias por debajo de la nota mínima' : 'Alumnos con materias por debajo de la nota mínima'),
            icono: AlertTriangle,
            tono: 'rojo',
            alerta: data.riskCount > 0,
        },
        {
            titulo: 'Asistencia',
            valor: data.attendance,
            detalle: isStudentView ? 'Asistencia acumulada' : 'Asistencia promedio',
            icono: Calendar,
            tono: 'indigo',
        },
        ...(!isStudentView
            ? [
                  {
                      titulo: 'Ocupación',
                      valor: data.occupancy,
                      detalle: 'Estudiantes / capacidad',
                      icono: Users,
                      tono: 'verde' as Tono,
                  },
              ]
            : []),
        {
            titulo: 'Observaciones',
            valor: data.observations,
            detalle: 'Observaciones registradas',
            icono: Bell,
            tono: 'ambar',
        },
    ];

    return (
        <section
            aria-label="Resumen"
            className={cn(
                // Las rayas entre cifras son el fondo que asoma por el hueco
                // de 1 px de la rejilla: así no hay bordes que se dupliquen.
                'grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-gray-200 bg-gray-200',
                isStudentView ? 'md:grid-cols-4' : 'md:grid-cols-5',
                className
            )}
        >
            {/* El promedio: la cifra que se viene a mirar. */}
            <div className="row-span-2 flex min-w-0 flex-col justify-center bg-white px-2.5 py-2 sm:px-3 md:row-span-1">
                <span className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
                    <GraduationCap className="hidden h-3.5 w-3.5 shrink-0 text-blue-600 sm:block" aria-hidden />
                    <span className="truncate">{averageTitle}</span>
                </span>
                <span className="mt-0.5 text-3xl font-bold tabular-nums leading-9 text-gray-900 md:text-lg md:leading-6">
                    {data.average}
                </span>
                {conRango && (
                    <span className="truncate text-xs tabular-nums text-gray-500">
                        {data.minAverage} – {data.maxAverage}
                        <span className="sr-only"> (el más bajo y el más alto)</span>
                    </span>
                )}
            </div>

            {resto.map((cifra, i) => (
                <Celda
                    key={cifra.titulo}
                    cifra={cifra}
                    // Sin «Ocupación» (la vista del alumno) queda un hueco: la
                    // última se estira para taparlo.
                    className={resto.length === 3 && i === 2 ? 'col-span-2 md:col-span-1' : undefined}
                />
            ))}
        </section>
    );
}
