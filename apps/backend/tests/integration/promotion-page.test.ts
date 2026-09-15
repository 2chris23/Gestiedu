import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { UserRole } from '../../src/utils/prisma-enums';
import {
    createTestServer,
    createTestPrismaClient,
    cleanTestDatabase,
    createTestUserWithPassword,
} from '../helpers';
import {
    getPromotionContext,
    previewStrategyAssignment,
    missingAssignmentIds,
    confirmClose,
} from '../../src/services/promotion/close-cycle.service';

function gId(): string {
    // Siempre la 'c' delante: ver la nota de `tests/helpers.ts`.
    return `c${createId()}`;
}

/**
 * FASE 3.5 PARTE 2 — PÁGINA DE PROMOCIÓN (5 tests obligatorios)
 *
 * 1. Estrategia automática → TODOS con destino prellenado (anillos 100%).
 * 2. Cambio manual después de la estrategia → se respeta, no se sobreescribe.
 * 3. Mover a un año que NO es el inmediato siguiente → se guarda correctamente.
 * 4. Completitud: el botón "Confirmar" está bloqueado mientras exista al
 *    menos un estudiante sin destino (en cualquier año/sección).
 * 5. Sin N+1: el contexto se sirve con un número ACOTADO de queries aunque
 *    haya decenas de estudiantes en varias secciones.
 */

const INSTITUTE_SLUG = 'test-institute';

describe('Fase 3.5 Parte 2 — Página de promoción', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;

    let year: any;
    let nextYear: any;
    let laterYear: any;
    let nextSections: any[] = [];
    let laterSection: any;
    let period: any;
    let subject: any;
    let admin: { user: any; token: string };
    let teacher: any;

    const auth = (token: string) => ({
        Authorization: `Bearer ${token}`,
        'X-Institute-Slug': INSTITUTE_SLUG,
    });

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
    });

    afterAll(async () => {
        await prisma.$disconnect();
        await server.close();
    });

    beforeEach(async () => {
        await cleanTestDatabase(prisma);
        nextSections = [];
        await prisma.institute.upsert({
            where: { id: 'institute' },
            update: {},
            create: { id: 'institute', code: 'TEST_INST', slug: 'test-institute', name: 'Test Institute', email: 'test@institute.com' },
        });

        year = await prisma.academicYear.create({
            data: {
                id: gId(),
                name: `2024-${gId().substring(0, 8)}`,
                startDate: new Date('2024-01-01'),
                endDate: new Date('2024-12-31'),
                isActive: true,
                status: 'ACTIVE',
                instituteId: 'institute',
            },
        });
        nextYear = await prisma.academicYear.create({
            data: {
                id: gId(),
                name: `2025-${gId().substring(0, 8)}`,
                startDate: new Date('2025-01-01'),
                endDate: new Date('2025-12-31'),
                isActive: false,
                status: 'UPCOMING',
                instituteId: 'institute',
            },
        });
        laterYear = await prisma.academicYear.create({
            data: {
                id: gId(),
                name: `2026-${gId().substring(0, 8)}`,
                startDate: new Date('2026-01-01'),
                endDate: new Date('2026-12-31'),
                isActive: false,
                status: 'UPCOMING',
                instituteId: 'institute',
            },
        });

        // Secciones: 2 en el año siguiente + 1 en el año posterior.
        // Son de 2do grado porque los estudiantes del año actual están en 1ro:
        // al promover pasan a 2do, y la estrategia solo puede colocarlos donde
        // exista una sección de su grado destino.
        for (const [letter, y] of [['A', nextYear], ['B', nextYear]] as const) {
            const sec = await prisma.classroom.create({
                data: {
                    id: gId(),
                    name: `2do Grado ${letter}`,
                    slug: `n-${letter}-${gId().substring(0, 12)}`,
                    grade: 2,
                    section: letter,
                    capacity: 30,
                    academicYearId: y.id,
                    instituteId: 'institute',
                },
            });
            nextSections.push(sec);
        }
        laterSection = await prisma.classroom.create({
            data: {
                id: gId(),
                name: '2do Grado A',
                slug: `later-a-${gId().substring(0, 12)}`,
                grade: 2,
                section: 'A',
                capacity: 30,
                academicYearId: laterYear.id,
                instituteId: 'institute',
            },
        });

        period = await prisma.period.create({
            data: {
                id: gId(),
                name: 'Primer Lapso',
                startDate: new Date('2024-01-01'),
                endDate: new Date('2024-04-30'),
                isActive: true,
                academicYearId: year.id,
            },
        });

        subject = await prisma.subject.create({
            data: {
                name: 'Matemática',
                code: `MAT-${gId().substring(0, 6)}`,
                slug: `mat-${gId().substring(0, 10)}`,
                color: '#3B82F6',
                instituteId: 'institute',
            },
        });

        teacher = await createTestUserWithPassword(prisma, UserRole.TEACHER, 'TeacherPass123!');
        const a = await createTestUserWithPassword(prisma, UserRole.ADMIN, 'AdminPass123!');
        admin = { user: a.user, token: '' };
        const aLogin = await request(server.server)
            .post('/api/auth/login')
            .set('X-Institute-Slug', INSTITUTE_SLUG)
            .send({ email: a.user.email, password: 'AdminPass123!' })
            .expect(200);
        admin.token = aLogin.body.tokens.accessToken;
    });

    /** Crea una sección del año actual (grade 1) y N estudiantes con promedio controlado. */
    async function createSectionWithStudents(letter: string, count: number, baseAverage: number): Promise<{ classroom: any; students: any[] }> {
        const classroom = await prisma.classroom.create({
            data: {
                id: gId(),
                name: `1er Grado ${letter}`,
                slug: `sec-${letter}-${gId().substring(0, 12)}`,
                grade: 1,
                section: letter,
                capacity: 40,
                academicYearId: year.id,
                instituteId: 'institute',
            },
        });
        await prisma.classroomSubject.create({
            data: { classroomId: classroom.id, subjectId: subject.id },
        });

        const activity = await prisma.activity.create({
            data: {
                title: 'Evaluación',
                type: 'SUMATIVA',
                scope: 'CLASSROOM',
                startDate: new Date('2024-01-01'),
                maxGrade: 20,
                weight: 1,
                classroomId: classroom.id,
                subjectId: subject.id,
                periodId: period.id,
                lapso: '1',
                createdBy: teacher.user.id,
                instituteId: 'institute',
            },
        });

        const students: any[] = [];
        for (let i = 0; i < count; i++) {
            const s = await createTestUserWithPassword(prisma, UserRole.STUDENT, 'StudentPass123!');
            await prisma.studentClassroom.create({
                data: { studentId: s.user.id, classroomId: classroom.id, academicYearId: year.id, isActive: true },
            });
            await prisma.user.update({
                where: { id: s.user.id },
                data: {
                    firstName: `Est${letter}${i}`,
                    lastName: 'Test',
                    gender: i % 2 === 0 ? 'FEMENINO' : 'MASCULINO',
                },
            });
            await prisma.grade.create({
                data: {
                    studentId: s.user.id,
                    subjectId: subject.id,
                    activityId: activity.id,
                    periodId: period.id,
                    teacherId: teacher.user.id,
                    score: Math.min(20, Math.max(1, baseAverage - i)),
                },
            });
            students.push(s.user);
        }
        return { classroom, students };
    }

    it('1. Estrategia automática → TODOS los estudiantes con destino prellenado (anillos 100%)', async () => {
        const { students } = await createSectionWithStudents('A', 6, 18);

        const preview = await previewStrategyAssignment(prisma, year.id, 'institute', 'by-performance', 'balanced');
        const assigned = new Map(preview.assignments.map(a => [a.studentId, a.sectionId]));

        // Todo estudiante promovido tiene sección → completitud vacía
        const context = await getPromotionContext(prisma, year.id, 'institute');
        const missing = missingAssignmentIds(context.suggestions, assigned);
        expect(missing.length).toBe(0);
        expect(students.every(s => assigned.get(s.id))).toBe(true);
    });

    it('2. Cambio manual DESPUÉS de la estrategia → se respeta, no se sobreescribe', async () => {
        await createSectionWithStudents('A', 3, 18);

        const preview = await previewStrategyAssignment(prisma, year.id, 'institute', 'by-performance', 'top');
        // La estrategia asignó la primera sección a todos; el admin mueve a UNO a la sección B
        const moved = preview.assignments[0];
        const decisions = preview.assignments.map(a => ({
            studentId: a.studentId,
            finalResult: 'PROMOVIDO' as const,
            assignedClassroomId: a.studentId === moved.studentId ? nextSections[1].id : a.sectionId,
        }));

        const confirmed = await confirmClose(
            prisma,
            { academicYearId: year.id, decisions, strategyKey: 'manual' },
            'institute'
        );
        const rec = await prisma.academicRecord.findFirst({ where: { studentId: moved.studentId } });
        expect(rec!.assignedClassroomId).toBe(nextSections[1].id); // el cambio manual manda
    });

    it('3. Mover a un año que NO es el inmediato siguiente → se guarda correctamente', async () => {
        const { students } = await createSectionWithStudents('A', 2, 18);

        const confirmed = await confirmClose(
            prisma,
            {
                academicYearId: year.id,
                decisions: students.map(s => ({
                    studentId: s.id,
                    finalResult: 'PROMOVIDO' as const,
                    assignedClassroomId: laterSection.id, // año posterior, NO el inmediato
                })),
                strategyKey: 'manual',
            },
            'institute'
        );

        const rec = await prisma.academicRecord.findFirst({ where: { studentId: students[0].id } });
        expect(rec!.assignedClassroomId).toBe(laterSection.id);
        // Matrícula creada en el AÑO del aula destino (año posterior)
        const enr = await prisma.studentClassroom.findFirst({
            where: { studentId: students[0].id, academicYearId: laterYear.id },
        });
        expect(enr).toBeTruthy();
        expect(enr!.classroomId).toBe(laterSection.id);
    });

    it('4. El botón "Confirmar" está bloqueado mientras haya UN estudiante sin destino (cualquier año/sección)', async () => {
        const { students } = await createSectionWithStudents('A', 3, 18);
        const context = await getPromotionContext(prisma, year.id, 'institute');

        // Nadie asignado → 3 faltantes (aunque la sección B esté vacía, la A tiene 3)
        const assignmentsEmpty: Record<string, string | null> = {};
        expect(missingAssignmentIds(context.suggestions, assignmentsEmpty).length).toBe(students.length);

        // Todos menos uno → sigue bloqueado (1 faltante)
        const almost: Record<string, string | null> = {};
        students.forEach((s, i) => { if (i > 0) almost[s.id] = nextSections[0].id; });
        const missing = missingAssignmentIds(context.suggestions, almost);
        expect(missing.length).toBe(1);
        expect(missing[0]).toBe(students[0].id);
    });

    it('5. Sin N+1: el contexto se sirve con un número ACOTADO de queries (30 estudiantes, 3 secciones)', async () => {
        await createSectionWithStudents('A', 10, 18);
        await createSectionWithStudents('B', 10, 16);
        await createSectionWithStudents('C', 10, 14);

        // Contar queries ejecutadas durante la petición del contexto
        let queryCount = 0;
        const listener = () => { queryCount++; };
        (prisma as any).$on('query', listener);
        try {
            const res = await request(server.server)
                .get(`/api/academic-years/${year.id}/promotion-context`)
                .set(auth(admin.token))
                .expect(200);
            expect(res.body.suggestions.length).toBe(30);
            expect(res.body.destinationYears.length).toBeGreaterThanOrEqual(2);
        } finally {
            (prisma as any).$off?.('query', listener);
        }
        // El contexto NO dispara una query por estudiante: acotado a ~20 consultas
        // (años, aulas, materias, actividades, notas en bulto...). Con N+1 serían cientos.
        expect(queryCount).toBeLessThan(40);
    });
});
