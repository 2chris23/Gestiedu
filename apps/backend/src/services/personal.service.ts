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

export async function cargaHoraria(prisma: any, instituteId: string, teacherId: string, hoy: string) {
    const profe = await prisma.user.findUnique({ where: { id: teacherId }, select: { id: true, firstName: true, lastName: true, role: true, joinDate: true } });
    if (!profe || (profe.role !== 'TEACHER' && profe.role !== 'ADMIN')) throw AppErrors.NotFound('Profesor');
    const [reglas, inst, plantel, clases] = await Promise.all([
        reglasDeCargaHoraria(instituteId),
        platformPrisma.institute.findUnique({ where: { id: instituteId }, select: { academicConfig: true } }),
        datosDelPlantel(instituteId, hoy),
        prisma.classroomSubject.findMany({
            where: { teacherId, classroom: { academicYear: { status: 'ACTIVE' } } },
            select: {
                hoursPerWeek: true,
                weeklyBlocks: true,
                subject: { select: { name: true } },
                classroom: { select: { name: true, grade: true, section: true, shift: true, academicYear: { select: { name: true } } } },
            },
        }),
    ]);
    const turnos = turnosDeLaConfig(((inst?.academicConfig ?? {}) as any).schedule);
    const filas = clases
        .map((c: any) => {
            const duracion = (c.classroom.shift === 'TARDE' ? turnos.TARDE : turnos.MANANA).duracion;
            const horas = c.hoursPerWeek > 0 ? c.hoursPerWeek : c.weeklyBlocks > 0 ? Math.round(((c.weeklyBlocks * duracion) / 60) * 100) / 100 : null;
            return { seccion: c.classroom.name, grado: c.classroom.grade, materia: c.subject.name, bloques: c.weeklyBlocks || null, horas };
        })
        .sort((a: any, b: any) => a.grado - b.grado || a.seccion.localeCompare(b.seccion, 'es') || a.materia.localeCompare(b.materia, 'es'));
    const total = Math.round(filas.reduce((s: number, f: any) => s + (f.horas ?? 0), 0) * 100) / 100;
    return {
        profesor: { id: profe.id, nombre: nombre(profe), ingreso: profe.joinDate ? profe.joinDate.toISOString().slice(0, 10) : null },
        ciclo: clases[0]?.classroom.academicYear.name ?? null,
        filas,
        total,
        sinHoras: filas.filter((f: any) => f.horas === null).length,
        reglas,
        estado: total > reglas.maximo ? 'SOBRECARGA' : total >= reglas.minimo ? 'EN_RANGO' : 'POR_DEBAJO',
        firmante: plantel.firmante,
        emitidaEl: hoy,
    };
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
