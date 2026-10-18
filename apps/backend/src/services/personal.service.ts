import { platformPrisma } from '../config/database';
import { AppErrors, createError } from '../middleware/error.middleware';
import { turnosDeLaConfig } from '../utils/franjas-del-horario';
import { datosDelPlantel, fechaLarga } from './constancias.service';
import { plantillaDe, parrafosDe } from './plantillas-de-documentos.service';

/**
 * EL PERSONAL: SU CARGA HORARIA Y SU CONSTANCIA DE TRABAJO
 *
 *   - **La carga horaria** de un profesor en el año en curso: por sección y
 *     materia, sus horas a la semana. Las horas son las de la materia en esa
 *     sección (`ClassroomSubject.hoursPerWeek`); si no las tiene, las de sus
 *     bloques en el horario (bloques × la duración de la hora de clase del
 *     turno); si tampoco, «sin horas». **No se inventan**: antes el perfil
 *     suponía 3 horas y 4 bloques a toda materia sin horas.
 *   - **El rango recomendado** (30 a 40 h por defecto) es del liceo:
 *     `academicConfig.cargaHoraria` ({ minimo, maximo }).
 *   - **La constancia de trabajo** (plantilla `TRABAJO`, editable): cargo,
 *     desde cuándo (su fecha de ingreso) y, si da clases, su carga horaria.
 *
 * Todo del admin; el profesor ve su propia carga. Pruebas:
 * `tests/integration/personal.test.ts` (PERS-*).
 */

export interface ReglasDeCargaHoraria {
    minimo: number;
    maximo: number;
}
const POR_DEFECTO: ReglasDeCargaHoraria = { minimo: 30, maximo: 40 };

export async function reglasDeCargaHoraria(instituteId: string): Promise<ReglasDeCargaHoraria> {
    const inst = await platformPrisma.institute.findUnique({ where: { id: instituteId }, select: { academicConfig: true } });
    const c = ((inst?.academicConfig ?? {}) as Record<string, any>).cargaHoraria ?? {};
    const valido = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 80;
    return valido(c.minimo) && valido(c.maximo) && c.minimo <= c.maximo ? { minimo: c.minimo, maximo: c.maximo } : { ...POR_DEFECTO };
}

export async function ponerReglasDeCargaHoraria(instituteId: string, r: { minimo: unknown; maximo: unknown } | null) {
    const inst = await platformPrisma.institute.findUnique({ where: { id: instituteId }, select: { academicConfig: true } });
    const config = ((inst?.academicConfig ?? {}) as Record<string, any>) || {};
    const nuevo = { ...config };
    if (r === null) delete nuevo.cargaHoraria;
    else {
        const minimo = Number(r.minimo);
        const maximo = Number(r.maximo);
        if (!Number.isFinite(minimo) || !Number.isFinite(maximo) || minimo < 0 || maximo > 80 || minimo > maximo) {
            throw createError(400, 'El rango va de 0 a 80 horas, y el mínimo no pasa del máximo', 'REGLA_INVALIDA');
        }
        nuevo.cargaHoraria = { minimo, maximo };
    }
    await platformPrisma.institute.update({ where: { id: instituteId }, data: { academicConfig: nuevo } });
    return reglasDeCargaHoraria(instituteId);
}

const nombre = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`;

/**
 * Lo que tiene de cargo cada profesor (`User.horasDelCargo`: 36, 24, 12…) o,
 * sin eso, el máximo del liceo. Con las suyas, «en rango» es tenerlas
 * completas (le falta menos de una hora) y «sobrecarga» pasarlas; con el
 * rango del liceo, como siempre. `MAPA_DE_CALCULOS.md` §1e.
 */
export type EstadoDeLaCarga = 'SOBRECARGA' | 'EN_RANGO' | 'POR_DEBAJO';
export function estadoDeLaCarga(total: number, reglas: ReglasDeCargaHoraria, horasDelCargo: number | null | undefined): EstadoDeLaCarga {
    if (horasDelCargo != null && horasDelCargo > 0) {
        if (total > horasDelCargo + 0.001) return 'SOBRECARGA';
        return horasDelCargo - total < 1 ? 'EN_RANGO' : 'POR_DEBAJO';
    }
    return total > reglas.maximo ? 'SOBRECARGA' : total >= reglas.minimo ? 'EN_RANGO' : 'POR_DEBAJO';
}
export const horasDeCargoDe = (reglas: ReglasDeCargaHoraria, horasDelCargo: number | null | undefined) =>
    horasDelCargo != null && horasDelCargo > 0 ? horasDelCargo : reglas.maximo;

export interface ClaseDeLaCarga {
    claseId: string;
    classroomId: string;
    subjectId: string;
    seccion: string;
    seccionSlug: string;
    grado: number;
    turno: string;
    materia: string;
    bloques: number | null;
    horas: number | null;
}
export interface CargaDeUnProfesor {
    filas: ClaseDeLaCarga[];
    total: number;
    bloques: number;
    sinHoras: number;
}

/**
 * LA CARGA DE VARIOS PROFESORES EN UNA SOLA CONSULTA (todos si no se dice
 * cuáles). Una sola regla para todo el sistema: el año ACTIVO, las horas de
 * la fila o los bloques por la duración de la clase de SU turno. Antes la
 * lista de usuarios y el modal de asignar contaban 45 min fijos y sumaban los
 * años pasados.
 */
export async function cargaDeLosProfesores(prisma: any, instituteId: string, teacherIds?: string[]): Promise<Map<string, CargaDeUnProfesor>> {
    const [inst, clases] = await Promise.all([
        platformPrisma.institute.findUnique({ where: { id: instituteId }, select: { academicConfig: true } }),
        prisma.classroomSubject.findMany({
            where: {
                teacherId: teacherIds ? { in: teacherIds } : { not: null },
                classroom: { academicYear: { status: 'ACTIVE' } },
            },
            select: {
                id: true,
                teacherId: true,
                hoursPerWeek: true,
                weeklyBlocks: true,
                subject: { select: { id: true, name: true } },
                classroom: { select: { id: true, name: true, slug: true, grade: true, shift: true } },
            },
        }),
    ]);
    const turnos = turnosDeLaConfig(((inst?.academicConfig ?? {}) as any).schedule);
    const porProfe = new Map<string, CargaDeUnProfesor>();
    for (const id of teacherIds ?? []) porProfe.set(id, { filas: [], total: 0, bloques: 0, sinHoras: 0 });
    for (const c of clases as any[]) {
        const duracion = (c.classroom.shift === 'TARDE' ? turnos.TARDE : turnos.MANANA).duracion;
        const horas = c.hoursPerWeek > 0 ? c.hoursPerWeek : c.weeklyBlocks > 0 ? Math.round(((c.weeklyBlocks * duracion) / 60) * 100) / 100 : null;
        const carga = porProfe.get(c.teacherId) ?? { filas: [], total: 0, bloques: 0, sinHoras: 0 };
        carga.filas.push({
            claseId: c.id,
            classroomId: c.classroom.id,
            subjectId: c.subject.id,
            seccion: c.classroom.name,
            seccionSlug: c.classroom.slug,
            grado: c.classroom.grade,
            turno: c.classroom.shift,
            materia: c.subject.name,
            bloques: c.weeklyBlocks || null,
            horas,
        });
        porProfe.set(c.teacherId, carga);
    }
    for (const carga of porProfe.values()) {
        carga.filas.sort((a, b) => a.grado - b.grado || a.seccion.localeCompare(b.seccion, 'es') || a.materia.localeCompare(b.materia, 'es'));
        carga.total = Math.round(carga.filas.reduce((t, f) => t + (f.horas ?? 0), 0) * 100) / 100;
        carga.bloques = carga.filas.reduce((t, f) => t + (f.bloques ?? 0), 0);
        carga.sinHoras = carga.filas.filter((f) => f.horas === null).length;
    }
    return porProfe;
}

/**
 * Las horas de N bloques en una sección: bloques × la duración de la hora de
 * clase de SU turno (la tarde puede tener otra). Antes: 45 min fijos.
 */
export async function horasDeLosBloques(instituteId: string, turno: string | null | undefined, bloques: number) {
    const inst = await platformPrisma.institute.findUnique({ where: { id: instituteId }, select: { academicConfig: true } });
    const turnos = turnosDeLaConfig(((inst?.academicConfig ?? {}) as any).schedule);
    const duracion = (turno === 'TARDE' ? turnos.TARDE : turnos.MANANA).duracion;
    return Math.round(((bloques * duracion) / 60) * 100) / 100;
}

export async function cargaHoraria(prisma: any, instituteId: string, teacherId: string, hoy: string) {
    const profe = await prisma.user.findUnique({
        where: { id: teacherId },
        select: { id: true, firstName: true, lastName: true, role: true, joinDate: true, horasDelCargo: true },
    });
    if (!profe || (profe.role !== 'TEACHER' && profe.role !== 'ADMIN')) throw AppErrors.NotFound('Profesor');
    const [reglas, plantel, cargas, ciclo] = await Promise.all([
        reglasDeCargaHoraria(instituteId),
        datosDelPlantel(instituteId, hoy),
        cargaDeLosProfesores(prisma, instituteId, [teacherId]),
        prisma.academicYear.findFirst({ where: { status: 'ACTIVE' }, select: { name: true } }),
    ]);
    const carga = cargas.get(teacherId)!;
    return {
        profesor: { id: profe.id, nombre: nombre(profe), ingreso: profe.joinDate ? profe.joinDate.toISOString().slice(0, 10) : null },
        ciclo: carga.filas.length ? (ciclo?.name ?? null) : null,
        filas: carga.filas.map(({ seccion, grado, materia, bloques, horas }) => ({ seccion, grado, materia, bloques, horas })),
        total: carga.total,
        sinHoras: carga.sinHoras,
        reglas,
        horasDelCargo: profe.horasDelCargo ?? null,
        cargo: horasDeCargoDe(reglas, profe.horasDelCargo),
        estado: estadoDeLaCarga(carga.total, reglas, profe.horasDelCargo),
        firmante: plantel.firmante,
        emitidaEl: hoy,
    };
}

/** Las horas del cargo de un profesor (admin). `null` = las del liceo. */
export async function ponerHorasDelCargo(prisma: any, teacherId: string, horas: number | null) {
    if (horas !== null && (!Number.isInteger(horas) || horas < 1 || horas > 80)) {
        throw createError(400, 'Las horas del cargo van de 1 a 80', 'HORAS_INVALIDAS');
    }
    const profe = await prisma.user.findUnique({ where: { id: teacherId }, select: { role: true } });
    if (!profe || profe.role !== 'TEACHER') throw AppErrors.NotFound('Profesor');
    await prisma.user.update({ where: { id: teacherId }, data: { horasDelCargo: horas } });
    return { id: teacherId, horasDelCargo: horas };
}

export async function constanciaDeTrabajo(prisma: any, instituteId: string, userId: string, hoy: string) {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, firstName: true, lastName: true, role: true, joinDate: true, specialization: true } });
    if (!u || (u.role !== 'TEACHER' && u.role !== 'ADMIN')) throw createError(404, 'La constancia de trabajo es del personal del liceo', 'NO_ES_PERSONAL');
    const [plantel, plantilla, carga] = await Promise.all([
        datosDelPlantel(instituteId, hoy),
        plantillaDe(instituteId, 'TRABAJO'),
        u.role === 'TEACHER' ? cargaHoraria(prisma, instituteId, userId, hoy) : null,
    ]);
    const cargo = u.role === 'TEACHER' ? `docente${u.specialization ? ` de ${u.specialization}` : ''}` : 'personal administrativo';
    const valores = {
        ...plantel.valores,
        trabajador: nombre(u),
        cedulaDelTrabajador: u.id,
        cargoDelTrabajador: cargo,
        fechaDeIngreso: u.joinDate ? fechaLarga(u.joinDate.toISOString().slice(0, 10)) : '____________',
        conCargaHoraria: carga && carga.total > 0 ? `, con una carga horaria de ${String(carga.total).replace('.', ',')} horas semanales` : '',
    };
    return { titulo: plantilla.titulo, parrafos: parrafosDe(plantilla.texto, valores), firmante: plantel.firmante, trabajador: { id: u.id, nombre: nombre(u) }, emitidaEl: hoy };
}
