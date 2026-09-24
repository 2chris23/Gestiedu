import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { UserRole } from '../../src/utils/prisma-enums';
import { createTestPrismaClient, cleanTestDatabase, createTestUser } from '../helpers';
import { gradesService } from '../../src/services/grades.service';
import { bulkSubjectAverages } from '../../src/services/bulk-averages.service';
import { RedisCache } from '../../src/config/redis';

/**
 * UNA NOTA SUELTA DE CLASE EN VIVO ES DEL LAPSO EN QUE SE PUSO
 *
 * Sin plan de evaluación, el promedio del lapso junta todas las notas de la
 * materia. Las de Clase en Vivo que no cuelgan de ningún criterio del plan
 * («sueltas») se sumaban a TODOS los lapsos, sin mirar cuándo se pusieron: un
 * 20 del primer lapso aparecía también en el segundo y en el tercero.
 *
 *   LAP-01  la nota suelta cuenta solo en el lapso de su clase;
 *   LAP-02  sin clase, cuenta por su fecha de entrega;
 *   LAP-03  el cálculo en bloque da lo mismo.
 */

const gId = () => `c${createId()}`;
const dia = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

describe('Notas sueltas por lapso (LAP-01…03)', () => {
    let prisma: PrismaClient;
    let profe: any;
    let alumno: any;
    let seccion: any;
    let mate: any;
    let lapso1: any;
    let lapso2: any;

    beforeAll(async () => {
        prisma = await createTestPrismaClient();
    }, 120000);

    afterAll(async () => {
        await prisma.$disconnect();
    });

    beforeEach(async () => {
        await cleanTestDatabase(prisma);
        await RedisCache.clearPattern('*').catch(() => undefined);
        profe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        const year = await prisma.academicYear.create({
            data: { id: gId(), name: `Ciclo-${gId().slice(0, 6)}`, startDate: dia('2026-09-15'), endDate: dia('2027-07-15'), isActive: true, status: 'ACTIVE', instituteId: 'institute' } as any,
        });
        lapso1 = await prisma.period.create({ data: { id: gId(), name: 'Primer Lapso', startDate: dia('2026-09-15'), endDate: dia('2026-12-15'), isActive: false, academicYearId: year.id } });
        lapso2 = await prisma.period.create({ data: { id: gId(), name: 'Segundo Lapso', startDate: dia('2027-01-07'), endDate: dia('2027-03-31'), isActive: true, academicYearId: year.id } });
        seccion = await prisma.classroom.create({
            data: { id: gId(), name: '1er Año A', slug: `aula-${gId()}`, grade: 1, section: 'A', capacity: 30, academicYearId: year.id, instituteId: 'institute' } as any,
        });
        mate = await prisma.subject.create({
            data: { id: gId(), name: 'Matemática', code: `MAT-${gId().slice(0, 6).toUpperCase()}`, slug: `mate-${gId()}`, instituteId: 'institute' } as any,
        });
        await prisma.classroomSubject.create({ data: { classroomId: seccion.id, subjectId: mate.id, teacherId: profe.id } });
        alumno = (await createTestUser(prisma, UserRole.STUDENT)).user;
        await prisma.studentClassroom.create({
            data: { id: gId(), studentId: alumno.id, classroomId: seccion.id, academicYearId: year.id, isActive: true },
        });

        // Segundo lapso: un 16 en la tabla de notas.
        const act = await prisma.activity.create({
            data: {
                id: gId(), title: 'Prueba', description: 'x', type: 'TAREA' as any, scope: 'CLASSROOM' as any,
                classroomId: seccion.id, subjectId: mate.id, periodId: lapso2.id, createdBy: profe.id, maxGrade: 20, weight: 1,
                startDate: dia('2027-02-01'), endDate: dia('2027-02-01'), dueDate: dia('2027-02-01'),
            } as any,
        });
        await prisma.grade.create({ data: { id: gId(), score: 16, studentId: alumno.id, activityId: act.id, periodId: lapso2.id, subjectId: mate.id, teacherId: profe.id } });
    }, 180000);

    const notaSueltaEnClase = async (ymd: string, score: number) => {
        const clase = await prisma.classSession.create({
            data: { id: gId(), classroomId: seccion.id, subjectId: mate.id, date: dia(ymd), status: 'ACTIVE' } as any,
        });
        await prisma.classActivity.create({
            data: { id: gId(), title: 'Taller', classroomId: seccion.id, subjectId: mate.id, classSessionId: clase.id, maxScore: 20, scores: { [alumno.id]: score } } as any,
        });
    };

    it('LAP-01: un 20 puesto en una clase del primer lapso no entra en el segundo', async () => {
        await notaSueltaEnClase('2026-10-20', 20);
        expect(await gradesService.calculateWeightedSubjectAverage(prisma, alumno.id, mate.id, lapso1.id)).toBe(20);
        expect(await gradesService.calculateWeightedSubjectAverage(prisma, alumno.id, mate.id, lapso2.id)).toBe(16);
        // Y el del ciclo: (20 + 16) / 2 = 18, no (20 + 18) / 2 = 19.
        expect(await gradesService.calculateWeightedSubjectAverage(prisma, alumno.id, mate.id)).toBe(18);
    });

    it('LAP-02: sin clase, la nota suelta va al lapso de su fecha de entrega', async () => {
        await prisma.classActivity.create({
            data: { id: gId(), title: 'Tarea', classroomId: seccion.id, subjectId: mate.id, dueDate: dia('2026-11-05'), maxScore: 20, scores: { [alumno.id]: 20 } } as any,
        });
        expect(await gradesService.calculateWeightedSubjectAverage(prisma, alumno.id, mate.id, lapso2.id)).toBe(16);
        expect(await gradesService.calculateWeightedSubjectAverage(prisma, alumno.id, mate.id, lapso1.id)).toBe(20);
    });

    it('LAP-03: el cálculo en bloque reparte igual', async () => {
        await notaSueltaEnClase('2026-10-20', 20);
        const lapsoDos = await bulkSubjectAverages(prisma, { classroomId: seccion.id, studentIds: [alumno.id], subjectIds: [mate.id], periodId: lapso2.id });
        expect(lapsoDos.get(alumno.id)!.get(mate.id)).toBe(16);
        const ciclo = await bulkSubjectAverages(prisma, { classroomId: seccion.id, studentIds: [alumno.id], subjectIds: [mate.id] });
        expect(ciclo.get(alumno.id)!.get(mate.id)).toBe(18);
    });
});
