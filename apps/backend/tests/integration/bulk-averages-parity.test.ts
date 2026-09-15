import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { UserRole } from '../../src/utils/prisma-enums';
import { gradesService } from '../../src/services/grades.service';
import { bulkSubjectAverages } from '../../src/services/bulk-averages.service';
import { createTestPrismaClient, createTestUser, createTestAcademicYear, createTestSubject } from '../helpers';

/**
 * EL PROMEDIO DE LA LISTA Y EL DE LA FICHA TIENEN QUE COINCIDIR
 *
 * El listado de una sección calcula los promedios en bloque (4 consultas para
 * toda la sección) y la ficha del estudiante los calcula uno a uno. Son dos
 * implementaciones de la misma regla, así que pueden separarse con el tiempo:
 * esta prueba las compara sobre los casos que importan. Si alguien cambia una y
 * no la otra, esto falla.
 */

const gId = () => {
    // Siempre la 'c' delante: ver la nota de `tests/helpers.ts`.
    return `c${createId()}`;
};

describe('El promedio en bloque coincide con el de un solo estudiante', () => {
    let prisma: PrismaClient;
    let classroom: any;
    let year: any;
    let period: any;
    let conPlan: any;
    let sinPlan: any;
    const studentIds: string[] = [];
    let planRow: any;
    let teacherId: string;

    beforeAll(async () => {
        prisma = await createTestPrismaClient();
        year = await createTestAcademicYear(prisma, 'institute');
        period = await prisma.period.create({
            data: {
                id: gId(),
                name: 'Primer Lapso',
                academicYearId: year.id,
                startDate: new Date('2026-09-01'),
                endDate: new Date('2026-12-15'),
                isActive: true,
            },
        });

        classroom = await prisma.classroom.create({
            data: {
                id: gId(),
                name: 'Paridad A',
                slug: `paridad-${Date.now()}`,
                grade: 1,
                section: 'A',
                capacity: 30,
                academicYearId: year.id,
                instituteId: 'institute',
            },
        });

        teacherId = (await createTestUser(prisma, UserRole.TEACHER)).user.id;
        conPlan = await createTestSubject(prisma, 'institute');
        sinPlan = await createTestSubject(prisma, 'institute');

        // Tres estudiantes: con notas del plan, con notas sueltas, y sin nada
        for (let i = 0; i < 3; i++) {
            const s = await createTestUser(prisma, UserRole.STUDENT);
            studentIds.push(s.user.id);
            await prisma.studentClassroom.create({
                data: { studentId: s.user.id, classroomId: classroom.id, academicYearId: year.id, isActive: true },
            });
        }

        // Materia CON plan: un criterio de 8 puntos
        planRow = await prisma.evaluationPlanRow.create({
            data: {
                id: gId(),
                classroomId: classroom.id,
                subjectId: conPlan.id,
                lapso: '1',
                rowType: 'EVALUATION',
                puntos: 8,
                weekNumber: 1,
                orderIndex: 1,
            },
        });

        // Nota del criterio, puesta desde Clase en Vivo
        await prisma.classActivity.create({
            data: {
                classroomId: classroom.id,
                subjectId: conPlan.id,
                title: 'Taller del criterio',
                type: 'TAREA',
                target: 'CURRENT',
                planRowId: planRow.id,
                maxScore: 20,
                scores: { [studentIds[0]]: 16, [studentIds[1]]: 10 },
            },
        });

        // Materia SIN plan: una nota en grades y otra suelta de Clase en Vivo,
        // con escala distinta (10) para comprobar la normalización a 20
        const actividad = await prisma.activity.create({
            data: {
                title: 'Prueba escrita',
                type: 'SUMATIVA',
                scope: 'CLASSROOM',
                startDate: new Date('2026-09-15'),
                maxGrade: 20,
                weight: 1,
                classroomId: classroom.id,
                subjectId: sinPlan.id,
                periodId: period.id,
                lapso: '1',
                createdBy: teacherId,
                instituteId: 'institute',
            },
        });
        await prisma.grade.create({
            data: {
                studentId: studentIds[0],
                activityId: actividad.id,
                subjectId: sinPlan.id,
                periodId: period.id,
                teacherId,
                score: 18,
            },
        });
        await prisma.classActivity.create({
            data: {
                classroomId: classroom.id,
                subjectId: sinPlan.id,
                title: 'Quiz sobre 10',
                type: 'TAREA',
                target: 'CURRENT',
                planRowId: null,
                maxScore: 10,
                scores: { [studentIds[0]]: 7, [studentIds[1]]: 5 },
            },
        });
    }, 120000);

    afterAll(async () => {
        await prisma.classActivity.deleteMany({ where: { classroomId: classroom.id } }).catch(() => {});
        await prisma.evaluationPlanRow.deleteMany({ where: { classroomId: classroom.id } }).catch(() => {});
        await prisma.grade.deleteMany({ where: { studentId: { in: studentIds } } }).catch(() => {});
        await prisma.activity.deleteMany({ where: { classroomId: classroom.id } }).catch(() => {});
        await prisma.studentClassroom.deleteMany({ where: { classroomId: classroom.id } }).catch(() => {});
        await prisma.classroom.deleteMany({ where: { id: classroom.id } }).catch(() => {});
        await prisma.period.deleteMany({ where: { id: period.id } }).catch(() => {});
        await prisma.$disconnect();
    }, 120000);

    it('da el mismo número que el cálculo por estudiante, materia por materia', async () => {
        const subjectIds = [conPlan.id, sinPlan.id];
        const bulk = await bulkSubjectAverages(prisma, {
            classroomId: classroom.id,
            studentIds,
            subjectIds,
            periodId: period.id,
        });

        for (const studentId of studentIds) {
            for (const subjectId of subjectIds) {
                const uno = await gradesService.calculateWeightedSubjectAverage(prisma, studentId, subjectId, period.id);
                const enBloque = bulk.get(studentId)?.get(subjectId) ?? 0;
                expect({ studentId, subjectId, enBloque }).toEqual({
                    studentId,
                    subjectId,
                    enBloque: Math.round(uno * 100) / 100,
                });
            }
        }
    }, 120000);

    it('con plan de evaluación escala a 20 lo calificado', async () => {
        const bulk = await bulkSubjectAverages(prisma, {
            classroomId: classroom.id,
            studentIds,
            subjectIds: [conPlan.id],
            periodId: period.id,
        });

        // 16/20 en un criterio de 8 puntos → 6.4; al ser lo único calificado
        // se escala a la base 20: 6.4 × (20/8) = 16
        expect(bulk.get(studentIds[0])!.get(conPlan.id)).toBeCloseTo(16, 1);
        expect(bulk.get(studentIds[1])!.get(conPlan.id)).toBeCloseTo(10, 1);
    }, 60000);

    it('sin plan promedia todas las notas y normaliza las escalas', async () => {
        const bulk = await bulkSubjectAverages(prisma, {
            classroomId: classroom.id,
            studentIds,
            subjectIds: [sinPlan.id],
            periodId: period.id,
        });

        // 18/20 y 7/10 (=14/20) → (18 + 14) / 2 = 16
        expect(bulk.get(studentIds[0])!.get(sinPlan.id)).toBeCloseTo(16, 1);
        // Solo la nota de Clase en Vivo: 5/10 → 10
        expect(bulk.get(studentIds[1])!.get(sinPlan.id)).toBeCloseTo(10, 1);
    }, 60000);

    it('un estudiante sin notas da 0, no un error', async () => {
        const bulk = await bulkSubjectAverages(prisma, {
            classroomId: classroom.id,
            studentIds,
            subjectIds: [conPlan.id, sinPlan.id],
            periodId: period.id,
        });

        expect(bulk.get(studentIds[2])!.get(conPlan.id)).toBe(0);
        expect(bulk.get(studentIds[2])!.get(sinPlan.id)).toBe(0);
    }, 60000);
});
