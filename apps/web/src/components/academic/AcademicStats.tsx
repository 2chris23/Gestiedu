import { AlertTriangle, Bell, Calendar, GraduationCap, Users, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAcademicConfig } from '@/hooks/useAcademicConfig';

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
 * ─── UNA BARRA DEBAJO DE CADA CIFRA ─────────────────────────────────────────
 *
 * Un número suelto no dice si está bien o mal: «257 en riesgo» asusta igual
 * con 300 alumnos que con 3.000. Como la ocupación de cada sección, que ya
 * llevaba su barra, cada cifra lleva la suya y crece al aparecer:
 *
 *  · Promedio: cuánto de la escala del liceo, con una rayita donde se aprueba.
 *  · En riesgo: qué parte de los alumnos.
 *  · Asistencia: el porcentaje, con la rayita de la asistencia mínima.
 *  · Ocupación: los puestos llenos.
 *
 * La nota que aprueba, la escala y la asistencia mínima son las del liceo
 * (`useAcademicConfig`), no un 10, un 20 ni un 80 escritos aquí.
 *
 * Ninguna letra baja de 12 px (regla `letra` de `npm run movil`).
 */

type Tono = 'azul' | 'rojo' | 'verde' | 'indigo' | 'ambar';

const TONOS: Record<Tono, string> = {
    azul: 'text-blue-600',
    rojo: 'text-red-600',
    verde: 'text-emerald-600',
    indigo: 'text-indigo-600',
    ambar: 'text-amber-600',
};

type ColorDeBarra = 'bien' | 'aviso' | 'mal';

const BARRAS: Record<ColorDeBarra, string> = {
    bien: 'bg-green-500',
    aviso: 'bg-amber-400',
    mal: 'bg-red-500',
};

interface Barra {
    /** De 0 a 100. */
    lleno: number;
    color: ColorDeBarra;
    /** Una rayita fina en ese punto (de 0 a 100): dónde se aprueba, el mínimo. */
    marca?: number;
    /** Lo que dice la barra, para quien no la ve. */
    dice: string;
}

interface Cifra {
    titulo: string;
    valor: string | number;
    detalle?: string;
    icono: LucideIcon;
    tono: Tono;
    /** La cifra en rojo cuando no es cero (el riesgo). */
    alerta?: boolean;
    barra?: Barra;
    pie?: string;
}

const entre0y100 = (n: number) => Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0));

/**
 * La barra crece desde cero al aparecer (`barra-crece`, globals.css) y, si la
 * cifra cambia —otro lapso—, se estira hasta la nueva. Con «menos movimiento»
 * pedido en el teléfono, sale ya llena.
 */
function BarraDeLaCifra({ barra }: { barra: Barra }) {
    return (
        <div className="relative mt-1.5 h-1.5 w-full rounded-full bg-gray-100" role="img" aria-label={barra.dice}>
            <div className="h-full overflow-hidden rounded-full">
                <div
                    className={cn('barra-crece h-full rounded-full transition-[width] duration-500 ease-out', BARRAS[barra.color])}
                    style={{ width: `${entre0y100(barra.lleno)}%` }}
                />
            </div>
            {barra.marca !== undefined && (
                <span
                    aria-hidden
                    className="absolute -top-0.5 h-2.5 w-0.5 -translate-x-1/2 rounded-full bg-gray-500"
                    style={{ left: `${entre0y100(barra.marca)}%` }}
                />
            )}
        </div>
    );
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
            {cifra.barra && <BarraDeLaCifra barra={cifra.barra} />}
            {cifra.pie && <span className="mt-1 truncate text-xs tabular-nums text-gray-500">{cifra.pie}</span>}
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
    const { data: config } = useAcademicConfig();
    const data = stats || {
        average: 0,
        minAverage: 0,
        maxAverage: 0,
        riskCount: 0,
        occupancy: '0/0',
        attendance: '0%',
        observations: 0,
    };

    const escalaMin = config?.gradeScale?.min ?? 0;
    const escalaMax = config?.gradeScale?.max ?? 20;
    const aprueba = config?.notaMinimaAprobatoria ?? config?.passingGrade ?? 10;
    const asistenciaMinima = config?.asistenciaMinima ?? 80;
    const enLaEscala = (nota: number) => ((nota - escalaMin) / Math.max(1, escalaMax - escalaMin)) * 100;

    const promedio = Number(data.average) || 0;
    const hayPromedio = promedio > 0;
    const conRango = !isStudentView && data.minAverage !== undefined && data.minAverage > 0;
    const [ocupados, puestos] = String(data.occupancy || '0/0')
        .split('/')
        .map((n) => parseInt(n, 10) || 0);
    const asistencia = parseFloat(String(data.attendance || '0').replace('%', '').replace(',', '.')) || 0;

    const resto: Cifra[] = [
        {
            titulo: 'En riesgo',
            valor: data.riskCount,
            detalle: riskSubtext || (isStudentView ? 'Materias por debajo de la nota mínima' : 'Alumnos con materias por debajo de la nota mínima'),
            icono: AlertTriangle,
            tono: 'rojo',
            alerta: data.riskCount > 0,
            // Qué parte de los alumnos. En la vista del alumno son sus
            // materias, y no hay con qué compararlas.
            barra:
                !isStudentView && ocupados > 0
                    ? {
                          lleno: (data.riskCount / ocupados) * 100,
                          color: data.riskCount > 0 ? 'mal' : 'bien',
                          dice: `${Math.round((data.riskCount / ocupados) * 100)} % de los alumnos`,
                      }
                    : undefined,
        },
        {
            titulo: 'Asistencia',
            valor: data.attendance,
            detalle: isStudentView ? 'Asistencia acumulada' : 'Asistencia promedio',
            icono: Calendar,
            tono: 'indigo',
            barra: {
                lleno: asistencia,
                color: asistencia >= asistenciaMinima ? 'bien' : asistencia >= asistenciaMinima - 10 ? 'aviso' : 'mal',
                marca: asistenciaMinima,
                dice: `${asistencia} %; el mínimo del liceo es ${asistenciaMinima} %`,
            },
        },
        ...(!isStudentView
            ? [
                  {
                      titulo: 'Ocupación',
                      valor: data.occupancy,
                      detalle: 'Estudiantes / capacidad',
                      icono: Users,
                      tono: 'verde' as Tono,
                      barra:
                          puestos > 0
                              ? {
                                    lleno: (ocupados / puestos) * 100,
                                    color: (ocupados >= puestos ? 'mal' : ocupados / puestos > 0.8 ? 'aviso' : 'bien') as ColorDeBarra,
                                    dice: `${Math.round((ocupados / puestos) * 100)} % de los puestos`,
                                }
                              : undefined,
                  },
              ]
            : []),
        {
            titulo: 'Observaciones',
            valor: data.observations,
            detalle: 'Observaciones registradas',
            icono: Bell,
            tono: 'ambar',
            // Las observaciones no tienen un «lleno»: se dice cuántas tocan por
            // alumno, que es lo que deja comparar una sección con otra.
            pie:
                !isStudentView && ocupados > 0
                    ? `${(data.observations / ocupados).toFixed(1).replace('.', ',')} por alumno`
                    : undefined,
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
                <span
                    className={cn(
                        'mt-0.5 text-3xl font-bold tabular-nums leading-9 md:text-lg md:leading-6',
                        hayPromedio && promedio < aprueba ? 'text-red-600' : 'text-gray-900'
                    )}
                >
                    {data.average}
                </span>
                {hayPromedio && (
                    <BarraDeLaCifra
                        barra={{
                            lleno: enLaEscala(promedio),
                            color: promedio >= aprueba ? 'bien' : 'mal',
                            marca: enLaEscala(aprueba),
                            dice: `${data.average} de ${escalaMax}; se aprueba con ${aprueba}`,
                        }}
                    />
                )}
                {conRango && (
                    <span className="mt-1 truncate text-xs tabular-nums text-gray-500">
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
