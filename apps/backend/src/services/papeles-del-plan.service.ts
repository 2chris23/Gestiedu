import { createError } from '../middleware/error.middleware';
import { datosDelPlantel, gradoLegible } from './constancias.service';
import { plantillaDe, parrafosDe } from './plantillas-de-documentos.service';
import { maximoDelInstrumento, type Instrumento } from '../utils/instrumentos';

/**
 * LOS PAPELES DEL PLAN DE EVALUACIÓN
 *
 * Además del plan (que se imprime en `/dashboard/plan-de-evaluacion`), el
 * profesor entrega:
 *
 *  · El ACTA DE SOCIALIZACIÓN: «después de socializar el plan con los
 *    estudiantes… firman conforme». Texto del liceo (plantilla
 *    `ACTA_SOCIALIZACION_PLAN`) y la lista de la sección con su hueco para
 *    firmar: N.º, nombre, apellido, cédula, firma.
 *  · Los INSTRUMENTOS DEL LAPSO: cada evaluación con su técnica y su
 *    instrumento, en blanco para llenar a mano o con las marcas ya puestas.
 *
 * Los ve quien planifica esa materia en esa sección (o el admin): la ruta lo
 * comprueba. Pruebas: `tests/integration/papeles-del-plan.test.ts` (PAPEL-*).
 */

export const LAPSO_LEGIBLE: Record<string, string> = { '1': 'primer momento', '2': 'segundo momento', '3': 'tercer momento' };
const nombreDe = (u: { firstName?: string | null; lastName?: string | null } | null | undefined) => (u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() : '');

async function laClase(prisma: any, classroomId: string, subjectId: string, lapso: string) {
    const [aula, cs, meta, materia] = await Promise.all([
        prisma.classroom.findUnique({ where: { id: classroomId }, select: { id: true, name: true, grade: true, section: true, academicYear: { select: { name: true } } } }),
        prisma.classroomSubject.findFirst({ where: { classroomId, subjectId }, select: { teacher: { select: { id: true, firstName: true, lastName: true } } } }),
        prisma.evaluationPlanMetadata.findUnique({ where: { classroomId_subjectId_lapso: { classroomId, subjectId, lapso } } }),
        prisma.subject.findUnique({ where: { id: subjectId }, select: { id: true, name: true } }),
    ]);
    if (!aula || !materia) throw createError(404, 'Esa clase no existe', 'NOT_FOUND');
    return {
        aula,
        materia,
        docente: meta?.nombreDocente || nombreDe(cs?.teacher),
        cedulaDelDocente: meta?.cedulaDocente || cs?.teacher?.id || '',
        area: meta?.areaFormacion || materia.name,
    };
}

async function alumnosDe(prisma: any, classroomId: string) {
    const filas = await prisma.studentClassroom.findMany({
        where: { classroomId, isActive: true, student: { isActive: true } },
        select: { student: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
    });
    return filas.map((f: any, i: number) => ({ n: i + 1, id: f.student.id, nombres: f.student.firstName, apellidos: f.student.lastName }));
}

/** El acta de socialización del plan de un lapso, con la lista para firmar. */
export async function actaDeSocializacion(prisma: any, instituteId: string, classroomId: string, subjectId: string, lapso: string, hoy: string) {
    const [c, plantel, plantilla, alumnos] = await Promise.all([
        laClase(prisma, classroomId, subjectId, lapso),
        datosDelPlantel(instituteId, hoy),
        plantillaDe(instituteId, 'ACTA_SOCIALIZACION_PLAN'),
        alumnosDe(prisma, classroomId),
    ]);
    const parrafos = parrafosDe(plantilla.texto, {
        ...plantel.valores,
        docente: c.docente,
        cedulaDelDocente: c.cedulaDelDocente,
        area: c.area,
        grado: gradoLegible(c.aula.grade),
        seccion: c.aula.section,
        lapso: LAPSO_LEGIBLE[lapso] ?? `lapso ${lapso}`,
        ciclo: c.aula.academicYear?.name ?? '',
    });
    return {
        titulo: plantilla.titulo,
        parrafos,
        docente: c.docente,
        area: c.area,
        seccion: c.aula.name,
        lapso: LAPSO_LEGIBLE[lapso] ?? lapso,
        alumnos,
        emitidaEl: hoy,
    };
}

/**
 * Los instrumentos de las evaluaciones del lapso. `conNotas`: además, por cada
 * actividad calificada con instrumento, las marcas de cada alumno.
 */
export async function instrumentosDelLapso(prisma: any, classroomId: string, subjectId: string, lapso: string, conNotas: boolean) {
    const [c, alumnos, filas] = await Promise.all([
        laClase(prisma, classroomId, subjectId, lapso),
        alumnosDe(prisma, classroomId),
        prisma.evaluationPlanRow.findMany({
            where: { classroomId, subjectId, lapso, rowType: 'EVALUATION', puntos: { gt: 0 } },
            orderBy: [{ weekNumber: 'asc' }, { orderIndex: 'asc' }],
            select: {
                id: true,
                weekNumber: true,
                actividadEval: true,
                tecnicas: true,
                instrumentos: true,
                puntos: true,
                instrumento: { select: { definicion: true } },
                classActivities: conNotas
                    ? { select: { id: true, title: true, instrumento: true, detalleDelInstrumento: true, createdAt: true }, orderBy: { createdAt: 'asc' } }
                    : false,
            },
        }),
    ]);
    return {
        docente: c.docente,
        area: c.area,
        seccion: c.aula.name,
        ciclo: c.aula.academicYear?.name ?? '',
        lapso: LAPSO_LEGIBLE[lapso] ?? lapso,
        alumnos,
        evaluaciones: filas.map((f: any) => {
            const def = (f.instrumento?.definicion ?? null) as Instrumento | null;
            return {
                id: f.id,
                semana: f.weekNumber,
                actividad: f.actividadEval ?? '',
                tecnica: f.tecnicas ?? '',
                nombreDelInstrumento: f.instrumentos ?? '',
                puntos: f.puntos,
                instrumento: def,
                maximo: def ? maximoDelInstrumento(def) : null,
                calificadas: conNotas
                    ? (f.classActivities ?? [])
                          .filter((a: any) => a.instrumento && a.detalleDelInstrumento && Object.keys(a.detalleDelInstrumento).length > 0)
                          .map((a: any) => ({ id: a.id, titulo: a.title, instrumento: a.instrumento, detalle: a.detalleDelInstrumento }))
                    : [],
            };
        }),
    };
}
