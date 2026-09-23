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
    createTestClassroom,
} from '../helpers';
import {
    prepareClose,
    confirmClose,
    getAcademicConfig,
    updateAcademicConfig,
} from '../../src/services/promotion/close-cycle.service';
import { getStrategy } from '../../src/services/promotion/strategies';

function gId(): string {
    // Siempre la 'c' delante: ver la nota de `tests/helpers.ts`.
    return `c${createId()}`;
}

/**
 * FASE 3.5-C — CIERRE DE CICLO ESCOLAR + PROSECUCIÓN (7 tests obligatorios)
 *
 * 1. maxPendientes=2: 1 reprobada → promocionado con pendientes; 3 → no promocionado.
 * 2. maxPendientes=0 (configurable): hasta 1 reprobada → NO promocionado.
 * 3. El admin edita la sugerencia → el resultado final respeta su decisión.
 * 4. Las 4 estrategias de asignación de sección (con 10 estudiantes y 2 secciones).
 * 5. El admin cambia la sección sugerida manualmente → se respeta.
 * 6. Dashboard del estudiante compara con el año anterior (AcademicRecord).
 * 7. Cerrar el mismo ciclo dos veces → rechazado (idempotencia).
 */

const INSTITUTE_SLUG = 'test-institute';

describe('Fase 3.5-C — Cierre de ciclo, prosecución y comparación', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;

    let year: any;
    let nextYear: any;
    let nextSectionA: any;
    let nextSectionB: any;
    let classroomA: any;
    let period: any;
    let subjects: any[] = [];
    let activityIds: string[] = [];
    let teacher: { user: any; token: string };
    let admin: { user: any; token: string };

    const login = (email: string, password: string, slug = INSTITUTE_SLUG) =>
        request(server.server)
            .post('/api/auth/login')
            .set('X-Institute-Slug', slug)
            .send({ email, password });

    const auth = (token: string) => ({
        Authorization: `Bearer ${token}`,
        'X-Institute-Slug': INSTITUTE_SLUG,
    });

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();

        // Sembrar el instituto en la Platform DB (para la config académica)
        const { platformPrisma } = await import('../../src/config/database');
        await platformPrisma.institute.upsert({
            where: { id: 'institute' },
            update: {
                status: 'ACTIVE' as any,
                academicConfig: { notaMinimaAprobatoria: 10, maxMateriasPendientesParaPromover: 2, permitePendientesEnUltimoAno: false },
            },
            create: {
                id: 'institute',
                code: 'TEST_INST',
                slug: 'test-institute',
                subdomain: 'test-institute',
                name: 'Test Institute',
                email: 'test@institute.com',
                environment: 'development',
                status: 'ACTIVE' as any,
                academicConfig: { notaMinimaAprobatoria: 10, maxMateriasPendientesParaPromover: 2, permitePendientesEnUltimoAno: false },
            },
        });
    });

    afterAll(async () => {
        await prisma.$disconnect();
        await server.close();
    });

    beforeEach(async () => {
        await cleanTestDatabase(prisma);
        await prisma.institute.upsert({
            where: { id: 'institute' },
            update: {},
            create: {
                id: 'institute',
                code: 'TEST_INST',
                slug: 'test-institute',
                name: 'Test Institute',
                email: 'test@institute.com',
            },
        });

        // Reset de la config académica a los defaults
        await updateAcademicConfig('institute', {
            notaMinimaAprobatoria: 10,
            maxMateriasPendientesParaPromover: 2,
            permitePendientesEnUltimoAno: false,
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
        nextSectionA = await prisma.classroom.create({
            data: {
                id: gId(),
                name: '1er Grado A',
                slug: `next-a-${gId().substring(0, 14)}`,
                grade: 1,
                section: 'A',
                capacity: 30,
                academicYearId: nextYear.id,
                instituteId: 'institute',
            },
        });
        nextSectionB = await prisma.classroom.create({
            data: {
                id: gId(),
                name: '1er Grado B',
                slug: `next-b-${gId().substring(0, 14)}`,
                grade: 1,
                section: 'B',
                capacity: 30,
                academicYearId: nextYear.id,
                instituteId: 'institute',
            },
        });
        classroomA = await createTestClassroom(prisma, year.id, 'institute');
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

        subjects = [];
        for (const [name, code] of [['Matemática', 'MAT'], ['Física', 'FIS'], ['Química', 'QUI']] as const) {
            const s = await prisma.subject.create({
                data: {
                    name,
                    code: `${code}-${gId().substring(0, 6)}`,
                    slug: `${code.toLowerCase()}-${gId().substring(0, 10)}`,
                    color: '#3B82F6',
                    instituteId: 'institute',
                },
            });
            await prisma.classroomSubject.create({
                data: { classroomId: classroomA.id, subjectId: s.id },
            });
            subjects.push(s);
        }

        // Una actividad por materia (requisito de Grade.activityId)
        const t = await createTestUserWithPassword(prisma, UserRole.TEACHER, 'TeacherPass123!');
        teacher = { user: t.user, token: '' };
        activityIds = [];
        for (const sub of subjects) {
            const act = await prisma.activity.create({
                data: {
                    title: `Evaluación de ${sub.name}`,
                    type: 'SUMATIVA',
                    scope: 'CLASSROOM',
                    startDate: new Date('2024-01-01'),
                    maxGrade: 20,
                    weight: 1,
                    classroomId: classroomA.id,
                    subjectId: sub.id,
                    periodId: period.id,
                    lapso: '1',
                    createdBy: t.user.id,
                    instituteId: 'institute',
                },
            });
            activityIds.push(act.id);
        }
        const a = await createTestUserWithPassword(prisma, UserRole.ADMIN, 'AdminPass123!');
        admin = { user: a.user, token: '' };

        const tLogin = await login(t.user.email, 'TeacherPass123!').expect(200);
        teacher.token = tLogin.body.tokens.accessToken;
        const aLogin = await login(a.user.email, 'AdminPass123!').expect(200);
        admin.token = aLogin.body.tokens.accessToken;
    });

    /** Crea un estudiante con notas dadas por materia (score 0-20) en el lapso activo. */
    async function createStudentWithScores(name: string, gender: 'MASCULINO' | 'FEMENINO', scores: Array<number | null>, classroom = classroomA): Promise<any> {
        const s = await createTestUserWithPassword(prisma, UserRole.STUDENT, 'StudentPass123!');
        await prisma.studentClassroom.create({
            data: { studentId: s.user.id, classroomId: classroom.id, academicYearId: year.id, isActive: true },
        });
        await prisma.user.update({
            where: { id: s.user.id },
            data: { firstName: name.split(' ')[0], lastName: name.split(' ')[1] || 'T', gender },
        });
        subjects.forEach((sub, i) => {
            const score = scores[i];
            if (typeof score === 'number') {
                // Se agrega en el mismo bloque (fire-and-forget con await más abajo)
                pendingGrades.push({
                    studentId: s.user.id,
                    subjectId: sub.id,
                    activityId: activityIds[i],
                    periodId: period.id,
                    teacherId: teacher.user.id,
                    score,
                });
            }
        });
        return s.user;
    }

    const pendingGrades: Array<{ studentId: string; subjectId: string; activityId: string; periodId: string; teacherId: string; score: number }> = [];

    async function flushGrades() {
        for (const g of pendingGrades.splice(0)) {
            await prisma.grade.create({ data: g });
        }
    }

    it('1. maxPendientes=2: 1 reprobada → "promocionado con pendientes"; 3 reprobadas → "no promocionado"', async () => {
        await createStudentWithScores('Ana R', 'FEMENINO', [15, 15, 5]); // 1 pendiente
        await createStudentWithScores('Luis M', 'MASCULINO', [5, 5, 5]); // 3 pendientes
        await flushGrades();

        const result = await prepareClose(prisma, year.id, 'institute');
        const ana = result.suggestions.find(s => s.name.startsWith('Ana'));
        const luis = result.suggestions.find(s => s.name.startsWith('Luis'));
        expect(ana).toBeDefined();
        expect(luis).toBeDefined();
        expect(ana!.pendingCount).toBe(1);
        expect(ana!.suggestedStatus).toBe('PROMOVIDO_CON_PENDIENTES');
        expect(luis!.pendingCount).toBe(3);
        expect(luis!.suggestedStatus).toBe('NO_PROMOVIDO');
    });

    it('2. Umbral CONFIGURABLE: maxPendientes=0 → 1 sola reprobada sugiere "no promocionado"', async () => {
        await createStudentWithScores('Ana R', 'FEMENINO', [15, 15, 5]);
        await flushGrades();

        await updateAcademicConfig('institute', { maxMateriasPendientesParaPromover: 0 });
        const result = await prepareClose(prisma, year.id, 'institute');
        const ana = result.suggestions.find(s => s.name.startsWith('Ana'));
        expect(ana!.pendingCount).toBe(1);
        expect(ana!.suggestedStatus).toBe('NO_PROMOVIDO');
    });

    it('3. El admin edita la sugerencia → el resultado final respeta su decisión', async () => {
        await createStudentWithScores('Ana R', 'FEMENINO', [15, 15, 5]); // sugerido: con pendientes
        await createStudentWithScores('Luis M', 'MASCULINO', [5, 5, 5]); // sugerido: no promocionado
        await flushGrades();

        const prepared = await prepareClose(prisma, year.id, 'institute');
        const luis = prepared.suggestions.find(s => s.name.startsWith('Luis'));
        const ana = prepared.suggestions.find(s => s.name.startsWith('Ana'));

        const confirmed = await confirmClose(
            prisma,
            {
                academicYearId: year.id,
                decisions: [
                    { studentId: luis!.studentId, finalResult: 'PROMOVIDO_CON_PENDIENTES' }, // el admin lo promueve igual
                    { studentId: ana!.studentId, finalResult: 'PROMOVIDO' },
                ],
                strategyKey: 'manual',
            },
            'institute'
        );

        const recLuis = confirmed.records.find(r => r.studentId === luis!.studentId);
        expect(recLuis!.finalResult).toBe('PROMOVIDO_CON_PENDIENTES');

        const dbRecord = await prisma.academicRecord.findFirst({ where: { studentId: luis!.studentId } });
        expect(dbRecord!.finalResult).toBe('PROMOVIDO_CON_PENDIENTES');
    });

    it('4. Las 4 estrategias de asignación de sección producen sugerencias razonables', async () => {
        const sections = [
            { id: nextSectionA.id, section: 'A' },
            { id: nextSectionB.id, section: 'B' },
        ];
        const students = Array.from({ length: 10 }, (_, i) => ({
            id: `st-${i}`,
            average: 20 - i, // 20, 19, ..., 11 (orden claro)
            gender: (i % 2 === 0 ? 'FEMENINO' : 'MASCULINO') as any,
            currentSection: (i % 2 === 0 ? 'A' : 'B') as any,
            name: `Est ${i}`,
        }));

        // (a) Mantener sección actual
        const keep = getStrategy('keep-current-section').assign(students, sections);
        students.forEach((st, i) => {
            const expected = i % 2 === 0 ? nextSectionA.id : nextSectionB.id;
            expect(keep.find(a => a.studentId === st.id)!.sectionId).toBe(expected);
        });

        // (b) Por rendimiento — orden correcto (top: mejores en la sección A)
        const perf = getStrategy('by-performance').assign(students, sections, { mode: 'top' });
        const sortedDesc = [...students].sort((a, b) => b.average - a.average);
        const topIds = sortedDesc.slice(0, 5).map(s => s.id);
        topIds.forEach(id => {
            expect(perf.find(a => a.studentId === id)!.sectionId).toBe(nextSectionA.id);
        });
        // balanced: reparto parejo de tamaños (serpentina)
        const balanced = getStrategy('by-performance').assign(students, sections, { mode: 'balanced' });
        const countA = balanced.filter(a => a.sectionId === nextSectionA.id).length;
        const countB = balanced.filter(a => a.sectionId === nextSectionB.id).length;
        expect(Math.abs(countA - countB)).toBeLessThanOrEqual(1);
        // el mejor promedio va a la sección A en serpentina
        expect(balanced.find(a => a.studentId === 'st-0')!.sectionId).toBe(nextSectionA.id);

        // (c) Aleatorio balanceado por género
        const byGender = getStrategy('random-balanced-gender').assign(students, sections);
        const gA = new Set(byGender.filter(a => a.sectionId === nextSectionA.id).map(a => students.find(s => s.id === a.studentId)!.gender));
        const gB = new Set(byGender.filter(a => a.sectionId === nextSectionB.id).map(a => students.find(s => s.id === a.studentId)!.gender));
        // cada sección tiene ambos géneros balanceados (5F/5M en total → 2-3 por sección)
        const femA = byGender.filter(a => a.sectionId === nextSectionA.id && students.find(s => s.id === a.studentId)!.gender === 'FEMENINO').length;
        const femB = byGender.filter(a => a.sectionId === nextSectionB.id && students.find(s => s.id === a.studentId)!.gender === 'FEMENINO').length;
        expect(Math.abs(femA - femB)).toBeLessThanOrEqual(1);

        // (d) Manual: nadie asignado
        const manual = getStrategy('manual').assign(students, sections);
        manual.forEach(a => expect(a.sectionId).toBeNull());
    });

    it('5. El admin cambia la sección sugerida manualmente → se respeta en el resultado final', async () => {
        await createStudentWithScores('Ana R', 'FEMENINO', [15, 15, 15]);
        await flushGrades();

        const prepared = await prepareClose(prisma, year.id, 'institute');
        const ana = prepared.suggestions[0];

        const confirmed = await confirmClose(
            prisma,
            {
                academicYearId: year.id,
                decisions: [
                    { studentId: ana.studentId, finalResult: 'PROMOVIDO', assignedClassroomId: nextSectionB.id },
                ],
                strategyKey: 'manual',
            },
            'institute'
        );

        const rec = await prisma.academicRecord.findFirst({ where: { studentId: ana.studentId } });
        expect(rec!.assignedClassroomId).toBe(nextSectionB.id);
    });

    it('6. El dashboard del estudiante compara con el año anterior (AcademicRecord)', async () => {
        const s = await createTestUserWithPassword(prisma, UserRole.STUDENT, 'StudentPass123!');
        await prisma.studentClassroom.create({
            data: { studentId: s.user.id, classroomId: classroomA.id, academicYearId: year.id, isActive: true },
        });

        // Año anterior + registro histórico
        const prevYear = await prisma.academicYear.create({
            data: {
                id: gId(),
                name: `2023-${gId().substring(0, 8)}`,
                startDate: new Date('2023-01-01'),
                endDate: new Date('2023-12-31'),
                isActive: false,
                status: 'COMPLETED',
                instituteId: 'institute',
            },
        });
        await prisma.academicRecord.create({
            data: {
                studentId: s.user.id,
                academicYearId: prevYear.id,
                sectionSnapshot: 'A',
                finalAverage: 14,
                status: 'COMPLETED',
                finalResult: 'PROMOVIDO',
            },
        });

        const res = await request(server.server)
            .get(`/api/students/${s.user.id}/dashboard`)
            .set(auth(admin.token))
            .expect(200);

        expect(res.body.academicHistory.length).toBeGreaterThanOrEqual(1);
        expect(res.body.academicHistory[0].finalGrade).toBe(14);
        expect(res.body.academicHistory[0].yearName).toBe(prevYear.name);
    });

    it('7. Cerrar el mismo ciclo dos veces → rechazado (idempotencia)', async () => {
        await createStudentWithScores('Ana R', 'FEMENINO', [15, 15, 15]);
        await flushGrades();

        const prepared = await prepareClose(prisma, year.id, 'institute');
        await confirmClose(
            prisma,
            {
                academicYearId: year.id,
                decisions: prepared.suggestions.map(s => ({ studentId: s.studentId, finalResult: s.suggestedStatus })),
                strategyKey: 'manual',
            },
            'institute'
        );

        // Segundo cierre del mismo ciclo → error de idempotencia
        await expect(
            confirmClose(
                prisma,
                {
                    academicYearId: year.id,
                    decisions: [],
                    strategyKey: 'manual',
                },
                'institute'
            )
        ).rejects.toMatchObject({ code: 'CLOSE_ALREADY_EXECUTED' });
    });

    it('8. FALLO A MITAD DE LA TRANSACCIÓN → TODO se revierte y el ciclo sigue cerrable', async () => {
        await createStudentWithScores('Ana R', 'FEMENINO', [15, 15, 15]); // primera (record OK)
        await createStudentWithScores('Luis M', 'MASCULINO', [15, 15, 15]); // segunda (fallará su matrícula)
        await flushGrades();

        const prepared = await prepareClose(prisma, year.id, 'institute');
        const ana = prepared.suggestions.find(s => s.name.startsWith('Ana'));
        const luis = prepared.suggestions.find(s => s.name.startsWith('Luis'));

        // Luis recibe una sección INEXISTENTE → la creación de su matrícula lanza
        // error de FK DESPUÉS de que el record de Ana ya se creó dentro de la tx.
        const failing = confirmClose(
            prisma,
            {
                academicYearId: year.id,
                decisions: [
                    { studentId: ana!.studentId, finalResult: 'PROMOVIDO', assignedClassroomId: nextSectionA.id },
                    { studentId: luis!.studentId, finalResult: 'PROMOVIDO', assignedClassroomId: 'classroom-inexistente' },
                ],
                strategyKey: 'manual',
            },
            'institute'
        );
        await expect(failing).rejects.toThrow();

        // TODO revertido: sin records huérfanos, año sigue ACTIVE, sin matrículas destino
        const records = await prisma.academicRecord.count({ where: { academicYearId: year.id } });
        expect(records).toBe(0);
        const yearAfter = await prisma.academicYear.findUnique({ where: { id: year.id }, select: { status: true } });
        expect(yearAfter!.status).toBe('ACTIVE');
        const movedEnrollments = await prisma.studentClassroom.count({
            where: { studentId: { in: [ana!.studentId, luis!.studentId] }, academicYearId: nextYear.id },
        });
        expect(movedEnrollments).toBe(0);

        // Reintento posterior FUNCIONA normal (mismo ciclo, decisiones válidas)
        const retry = await confirmClose(
            prisma,
            {
                academicYearId: year.id,
                decisions: [
                    { studentId: ana!.studentId, finalResult: 'PROMOVIDO', assignedClassroomId: nextSectionA.id },
                    { studentId: luis!.studentId, finalResult: 'PROMOVIDO', assignedClassroomId: nextSectionB.id },
                ],
                strategyKey: 'manual',
            },
            'institute'
        );
        expect(retry.closed).toBe(true);
        expect(await prisma.academicRecord.count({ where: { academicYearId: year.id } })).toBe(2);
    });
    it('9. "Retirar y eliminar" deja al alumno y sus notas en la papelera, no los borra para siempre', async () => {
        await createStudentWithScores('Pedro X', 'MASCULINO', [12, 14, 9]);
        await createStudentWithScores('Ana R', 'FEMENINO', [15, 15, 15]);
        await flushGrades();

        const prepared = await prepareClose(prisma, year.id, 'institute');
        const pedro = prepared.suggestions.find(s => s.name.startsWith('Pedro'))!;
        const ana = prepared.suggestions.find(s => s.name.startsWith('Ana'))!;
        const notasDePedro = await prisma.grade.count({ where: { studentId: pedro.studentId } });
        expect(notasDePedro).toBeGreaterThan(0);

        await confirmClose(
            prisma,
            {
                academicYearId: year.id,
                decisions: [
                    { studentId: pedro.studentId, finalResult: 'NO_PROMOVIDO', action: 'RETIRE_DELETE' } as any,
                    { studentId: ana.studentId, finalResult: 'PROMOVIDO', assignedClassroomId: nextSectionA.id },
                ],
                strategyKey: 'manual',
            },
            'institute',
            { usuarioId: 'admin-del-cierre' }
        );

        expect(await prisma.user.findUnique({ where: { id: pedro.studentId } })).toBeNull();

        const copiaDelAlumno = await prisma.registroBorrado.findFirst({
            where: { tabla: 'user', registroId: pedro.studentId },
        });
        expect(copiaDelAlumno).not.toBeNull();
        expect(copiaDelAlumno!.borradoPor).toBe('admin-del-cierre');

        const copiasDeNotas = await prisma.registroBorrado.count({ where: { tabla: 'grade' } });
        expect(copiasDeNotas).toBeGreaterThanOrEqual(notasDePedro);

        // Y Ana, en el mismo cierre, promovida y matriculada como siempre.
        const matricula = await prisma.studentClassroom.findFirst({
            where: { studentId: ana.studentId, academicYearId: nextYear.id },
        });
        expect(matricula?.classroomId).toBe(nextSectionA.id);
    });
});
