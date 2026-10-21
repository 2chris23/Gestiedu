import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { UserRole } from '../../src/utils/prisma-enums';
import {
    createTestServer,
    createTestPrismaClient,
    createTestUser,
    createTestSubject,
    generateTestToken,
} from '../helpers';

/**
 * LA MISMA CIFRA EN TODAS PARTES (Cristian, 19-oct-2026; CLAUDE.md 0-bis, puerta 1)
 *
 * «Nada de que un usuario tenga un promedio y en otra parte otro.» El barrido
 * sobre el liceo de pruebas (`scripts/barrido-de-cifras.ts`) encontró 246
 * diferencias con 40 alumnos: cada pantalla tenía su cuenta. Ahora todas salen
 * de `cifras-oficiales.service` (la cuenta de la boleta). Las notas de aquí
 * caen justo donde las cuentas viejas se separaban: lapsos con decimales
 * (14,25 → 14 en la boleta, 14,3 en la ficha) y un 9,5 que el redondeo del
 * MPPE sube a 10.
 *
 *   CIFRAS-01 el alumno: boleta = ficha del admin = su Inicio = el Inicio de su
 *             representante = la lista de su sección, el general y cada materia
 *   CIFRAS-02 la sección: su resumen es la media, el mínimo y el máximo de las
 *             boletas de sus alumnos; el año, la media de sus secciones
 *   CIFRAS-03 el profesor: su Inicio y su fila en Profesores dan lo mismo
 */

const SLUG = 'test-institute';
const gId = () => `c${createId()}`;

describe('La misma cifra en todas partes', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let admin: any;
    let profesor: any;
    let tutor: any;
    let year: any;
    let aula: any;
    const alumnos: any[] = [];
    const materias: any[] = [];

    const cab = (id: string, rol: UserRole) => ({
        Authorization: `Bearer ${generateTestToken(id, rol, 'institute')}`,
        'X-Institute-Slug': SLUG,
    });
    const pedir = async (url: string, id = admin.id, rol = UserRole.ADMIN) => {
        const r = await request(server.server).get(url).set(cab(id, rol));
        expect(r.status).toBe(200);
        return r.body;
    };

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
        admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        profesor = (await createTestUser(prisma, UserRole.TEACHER)).user;
        tutor = (await createTestUser(prisma, UserRole.TUTOR)).user;
        year = await prisma.academicYear.create({
            data: { id: gId(), name: `2026-${gId()}`, startDate: new Date('2026-09-01'), endDate: new Date('2027-07-15'), isActive: true, status: 'ACTIVE', instituteId: 'institute' },
        });
        const lapsos = [];
        for (const [i, nombre] of ['Primer Lapso', 'Segundo Lapso'].entries()) {
            lapsos.push(await prisma.period.create({
                data: { id: gId(), name: nombre, academicYearId: year.id, startDate: new Date(2026, 8 + i * 4, 1), endDate: new Date(2026, 11 + i * 4, 1), isActive: i === 0 },
            }));
        }
        aula = await prisma.classroom.create({
            data: { id: gId(), name: '1 A', slug: `cifras-${gId()}`, grade: 1, section: 'A', capacity: 30, academicYearId: year.id, instituteId: 'institute' },
        });
        for (let m = 0; m < 2; m++) {
            const materia = await createTestSubject(prisma, 'institute');
            materias.push(materia);
            await prisma.classroomSubject.create({ data: { classroomId: aula.id, subjectId: materia.id, teacherId: profesor.id } });
        }
        // [alumno][materia][lapso] → sus dos notas: medias con decimales que el
        // redondeo del liceo mueve (14,25; 9,5; 12,75…).
        const notas = [
            [[[14, 14.5], [13, 13.5]], [[9, 10], [11, 12.5]]],
            [[[18.5, 19], [17, 16]], [[12, 13.5], [15.5, 16]]],
            [[[7, 8], [9.5, 9.5]], [[10, 11], [8.5, 9]]],
        ];
        for (let a = 0; a < notas.length; a++) {
            const est = (await createTestUser(prisma, UserRole.STUDENT)).user;
            alumnos.push(est);
            await prisma.studentClassroom.create({ data: { studentId: est.id, classroomId: aula.id, academicYearId: year.id, isActive: true } });
            for (let m = 0; m < materias.length; m++) {
                for (let l = 0; l < lapsos.length; l++) {
                    for (const score of notas[a][m][l]) {
                        const act = await prisma.activity.create({
                            data: { id: gId(), title: 'E', type: 'EXAM', scope: 'CLASSROOM', startDate: new Date(), createdBy: profesor.id, classroomId: aula.id, subjectId: materias[m].id, periodId: lapsos[l].id, lapso: String(l + 1) },
                        });
                        await prisma.grade.create({
                            data: { id: gId(), studentId: est.id, activityId: act.id, periodId: lapsos[l].id, subjectId: materias[m].id, teacherId: profesor.id, score },
                        });
                    }
                }
            }
        }
        await prisma.studentTutor.create({ data: { studentId: alumnos[0].id, tutorId: tutor.id, relationship: 'Madre' } });
    }, 240000);

    afterAll(async () => {
        await prisma.$disconnect();
        await server.close();
    }, 120000);

    it('CIFRAS-01: el alumno ve la misma cifra en su boleta, su ficha, su Inicio, el de su representante y la lista', async () => {
        const lista = (await pedir(`/api/students?classroomId=${aula.id}&page=1&limit=50`)).students;
        for (const est of alumnos) {
            const boleta = (await pedir(`/api/students/${est.id}/boleta`)).data;
            const ficha = await pedir(`/api/students/${est.id}/dashboard`);
            const inicio = (await pedir('/api/students/my-dashboard', est.id, UserRole.STUDENT)).data;
            const fila = lista.find((s: any) => s.id === est.id);

            expect(boleta.promedios.definitivo).not.toBeNull();
            expect(ficha.kpis.globalAverage).toBe(boleta.promedios.definitivo);
            expect(inicio.kpis.globalAverage).toBe(boleta.promedios.definitivo);
            expect(fila.average).toBe(boleta.promedios.definitivo);
            for (const m of boleta.materias) {
                expect(ficha.subjects.find((s: any) => s.id === m.id).average).toBe(m.definitiva);
                expect(inicio.subjects.find((s: any) => s.id === m.id).average).toBe(m.definitiva);
                const conMateria = (await pedir(`/api/students?classroomId=${aula.id}&subjectId=${m.id}&page=1&limit=50`)).students;
                expect(conMateria.find((s: any) => s.id === est.id).average).toBe(m.definitiva);
            }
        }
        const delTutor = (await pedir('/api/dashboard/tutor', tutor.id, UserRole.TUTOR)).data;
        const boleta0 = (await pedir(`/api/students/${alumnos[0].id}/boleta`)).data;
        expect(delTutor.children.find((c: any) => c.id === alumnos[0].id).average).toBe(boleta0.promedios.definitivo);
    }, 120000);

    it('CIFRAS-02: la sección y el año cuadran con las boletas de sus alumnos', async () => {
        const deLasBoletas: number[] = [];
        for (const est of alumnos) deLasBoletas.push((await pedir(`/api/students/${est.id}/boleta`)).data.promedios.definitivo);
        const resumen = await pedir(`/api/classrooms/${aula.id}/stats`);
        const media = Math.round((deLasBoletas.reduce((a, b) => a + b, 0) / deLasBoletas.length) * 100) / 100;
        expect(resumen.average).toBe(media);
        expect(resumen.minAverage).toBe(Math.min(...deLasBoletas));
        expect(resumen.maxAverage).toBe(Math.max(...deLasBoletas));
        const delAno = await pedir(`/api/academic-years/${year.id}/stats`);
        expect(delAno.find((g: any) => g.grade === 1).stats.average).toBe(media);
    }, 120000);

    it('CIFRAS-03: el Inicio del profesor y su fila en Profesores dan el mismo promedio', async () => {
        const inicio = (await pedir('/api/dashboard/teacher', profesor.id, UserRole.TEACHER)).data;
        const filas = (await pedir('/api/profesores')).data.profesores;
        const fila = filas.find((p: any) => p.id === profesor.id);
        expect(inicio.stats.promedioGeneral).not.toBeNull();
        expect(inicio.stats.promedioGeneral).toBe(fila.promedio);
    }, 120000);
});
