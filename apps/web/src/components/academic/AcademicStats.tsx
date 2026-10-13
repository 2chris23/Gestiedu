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

/**
 * Todas las celdas llevan las MISMAS cuatro filas —rótulo, cifra, barra y
 * pie— aunque alguna vaya vacía: así los rótulos, las cifras y las barras
 * quedan a la misma altura de una celda a otra y todo va centrado. Antes cada
 * una se centraba con lo que tenía y el «Promedio» (con su rango debajo) se
 * subía respecto de las demás.
 */
function Celda({ cifra, className, grande = false }: { cifra: Cifra; className?: string; grande?: boolean }) {
    const Icono = cifra.icono;
    return (
        <div
            className={cn('flex min-w-0 flex-col items-center justify-center bg-white px-2.5 py-2 text-center sm:px-3', className)}
            title={cifra.detalle}
        >
            <span className="flex max-w-full items-center justify-center gap-1 text-xs font-medium text-gray-500 sm:gap-1.5">
                {/* En el teléfono, sin icono: con él «Observaciones» no cabía
                    (y con la letra del teléfono agrandada, tampoco otras). */}
                <Icono className={cn('hidden h-3.5 w-3.5 shrink-0 sm:block', TONOS[cifra.tono])} aria-hidden />
                {/* El rótulo entero, en dos líneas si hace falta: «Observacio…»
                    y «Promedio Sec…» no decían qué cifra era. */}
                <span className="line-clamp-2 break-words leading-tight">{cifra.titulo}</span>
            </span>
            <span
                className={cn(
                    'mt-0.5 max-w-full truncate font-bold tabular-nums',
                    grande ? 'text-3xl leading-9 md:text-lg md:leading-6' : 'text-lg leading-6',
                    cifra.alerta ? 'text-red-600' : 'text-gray-900'
                )}
            >
                {cifra.valor}
            </span>
            {cifra.barra ? <BarraDeLaCifra barra={cifra.barra} /> : <div aria-hidden className="mt-1.5 h-1.5" />}
            <span className="mt-1 block min-h-4 max-w-full truncate text-xs tabular-nums leading-4 text-gray-500">{cifra.pie ?? ' '}</span>
            {cifra.detalle && <span className="sr-only">{cifra.detalle}</span>}
        </div>
    );
}

interface AcademicStatsProps {
    stats?: {
        average: number | null;
        minAverage?: number | null;
        maxAverage?: number | null;
        riskCount: number;
        occupancy: string;
        attendance?: string | null;
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
        attendance: null,
        observations: 0,
    };

    const escalaMin = config?.gradeScale?.min ?? 0;
    const escalaMax = config?.gradeScale?.max ?? 20;
    const aprueba = config?.notaMinimaAprobatoria ?? config?.passingGrade ?? 10;
    const asistenciaMinima = config?.asistenciaMinima ?? 80;
    const enLaEscala = (nota: number) => ((nota - escalaMin) / Math.max(1, escalaMax - escalaMin)) * 100;

    const promedio = typeof data.average === 'number' && !isNaN(data.average) && data.average > 0 ? data.average : null;
    const hayPromedio = promedio !== null;
    const conRango = !isStudentView && hayPromedio && data.minAverage !== undefined && data.minAverage !== null && data.minAverage > 0;
    const [ocupados, puestos] = String(data.occupancy || '0/0')
        .split('/')
        .map((n) => parseInt(n, 10) || 0);
    const hayAsistencia = data.attendance !== null && data.attendance !== undefined && data.attendance !== '' && data.attendance !== '—';
    const asistencia = hayAsistencia ? parseFloat(String(data.attendance).replace('%', '').replace(',', '.')) || 0 : null;

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
            valor: hayAsistencia ? String(data.attendance) : '—',
            detalle: isStudentView ? 'Asistencia acumulada' : 'Asistencia promedio',
            icono: Calendar,
            tono: 'indigo',
            barra:
                asistencia !== null
                    ? {
                          lleno: asistencia,
                          color: asistencia >= asistenciaMinima ? 'bien' : asistencia >= asistenciaMinima - 10 ? 'aviso' : 'mal',
                          marca: asistenciaMinima,
                          dice: `${asistencia} %; el mínimo del liceo es ${asistenciaMinima} %`,
                      }
                    : undefined,
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

    const promedioCifra: Cifra = {
        titulo: averageTitle,
        detalle: conRango ? 'Debajo, el promedio más bajo y el más alto' : undefined,
        valor: hayPromedio ? (data.average as number) : '—',
        icono: GraduationCap,
        tono: 'azul',
        alerta: hayPromedio && promedio < aprueba,
        barra: hayPromedio
            ? {
                  lleno: enLaEscala(promedio),
                  color: promedio >= aprueba ? 'bien' : 'mal',
                  marca: enLaEscala(aprueba),
                  dice: `${data.average} de ${escalaMax}; se aprueba con ${aprueba}`,
              }
            : undefined,
        // El más bajo y el más alto de la sección (o del año).
        pie: conRango ? `${data.minAverage} – ${data.maxAverage}` : undefined,
    };

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
            <Celda cifra={promedioCifra} grande className="row-span-2 md:row-span-1" />

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
