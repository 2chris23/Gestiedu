import { AppErrors } from '../middleware/error.middleware';
import { datosDelPlantel } from './constancias.service';

/**
 * EL CARNET ESTUDIANTIL, PARA IMPRIMIR
 *
 * Foto (la del perfil), nombre, cédula, sección, año escolar, el liceo y la
 * firma del director. Uno, o la sección entera (varios por hoja).
 *
 * **Sin QR**, decidido: la asistencia ya tiene el QR del teléfono del alumno,
 * que cambia cada 10 s justo para que no se pueda imprimir ni pasar por foto;
 * y para «ver al estudiante» el personal lo busca en Usuarios. Un QR impreso
 * no añadía nada y sería un código más que cuidar.
 *
 * Solo el admin. Pruebas: `tests/integration/carnet.test.ts` (CARNET-*).
 */

const alumnoDelCarnet = (i: any) => ({
    id: i.student.id,
    nombres: i.student.firstName,
    apellidos: i.student.lastName,
    tipoDeCedula: i.student.tipoDeCedula ?? null,
    foto: i.student.avatar ?? null,
    seccion: i.classroom.name,
    ciclo: i.academicYear.name,
});

const SELECT = {
    student: { select: { id: true, firstName: true, lastName: true, tipoDeCedula: true, avatar: true, role: true, isActive: true } },
    classroom: { select: { id: true, name: true } },
    academicYear: { select: { name: true, status: true } },
};

async function delLiceo(instituteId: string, hoy: string) {
    const p = await datosDelPlantel(instituteId, hoy);
    return { liceo: p.liceo, firmante: p.firmante };
}

/** El carnet de un alumno: el de su sección de este año. */
export async function carnetDelAlumno(prisma: any, instituteId: string, studentId: string, hoy: string) {
    const i = await prisma.studentClassroom.findFirst({
        where: { studentId, isActive: true, academicYear: { status: { in: ['ACTIVE', 'UPCOMING'] } } },
        orderBy: { enrollmentDate: 'desc' },
        select: SELECT,
    });
    if (!i || i.student.role !== 'STUDENT') throw AppErrors.NotFound('Alumno inscrito');
    return { ...(await delLiceo(instituteId, hoy)), carnets: [alumnoDelCarnet(i)] };
}

/** Los carnets de una sección entera, por apellido. */
export async function carnetsDeLaSeccion(prisma: any, instituteId: string, classroomId: string, hoy: string) {
    const aula = await prisma.classroom.findUnique({ where: { id: classroomId }, select: { id: true, name: true } });
    if (!aula) throw AppErrors.NotFound('Sección');
    const filas = await prisma.studentClassroom.findMany({ where: { classroomId, isActive: true }, select: SELECT });
    const carnets = filas
        .filter((i: any) => i.student.role === 'STUDENT' && i.student.isActive)
        .map(alumnoDelCarnet)
        .sort((a: any, b: any) => a.apellidos.localeCompare(b.apellidos, 'es') || a.nombres.localeCompare(b.nombres, 'es'));
    return { ...(await delLiceo(instituteId, hoy)), seccion: aula.name, carnets };
}
