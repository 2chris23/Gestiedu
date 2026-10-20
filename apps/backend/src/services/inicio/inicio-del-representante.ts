import { PrismaClient } from '@prisma/client';
import { TutorDashboardDto } from '../../dto/dashboard-response.dto';
import { getAcademicConfig, DEFAULT_ACADEMIC_CONFIG } from '../promotion/configuracion-academica';
import { instituteTimezone, todayInTimezone } from '../../utils/school-time';
import { platformPrisma } from '../../config/database';
import { boletaDelAlumno } from '../boleta.service';
import { ventanaDelLapsoYCiclo, asistenciaEnLaVentana } from './comun';

/**
 * Dashboard para Tutores (IMPLEMENTADO)
 */
export async function inicioDelRepresentante(userId: string, db: PrismaClient, instituteId?: string): Promise<TutorDashboardDto> {
    let minPassing = 10;
    // Desde qué porcentaje se le avisa al representante. Lo pone el liceo;
    // 80 es solo el punto de partida. Ver `AcademicConfig.asistenciaMinima`.
    let asistenciaMinima = DEFAULT_ACADEMIC_CONFIG.asistenciaMinima;
    if (instituteId) {
        try {
            const config = await getAcademicConfig(instituteId);
            minPassing = typeof config.notaMinimaAprobatoria === 'number' ? config.notaMinimaAprobatoria : 10;
            asistenciaMinima = config.asistenciaMinima;
        } catch {
            minPassing = 10;
        }
    }

    const tutor = await db.user.findUnique({
        where: { id: userId },
        include: {
            children: {
                include: {
                    student: {
                        select: {
                            id: true, firstName: true, lastName: true, avatar: true,
                            studentClassrooms: {
                                where: { isActive: true },
                                take: 1,
                                select: {
                                    // Hace falta para acotar al lapso y al ciclo en curso.
                                    // Sin este campo, el filtro de más abajo se queda vacío
                                    // y se vuelve a contar toda la vida escolar — en silencio.
                                    academicYearId: true,
                                    classroom: { select: { id: true, grade: true, section: true, shift: true } }
                                }
                            }
                        }
                    }
                }
            }
        }
    });

    if (!tutor) throw new Error('Tutor no encontrado');

    let resolvedInstituteId = instituteId;
    if (!resolvedInstituteId) {
        const inst = await platformPrisma.institute.findFirst({ select: { id: true } });
        resolvedInstituteId = inst?.id ?? '';
    }
    const hoy = todayInTimezone(await instituteTimezone(db));

    const childrenWithStats = await Promise.all(
        tutor.children.map(async (child: any) => {
            const childStudentId = child.student.id;
            const childAcademicYearId = child.student.studentClassrooms?.[0]?.academicYearId ?? null;
            const ventanaHijo = await ventanaDelLapsoYCiclo(
                db,
                childAcademicYearId
            );

            // REVISION-FASE-E (punto 3): cada hijo muestra el promedio de la boleta
            // oficial (`boletaDelAlumno`), consultado en paralelo y sin N+1 con la sección.
            const [boleta, asistencia] = await Promise.all([
                (async () => {
                    try {
                        return await boletaDelAlumno(db, resolvedInstituteId, childStudentId, {
                            academicYearId: childAcademicYearId || undefined,
                            hoy,
                        });
                    } catch {
                        return null;
                    }
                })(),
                asistenciaEnLaVentana(db, childStudentId, ventanaHijo.lapso),
            ]);

            const childClassroom = child.student.studentClassrooms?.[0]?.classroom;
            const boletaPromedio = boleta?.promedios?.definitivo ?? null;
            const hasGrades = boletaPromedio !== null;
            const average = boletaPromedio !== null ? boletaPromedio : 0;

            return {
                id: childStudentId,
                fullName: `${child.student.firstName} ${child.student.lastName}`,
                firstName: child.student.firstName,
                lastName: child.student.lastName,
                avatar: child.student.avatar,
                classroom: childClassroom
                    ? `${childClassroom.grade}° ${childClassroom.section}`
                    : null,
                // La sección, para poder abrir SU horario y su calendario.
                classroomId: childClassroom?.id ?? null,
                shift: childClassroom?.shift ?? null,
                average,
                hasGrades,
                attendancePercentage: Math.round(Number(asistencia?.porcentaje || 0)),
                hasAttendance: (asistencia?.registros ?? 0) > 0,
                relationship: child.relationship
            };
        })
    );

    const alerts = childrenWithStats
        .filter(c => (c.hasGrades && c.average < minPassing) || (c.hasAttendance && c.attendancePercentage < asistenciaMinima))
        .map(c => ({
            studentId: c.id,
            studentName: c.fullName,
            type: (c.hasGrades && c.average < minPassing) ? 'ACADEMIC' : 'ATTENDANCE',
            message: (c.hasGrades && c.average < minPassing)
                ? `Promedio bajo: ${c.average}`
                : `Asistencia baja: ${c.attendancePercentage}%`,
            date: new Date().toISOString()
        }));

    return {
        tutor: { id: tutor.id, fullName: `${tutor.firstName} ${tutor.lastName}` },
        children: childrenWithStats,
        representados: childrenWithStats,
        alerts
    };
}
