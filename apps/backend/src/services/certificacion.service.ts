import { createError } from '../middleware/error.middleware';
import { borrarGuardandoCopia } from '../utils/papelera';
import { getAcademicConfig } from './promotion/close-cycle.service';
import { membreteDelLiceo } from './datos-del-plantel.service';
import { platformPrisma } from '../config/database';
import { limpiarDatosDeDocumentos } from './constancias.service';

/**
 * LA CERTIFICACIÓN DE CALIFICACIONES (1º A 5º AÑO)
 *
 * El documento que el alumno lleva al egresar o al cambiarse de plantel: la
 * nota de cada materia de cada año, con su tipo de evaluación —F (final), R
 * (revisión), MP (materia pendiente)— y el plantel donde se cursó.
 *
 *   - Lo del liceo sale de los EXPEDIENTES que escribe el cierre de cada año
 *     (`AcademicRecord.subjectGrades`): el año que se aprobó (no el que se
 *     repitió). La revisión sale como R; la materia pendiente aprobada
 *     después, como MP con su nota y la fecha del momento.
 *   - Lo de los años cursados en OTRO plantel lo carga el admin
 *     (`CalificacionExterna`), con el plantel, su código y la entidad.
 *   - Las materias con apreciación salen con la apreciación.
 *
 * Solo el admin (es un documento oficial del liceo). Pruebas: DOC-07, DOC-08.
 */

export type TipoDeNota = 'F' | 'R' | 'MP';
const esTipoDeNota = (v: unknown): v is TipoDeNota => v === 'F' || v === 'R' || v === 'MP';

export interface MateriaCertificada {
    nombre: string;
    nota: number | null;
    apreciacion: string | null;
    tipo: TipoDeNota;
    fecha: string | null;
}

export interface AnoCertificado {
    grado: number;
    anoEscolar: string | null;
    plantel: string | null;
    codigoDelPlantel: string | null;
    entidad: string | null;
    fuente: 'LICEO' | 'OTRO_PLANTEL' | 'SIN_DATOS';
    materias: MateriaCertificada[];
}

const MES_ANO = (d: Date) => `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;

export async function certificacionDelAlumno(prisma: any, instituteId: string, studentId: string, hoy: string) {
    const alumno = await prisma.user.findUnique({
        where: { id: studentId },
        select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
            birthDate: true,
            gender: true,
            tipoDeCedula: true,
            cedulaEscolar: true,
            nacionalidad: true,
            lugarDeNacimiento: true,
            entidadDeNacimiento: true,
        },
    });
    if (!alumno || alumno.role !== 'STUDENT') throw createError(404, 'Estudiante no encontrado', 'NOT_FOUND');

    const [config, membrete, liceo, expedientes, inscripciones, pendientes, externas] = await Promise.all([
        getAcademicConfig(instituteId),
        membreteDelLiceo(instituteId),
        platformPrisma.institute.findUnique({ where: { id: instituteId }, select: { academicConfig: true } }),
        prisma.academicRecord.findMany({
            where: { studentId, status: 'COMPLETED' },
            include: { academicYear: { select: { id: true, name: true, startDate: true, endDate: true } } },
        }),
        prisma.studentClassroom.findMany({ where: { studentId }, select: { academicYearId: true, classroom: { select: { grade: true } } } }),
        prisma.materiaPendiente.findMany({
            where: { studentId, estado: 'APROBADA' },
            select: {
                subjectId: true,
                gradoDeOrigen: true,
                notaFinal: true,
                evaluaciones: { select: { fecha: true, nota: true }, orderBy: { momento: 'desc' } },
            },
        }),
        prisma.calificacionExterna.findMany({ where: { studentId }, orderBy: [{ grado: 'asc' }, { materia: 'asc' }] }),
    ]);
    const gradoDe = new Map<string, number>(inscripciones.map((i: any) => [i.academicYearId, i.classroom.grade]));
    const minima = config.notaMinimaAprobatoria;
    const ultimo = config.maxGradeLevel ?? 5;
    const docs = limpiarDatosDeDocumentos(((liceo?.academicConfig ?? {}) as Record<string, unknown>).documentos);

    const anos: AnoCertificado[] = [];
    for (let grado = 1; grado <= ultimo; grado++) {
        // El año en que APROBÓ ese grado (el que repitió no cuenta); el más reciente.
        const deEseGrado = expedientes
            .filter((e: any) => gradoDe.get(e.academicYearId) === grado)
            .sort((a: any, b: any) => b.academicYear.startDate.getTime() - a.academicYear.startDate.getTime());
        const aprobado = deEseGrado.find((e: any) => e.finalResult !== 'NO_PROMOVIDO');
        if (aprobado) {
            const materias: MateriaCertificada[] = ((aprobado.subjectGrades as any[]) ?? []).map((g: any) => {
                if (g.cualitativa) return { nombre: g.subjectName, nota: null, apreciacion: g.apreciacion ?? null, tipo: 'F', fecha: MES_ANO(aprobado.academicYear.endDate) };
                const pendiente = pendientes.find((p: any) => p.subjectId === g.subjectId && p.gradoDeOrigen === grado);
                if (typeof g.average === 'number' && g.average < minima && pendiente) {
                    const ultimaFecha = pendiente.evaluaciones[0]?.fecha;
                    return { nombre: g.subjectName, nota: pendiente.notaFinal, apreciacion: null, tipo: 'MP', fecha: ultimaFecha ? MES_ANO(ultimaFecha) : null };
                }
                return {
                    nombre: g.subjectName,
                    nota: typeof g.average === 'number' ? g.average : null,
                    apreciacion: null,
                    tipo: g.revision != null ? 'R' : 'F',
                    fecha: MES_ANO(aprobado.academicYear.endDate),
                };
            });
            anos.push({
                grado,
                anoEscolar: aprobado.academicYear.name,
                plantel: membrete.nombre,
                codigoDelPlantel: membrete.codigoDea,
                entidad: membrete.entidadFederal,
                fuente: 'LICEO',
                materias: materias.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
            });
            continue;
        }
        const suyas = externas.filter((x: any) => x.grado === grado);
        if (suyas.length > 0) {
            anos.push({
                grado,
                anoEscolar: suyas[0].anoEscolar,
                plantel: suyas[0].plantel,
                codigoDelPlantel: suyas[0].codigoDelPlantel,
                entidad: suyas[0].entidad,
                fuente: 'OTRO_PLANTEL',
                materias: suyas.map((x: any) => ({ nombre: x.materia, nota: x.nota, apreciacion: x.apreciacion, tipo: x.tipo, fecha: x.fecha })),
            });
            continue;
        }
        anos.push({ grado, anoEscolar: null, plantel: null, codigoDelPlantel: null, entidad: null, fuente: 'SIN_DATOS', materias: [] });
    }

    return {
        alumno: {
            cedula: alumno.id,
            tipoDeCedula: alumno.tipoDeCedula ?? null,
            cedulaEscolar: alumno.cedulaEscolar ?? null,
            nombres: alumno.firstName,
            apellidos: alumno.lastName,
            sexo: alumno.gender ?? null,
            fechaDeNacimiento: alumno.birthDate ? alumno.birthDate.toISOString().slice(0, 10) : null,
            lugarDeNacimiento: alumno.lugarDeNacimiento ?? null,
            entidadDeNacimiento: alumno.entidadDeNacimiento ?? null,
            nacionalidad: alumno.nacionalidad ?? null,
        },
        membrete,
        firmante: { nombre: docs.firmanteNombre ?? null, cedula: docs.firmanteCedula ?? null, cargo: docs.firmanteCargo ?? 'Director(a)' },
        anos,
        emitidaEl: hoy,
    };
}

export interface AnoExterno {
    grado: number;
    anoEscolar: string;
    plantel: string;
    codigoDelPlantel?: string | null;
    entidad?: string | null;
    materias: Array<{ materia: string; nota?: number | null; apreciacion?: string | null; tipo?: string; fecha?: string | null }>;
}

/** Carga un año entero cursado en otro plantel (una fila por materia). */
export async function cargarAnoExterno(prisma: any, instituteId: string, studentId: string, datos: AnoExterno, quien: string) {
    const alumno = await prisma.user.findUnique({ where: { id: studentId }, select: { role: true } });
    if (!alumno || alumno.role !== 'STUDENT') throw createError(404, 'Estudiante no encontrado', 'NOT_FOUND');
    const config = await getAcademicConfig(instituteId);
    const ultimo = config.maxGradeLevel ?? 5;
    if (!Number.isInteger(datos.grado) || datos.grado < 1 || datos.grado > ultimo) throw createError(400, `El año va del 1 al ${ultimo}`, 'GRADO_INVALIDO');
    if (!/^\d{4}-\d{4}$/.test(datos.anoEscolar ?? '')) throw createError(400, 'El año escolar va como 2023-2024', 'ANO_INVALIDO');
    const plantel = (datos.plantel ?? '').trim();
    if (plantel.length < 3) throw createError(400, 'Falta el nombre del plantel', 'PLANTEL_INVALIDO');
    if (!Array.isArray(datos.materias) || datos.materias.length < 1 || datos.materias.length > 20) throw createError(400, 'De 1 a 20 materias', 'MATERIAS_INVALIDAS');
    const filas = datos.materias.map((m, i) => {
        const materia = (m.materia ?? '').trim();
        if (materia.length < 2) throw createError(400, `Falta el nombre de la materia ${i + 1}`, 'MATERIAS_INVALIDAS');
        const tipo = m.tipo ?? 'F';
        if (!esTipoDeNota(tipo)) throw createError(400, `Tipo de «${materia}»: F, R o MP`, 'TIPO_INVALIDO');
        const tieneNota = typeof m.nota === 'number';
        if (tieneNota && (!Number.isFinite(m.nota as number) || (m.nota as number) < 0 || (m.nota as number) > 20)) {
            throw createError(400, `La nota de «${materia}» va de 0 a 20`, 'NOTA_INVALIDA');
        }
        const apreciacion = m.apreciacion?.trim() || null;
        if (!tieneNota && !apreciacion) throw createError(400, `«${materia}» necesita nota o apreciación`, 'NOTA_INVALIDA');
        if (m.fecha && !/^\d{2}\/\d{4}$/.test(m.fecha)) throw createError(400, `La fecha de «${materia}» va como MM/AAAA`, 'FECHA_INVALIDA');
        return {
            studentId,
            grado: datos.grado,
            anoEscolar: datos.anoEscolar,
            materia: materia.slice(0, 80),
            nota: tieneNota ? m.nota : null,
            apreciacion: apreciacion?.slice(0, 40) ?? null,
            tipo,
            fecha: m.fecha ?? null,
            plantel: plantel.slice(0, 160),
            codigoDelPlantel: datos.codigoDelPlantel?.trim().slice(0, 20) || null,
            entidad: datos.entidad?.trim().slice(0, 60) || null,
            registradaPor: quien,
        };
    });
    // Volver a cargar el mismo año lo reemplaza (con copia de lo de antes).
    await borrarGuardandoCopia(prisma, 'calificacionExterna', { studentId, grado: datos.grado }, { usuarioId: quien, motivo: 'año externo cargado de nuevo' });
    await prisma.calificacionExterna.createMany({ data: filas });
    return { cargadas: filas.length };
}

export async function calificacionesExternas(prisma: any, studentId: string) {
    return prisma.calificacionExterna.findMany({ where: { studentId }, orderBy: [{ grado: 'asc' }, { materia: 'asc' }] });
}

export async function quitarAnoExterno(prisma: any, studentId: string, grado: number, quien: string) {
    const n = await borrarGuardandoCopia(prisma, 'calificacionExterna', { studentId, grado }, { usuarioId: quien, motivo: 'año externo quitado' });
    if (n === 0) throw createError(404, 'No hay notas externas de ese año', 'NOT_FOUND');
    return { quitadas: n };
}
