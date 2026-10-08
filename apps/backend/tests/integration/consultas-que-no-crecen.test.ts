process.env.CONTAR_CONSULTAS = '1';

import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { UserRole } from '../../src/utils/prisma-enums';
import { consultasALaBase, invalidateTenantCache } from '../../src/config/database';
import { RedisCache } from '../../src/config/redis';
import { conLiceo } from '../../src/config/ambito-del-liceo';
import { createTestServer, createTestPrismaClient, createTestUser, createTestSubject, generateTestToken } from '../helpers';

/**
 * LAS PANTALLAS NO HACEN UNA CONSULTA POR ALUMNO (N1-01…, 2026-10-05)
 *
 * El «N+1»: una lista que pide sus filas y luego, fila a fila, lo de cada una.
 * Con 3 alumnos no se nota; con 40 por sección y 200 liceos es la base entera
 * trabajando para nada (así eran las 300 consultas para guardar 29 notas).
 *
 * Aquí se pide cada pantalla del día a día con una sección de 3 alumnos y
 * otra vez con 15, y se cuentan las consultas. Lo que crece con los alumnos
 * es un N+1. Se tolera un poco (una tanda más al partir en bloques), nunca una
 * por alumno: 12 alumnos más tendrían que notarse en 12 o más.
 */

const SLUG = 'test-institute';
const LICEO = 'institute';
const gId = () => `c${createId()}`;
const DIA = '2026-10-01';
const TOLERANCIA = 3;

describe('Las pantallas no hacen una consulta por alumno (N1)', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let admin: any;
    let profesor: any;
    let year: any;
    let lapso: any;
    let materia: any;
    let aula: any;

    async function agregarAlumnos(n: number) {
        for (let i = 0; i < n; i++) {
            const est = (await createTestUser(prisma, UserRole.STUDENT)).user;
            await prisma.studentClassroom.create({ data: { studentId: est.id, classroomId: aula.id, academicYearId: year.id, isActive: true } });
            for (let e = 0; e < 2; e++) {
                const act = await prisma.activity.create({
                    data: { id: gId(), title: `E${e}`, type: 'EXAM', scope: 'CLASSROOM', startDate: new Date(DIA), createdBy: profesor.id, classroomId: aula.id, subjectId: materia.id, periodId: lapso.id },
                });
                await prisma.grade.create({
                    data: { id: gId(), studentId: est.id, activityId: act.id, periodId: lapso.id, subjectId: materia.id, teacherId: profesor.id, score: 10 + ((i + e) % 10) },
                });
            }
            await prisma.dailyAttendance.create({ data: { id: gId(), studentId: est.id, classroomId: aula.id, teacherId: profesor.id, date: new Date(DIA), status: 'PRESENT' } as any });
            await prisma.observation.create({ data: { title: 'Llegó tarde', studentId: est.id, createdById: profesor.id, classroomId: aula.id, subjectId: materia.id, date: new Date(DIA), instituteId: LICEO } as any });
        }
    }

    const PANTALLAS: Array<[string, () => any, () => string]> = [
        ['N1-01 lista de alumnos de la sección (admin)', () => admin, () => `/api/students?classroomId=${aula.id}&page=1&limit=100`],
        ['N1-02 la sección (admin)', () => admin, () => `/api/classrooms/${aula.id}`],
        ['N1-03 cifras de la sección (admin)', () => admin, () => `/api/classrooms/${aula.id}/stats`],
        ['N1-04 clase en vivo (profesor)', () => profesor, () => `/api/sessions/live-detail?classroomId=${aula.id}&subjectId=${materia.id}&date=${DIA}`],
        ['N1-05 panel del admin', () => admin, () => '/api/dashboard/admin'],
        ['N1-06 panel del profesor', () => profesor, () => '/api/dashboard/teacher'],
        ['N1-07 actividades de la sección (profesor)', () => profesor, () => `/api/activities/classroom/${aula.id}`],
        ['N1-08 lista de usuarios (admin)', () => admin, () => '/api/users?page=1&limit=100'],
        ['N1-09 lista de alumnos del profesor', () => profesor, () => `/api/students?classroomId=${aula.id}&subjectId=${materia.id}&page=1&limit=100`],
        ['N1-10 observaciones de la sección (admin)', () => admin, () => `/api/observations/classroom/${aula.id}`],
        ['N1-11 estadística de la sección (admin)', () => admin, () => `/api/statistics/section/${aula.id}`],
        ['N1-12 estadística del año (admin)', () => admin, () => `/api/statistics/grade/${year.id}/1`],
        ['N1-13 estadística del ciclo (admin)', () => admin, () => `/api/statistics/cycle/${year.id}`],
        ['N1-14 resumen final de la sección (admin)', () => admin, () => `/api/classrooms/${aula.id}/resumen-final`],
        ['N1-15 consejo de sección (admin)', () => admin, () => `/api/classrooms/${aula.id}/consejos/${lapso.id}`],
        ['N1-16 cuadro de honor (admin)', () => admin, () => '/api/cuadro-de-honor?alcance=ciclo'],
        ['N1-17 cuadro general de la sección guía (profesor)', () => profesor, () => `/api/classrooms/${aula.id}/cuadro-general`],
    ];

    async function contar(quien: any, url: string) {
        await conLiceo(LICEO, () => RedisCache.clearPattern('*'));
        const token = generateTestToken(quien.id, quien.role, LICEO);
        const antes = consultasALaBase();
        const res = await request(server.server).get(url).set('Authorization', `Bearer ${token}`).set('X-Institute-Slug', SLUG);
        return { status: res.status, consultas: consultasALaBase() - antes, cuerpo: res.body };
    }

    const pocos: Record<string, number> = {};
    const muchos: Record<string, number> = {};
    /** Lo que contestó cada pantalla con 15 alumnos (para comparar antes y después de un arreglo). */
    const respuestas: Record<string, unknown> = {};

    beforeAll(async () => {
        server = await createTestServer();
        await invalidateTenantCache(LICEO);
        prisma = await createTestPrismaClient();
        admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        profesor = (await createTestUser(prisma, UserRole.TEACHER)).user;
        year = await prisma.academicYear.create({
            data: { id: gId(), name: `2026-${gId()}`, startDate: new Date('2026-09-01'), endDate: new Date('2027-07-15'), isActive: true, status: 'ACTIVE', instituteId: LICEO },
        });
        lapso = await prisma.period.create({
            data: { id: gId(), name: 'Primer Lapso', academicYearId: year.id, startDate: new Date('2026-09-01'), endDate: new Date('2026-12-15'), isActive: true },
        });
        materia = await createTestSubject(prisma, LICEO);
        aula = await prisma.classroom.create({
            data: { id: gId(), name: '1 A', slug: `n1-${gId()}`, grade: 1, section: 'A', capacity: 40, academicYearId: year.id, instituteId: LICEO, teacherId: profesor.id } as any,
        });
        await prisma.classroomSubject.create({ data: { classroomId: aula.id, subjectId: materia.id, teacherId: profesor.id } });

        await agregarAlumnos(3);
        for (const [nombre, quien, url] of PANTALLAS) {
            await contar(quien(), url()); // la primera calienta lo que se guarda en el proceso
            const r = await contar(quien(), url());
            expect({ nombre, status: r.status }).toEqual({ nombre, status: 200 });
            pocos[nombre] = r.consultas;
        }
        await agregarAlumnos(12);
        for (const [nombre, quien, url] of PANTALLAS) {
            const r = await contar(quien(), url());
            expect({ nombre, status: r.status }).toEqual({ nombre, status: 200 });
            muchos[nombre] = r.consultas;
            respuestas[nombre] = r.cuerpo;
        }
        // Para leer en el registro de la prueba (y en la auditoría).
        console.log(PANTALLAS.map(([n]) => `${n}: ${pocos[n]} → ${muchos[n]}`).join('\n'));
        if (process.env.VOLCAR_N1) {
            // Sin los ids (cambian en cada tanda): solo los números.
            const sinIds = JSON.stringify(respuestas, (k, v) => (/(^id$|Id$|^ids$|At$|^date$|name$|Name$|slug|email|code)/i.test(k) ? undefined : v), 2);
            require('fs').writeFileSync(process.env.VOLCAR_N1, sinIds);
        }
    }, 600000);

    afterAll(async () => {
        await prisma?.$disconnect();
        await server?.close();
    }, 120000);

    it.each(PANTALLAS.map(([n]) => n))('%s: de 3 a 15 alumnos, las consultas no crecen por alumno', (nombre) => {
        expect(muchos[nombre] - pocos[nombre]).toBeLessThanOrEqual(TOLERANCIA);
    });
});
