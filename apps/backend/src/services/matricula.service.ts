import { platformPrisma } from '../config/database';
import { AppErrors, createError } from '../middleware/error.middleware';
import { datosDelPlantel } from './constancias.service';
import { edadEn } from './inscripcion.service';

/**
 * LA ESTADÍSTICA DE MATRÍCULA (EL MOVIMIENTO)
 *
 * Lo que la zona educativa le pide al liceo cada mes (o cada lapso): por grado
 * y sección, cuántos había al empezar (matrícula inicial), cuántos llegaron
 * (ingresos), cuántos se fueron (retiros) y cuántos quedan (final), y cada
 * cifra por sexo; y la matrícula final por edad.
 *
 *   - **Ingreso**: el día de su inscripción. Lo inscrito en los primeros días
 *     del año (`diasDeInscripcion`, 30 por defecto) es matrícula INICIAL del
 *     año, no un ingreso: la inscripción de septiembre no es gente que llega.
 *   - **Retiro**: `student_classrooms.retiradoEl` (lo pone el retiro de la
 *     ficha); si se archivó antes de que existiera, el día del archivo.
 *   - **Final** = inicial + ingresos − retiros.
 *   - **Edad**: cumplida en la fecha de corte del liceo (`fechaDeCorte`, el 30
 *     de septiembre del año escolar por defecto).
 *   - Quien no tiene sexo o fecha de nacimiento sale en «sin dato»: no se
 *     inventa.
 *
 * Reglas del liceo en `academicConfig.matricula`. Solo el admin.
 * Pruebas: `tests/integration/matricula.test.ts` (MAT-*); MAPA §8f.
 */

export interface ReglasDeMatricula {
    diasDeInscripcion: number;
    /** «MM-DD» del año en que empieza el año escolar. */
    fechaDeCorte: string;
}
const POR_DEFECTO: ReglasDeMatricula = { diasDeInscripcion: 30, fechaDeCorte: '09-30' };

async function reglas(instituteId: string): Promise<ReglasDeMatricula> {
    const inst = await platformPrisma.institute.findUnique({ where: { id: instituteId }, select: { academicConfig: true } });
    const m = ((inst?.academicConfig ?? {}) as Record<string, any>).matricula ?? {};
    return {
        diasDeInscripcion: Number.isInteger(m.diasDeInscripcion) && m.diasDeInscripcion >= 0 && m.diasDeInscripcion <= 120 ? m.diasDeInscripcion : POR_DEFECTO.diasDeInscripcion,
        fechaDeCorte: typeof m.fechaDeCorte === 'string' && /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(m.fechaDeCorte) ? m.fechaDeCorte : POR_DEFECTO.fechaDeCorte,
    };
}

type Sexo = 'M' | 'F' | 'X';
export interface Cuenta {
    M: number;
    F: number;
    X: number;
    total: number;
}
const cero = (): Cuenta => ({ M: 0, F: 0, X: 0, total: 0 });
const sumar = (c: Cuenta, s: Sexo) => {
    c[s]++;
    c.total++;
};
const sexoDe = (g: string | null): Sexo => (g === 'MASCULINO' ? 'M' : g === 'FEMENINO' ? 'F' : 'X');
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const masDias = (y: string, n: number) => ymd(new Date(Date.parse(`${y}T00:00:00Z`) + n * 86400000));

export async function matriculaDelCiclo(prisma: any, instituteId: string, cicloIdONombre: string, rango: { desde?: string; hasta?: string }, hoy: string) {
    const ano = await prisma.academicYear.findFirst({
        where: { OR: [{ id: cicloIdONombre }, { name: cicloIdONombre }] },
        select: { id: true, name: true, startDate: true, endDate: true, periods: { select: { id: true, name: true, startDate: true, endDate: true }, orderBy: { startDate: 'asc' } } },
    });
    if (!ano) throw AppErrors.NotFound('Año escolar');
    const inicioDelAno = ymd(ano.startDate);
    const desde = rango.desde ?? inicioDelAno;
    const hasta = rango.hasta ?? (hoy < ymd(ano.endDate) ? hoy : ymd(ano.endDate));
    const fecha = /^\d{4}-\d{2}-\d{2}$/;
    if (!fecha.test(desde) || !fecha.test(hasta) || desde > hasta) throw createError(400, 'El período no es válido', 'PERIODO_INVALIDO');

    const r = await reglas(instituteId);
    const finDeLaInscripcion = masDias(inicioDelAno, r.diasDeInscripcion);
    const corte = `${inicioDelAno.slice(0, 4)}-${r.fechaDeCorte}`;

    const [secciones, inscripciones] = await Promise.all([
        prisma.classroom.findMany({ where: { academicYearId: ano.id }, select: { id: true, name: true, grade: true, section: true }, orderBy: [{ grade: 'asc' }, { section: 'asc' }] }),
        prisma.studentClassroom.findMany({
            where: { academicYearId: ano.id },
            select: {
                classroomId: true,
                enrollmentDate: true,
                isActive: true,
                retiradoEl: true,
                student: { select: { gender: true, birthDate: true, archivedAt: true, status: true } },
            },
        }),
    ]);

    // Cuándo entró (lo de los primeros días es matrícula inicial) y cuándo se fue.
    const filas = inscripciones.map((i: any) => {
        const inscrito = ymd(i.enrollmentDate);
        const entra = inscrito <= finDeLaInscripcion ? inicioDelAno : inscrito;
        const sale = i.retiradoEl
            ? ymd(i.retiradoEl)
            : !i.isActive && i.student.status === 'ARCHIVED' && i.student.archivedAt
              ? ymd(i.student.archivedAt)
              : null;
        return { seccion: i.classroomId, entra, sale, sexo: sexoDe(i.student.gender), nacimiento: i.student.birthDate ? ymd(i.student.birthDate) : null };
    });

    type Movimiento = { inicial: Cuenta; ingresos: Cuenta; retiros: Cuenta; final: Cuenta };
    const vacio = (): Movimiento => ({ inicial: cero(), ingresos: cero(), retiros: cero(), final: cero() });
    const porSeccion = new Map<string, Movimiento>(secciones.map((s: any) => [s.id, vacio()]));
    const edades = new Map<number, Map<number | 'X', Cuenta>>(); // grado → edad → cuenta

    const gradoDe = new Map<string, number>(secciones.map((s: any) => [s.id, s.grade]));
    for (const f of filas) {
        const m = porSeccion.get(f.seccion);
        if (!m) continue;
        // Estaba al empezar el período: entró antes y no se había ido.
        const estabaAlEmpezar = f.entra < desde && (f.sale === null || f.sale >= desde);
        const entroEnElPeriodo = f.entra >= desde && f.entra <= hasta;
        const seFueEnElPeriodo = f.sale !== null && f.sale >= desde && f.sale <= hasta && f.entra <= hasta;
        // El primer día del año, los de la inscripción ya están (inicial).
        const inicial = estabaAlEmpezar || (f.entra === inicioDelAno && desde <= inicioDelAno);
        if (inicial) sumar(m.inicial, f.sexo);
        else if (entroEnElPeriodo) sumar(m.ingresos, f.sexo);
        if (seFueEnElPeriodo && (inicial || entroEnElPeriodo)) sumar(m.retiros, f.sexo);
        const alFinal = (inicial || entroEnElPeriodo) && !(f.sale !== null && f.sale <= hasta);
        if (alFinal) {
            sumar(m.final, f.sexo);
            const grado = gradoDe.get(f.seccion)!;
            const edad = f.nacimiento ? edadEn(f.nacimiento, corte) : 'X';
            if (!edades.has(grado)) edades.set(grado, new Map());
            const g = edades.get(grado)!;
            if (!g.has(edad)) g.set(edad, cero());
            sumar(g.get(edad)!, f.sexo);
        }
    }

    const juntar = (lista: Movimiento[]): Movimiento => {
        const t = vacio();
        for (const m of lista) {
            for (const k of ['inicial', 'ingresos', 'retiros', 'final'] as const) {
                for (const s of ['M', 'F', 'X', 'total'] as const) t[k][s] += m[k][s];
            }
        }
        return t;
    };
    const filasDeSeccion = secciones.map((s: any) => ({ id: s.id, nombre: s.name, grado: s.grade, seccion: s.section, ...porSeccion.get(s.id)! }));
    const grados: number[] = [...new Set<number>(secciones.map((s: any) => s.grade as number))].sort((a, b) => a - b);
    const todasLasEdades: Array<number | 'X'> = [...new Set<number | 'X'>([...edades.values()].flatMap((g) => [...g.keys()]))].sort((a, b) =>
        a === 'X' ? 1 : b === 'X' ? -1 : (a as number) - (b as number)
    );
    const plantel = await datosDelPlantel(instituteId, hoy);

    return {
        liceo: plantel.liceo,
        firmante: plantel.firmante,
        ciclo: { id: ano.id, nombre: ano.name, desde: inicioDelAno, hasta: ymd(ano.endDate), lapsos: ano.periods.map((p: any) => ({ id: p.id, nombre: p.name, desde: ymd(p.startDate), hasta: ymd(p.endDate) })) },
        desde,
        hasta,
        reglas: { ...r, fechaDeCorte: corte },
        secciones: filasDeSeccion,
        porGrado: grados.map((g) => ({ grado: g, ...juntar(filasDeSeccion.filter((s: any) => s.grado === g)) })),
        total: juntar(filasDeSeccion),
        porEdad: {
            edades: todasLasEdades.map((e) => (e === 'X' ? 'sin dato' : String(e))),
            grados: grados.map((g) => ({
                grado: g,
                celdas: todasLasEdades.map((e) => edades.get(g)?.get(e) ?? cero()),
            })),
        },
        emitidaEl: hoy,
    };
}
