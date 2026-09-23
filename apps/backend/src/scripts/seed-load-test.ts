/**
 * SEED MASIVO DE LOAD TESTING - INSTITUTO 5K
 * ==========================================
 * Crea un instituto completo con 15,250 usuarios para load testing realista:
 *
 *   - 5,000 Estudiantes
 *   - 10,000 Tutores (2 por estudiante)
 *   - 200  Profesores
 *   - 50   Admins
 *
 * Datos históricos:
 *   - 100 Aulas (10 grados × 10 secciones, 50 estudiantes c/u)
 *   - 12 materias base
 *   - 3 lapsos (períodos)
 *   - 48,000 Actividades
 *   - 2,400,000 Calificaciones   (5000 × 12 × 3 × activ por lapso)
 *   - 600,000 Asistencias diarias
 *
 * USO:
 *   npx tsx apps/backend/src/scripts/seed-load-test.ts           ← seed completo
 *   npx tsx apps/backend/src/scripts/seed-load-test.ts --clean   ← limpia todo
 *   npx tsx apps/backend/src/scripts/seed-load-test.ts --users   ← solo usuarios
 *
 * ⏱️ Tiempo estimado: 8-15 minutos
 */

import { PrismaClient as PlatformPrismaClient } from '../generated/platform-client';
import { PrismaClient, AttendanceStatus } from '@prisma/client';
import { hash } from 'bcrypt';
import { Client } from 'pg';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

// ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────

/**
 * Todo se puede cambiar por variables, para sembrar liceos más pequeños (lo
 * usa `seed-muchos-liceos.ts` para su plantilla). Sin variables, es el liceo
 * de carga de siempre: `test-load-5k`, 15.250 personas.
 */
const INSTITUTE_SLUG = process.env.SEMILLA_LICEO || 'test-load-5k';
const INSTITUTE_CODE = process.env.SEMILLA_CODIGO || 'LOAD-5K-001';
const INSTITUTE_NAME = process.env.SEMILLA_NOMBRE || 'Instituto Load Testing 5K';
const BASE_PASSWORD = 'Test123!';
const BATCH_SIZE = 500;

const numero = (variable: string, defecto: number) => {
    const n = Number(process.env[variable]);
    return Number.isFinite(n) && n > 0 ? n : defecto;
};

const CONFIG = {
    grades: Math.min(10, numero('SEMILLA_GRADOS', 10)),
    sectionsPerGrade: Math.min(10, numero('SEMILLA_SECCIONES', 10)),
    studentsPerClassroom: numero('SEMILLA_ALUMNOS_POR_SECCION', 50),
    tutorsPerStudent: numero('SEMILLA_TUTORES_POR_ALUMNO', 2),
    teachers: numero('SEMILLA_PROFESORES', 200),
    admins: numero('SEMILLA_ADMINS', 50),
    subjects: 12,
    lapsos: 3,
    activitiesPerSubjectPerLapso: numero('SEMILLA_ACTIVIDADES', 10),
    schoolDays: numero('SEMILLA_DIAS', 120),
};

// 10 grados × 10 secciones = 100 aulas × 50 alumnos = 5,000 estudiantes
const TOTAL_CLASSROOMS = CONFIG.grades * CONFIG.sectionsPerGrade;
const TOTAL_STUDENTS = TOTAL_CLASSROOMS * CONFIG.studentsPerClassroom;
const TOTAL_TUTORS = TOTAL_STUDENTS * CONFIG.tutorsPerStudent;

// ─── PRISMA ───────────────────────────────────────────────────────────────────

const platformPrisma = new PlatformPrismaClient({
    datasourceUrl:
        process.env.PLATFORM_DATABASE_URL ||
        'postgresql://postgres:postgres@localhost:5432/gestion_escolar_platform',
});

function buildTenantUrl(databaseName: string): string {
    return (
        (process.env.DATABASE_URL_TEMPLATE || '').replace('{dbName}', databaseName) ||
        `postgresql://postgres:postgres@localhost:5432/${databaseName}`
    );
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function pad(n: number, len = 5) {
    return String(n).padStart(len, '0');
}

function progress(msg: string) {
    process.stdout.write(`\r${msg}                    `);
}

function progressLine(msg: string) {
    process.stdout.write(`\r${msg}\n`);
}

// Distribuir escuelas en secciones
const GRADES = ['1ero', '2do', '3ro', '4to', '5to', '6to', '7mo', '8vo', '9no', '10mo'];
const SECTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

const SUBJECT_NAMES = [
    'Matemáticas',
    'Lengua y Literatura',
    'Ciencias Naturales',
    'Historia y Geografía',
    'Inglés',
    'Educación Física',
    'Arte y Cultura',
    'Computación',
    'Biología',
    'Química',
    'Física',
    'Orientación',
];

// ─── FASE 1: PROVISIONING ─────────────────────────────────────────────────────

const execAsync = promisify(exec);

// Extrae credenciales de la URL de PostgreSQL
function parseDbUrl(url: string) {
    const m = url.match(/postgresql:\/\/([^:]+):([^@]+)@([^:/]+):(\d+)\//);
    if (!m) throw new Error(`URL PostgreSQL inválida: ${url}`);
    return { user: m[1], password: m[2], host: m[3], port: parseInt(m[4]) };
}

function buildTenantDbUrl(dbName: string): string {
    const base = process.env.PLATFORM_DATABASE_URL ||
        'postgresql://postgres:postgres@localhost:5432/gestion_escolar_platform';
    const { user, password, host, port } = parseDbUrl(base);
    return `postgresql://${user}:${password}@${host}:${port}/${dbName}`;
}

async function provisionInstitute(): Promise<{ databaseName: string; adminId: string }> {
    const DB_NAME = `tenant_${INSTITUTE_SLUG.replace(/-/g, '_')}`;
    const ADMIN_CI = 'V-A000001';

    // ── 1. Verificar si ya existe en platform ────
    let institute = await platformPrisma.institute.findFirst({
        where: { slug: INSTITUTE_SLUG },
    });

    if (institute?.databaseName) {
        progressLine(`ℹ️  Instituto ya existe (DB: ${institute.databaseName})`);
        return { databaseName: institute.databaseName, adminId: ADMIN_CI };
    }

    progressLine('📝 Creando instituto de prueba...');

    // ── 2. Crear en platform ────
    if (!institute) {
        institute = await platformPrisma.institute.create({
            data: {
                name: INSTITUTE_NAME,
                code: INSTITUTE_CODE,
                slug: INSTITUTE_SLUG,
                subdomain: INSTITUTE_SLUG,
                email: `test@${INSTITUTE_SLUG}.com`,
                status: 'PROVISIONING',
                environment: 'development',
                // ENTERPRISE a propósito: este liceo tiene 5.000 alumnos y las
                // pruebas de carga además crean más. Con el plan BASIC (tope
                // 2.000) el sistema rechaza cada alta con 403 — correctamente— y
                // la prueba mide rechazos en vez de trabajo.
                plan: 'ENTERPRISE',
            },
        });
    }

    // ── 3. Crear base de datos del tenant ────
    progressLine('🗄️  Creando base de datos tenant...');
    const creds = parseDbUrl(
        process.env.PLATFORM_DATABASE_URL ||
        'postgresql://postgres:postgres@localhost:5432/gestion_escolar_platform'
    );

    const pgClient = new Client({
        user: creds.user,
        password: creds.password,
        host: creds.host,
        port: creds.port,
        database: 'postgres',
    });
    await pgClient.connect();

    const dbCheck = await pgClient.query(
        `SELECT 1 FROM pg_database WHERE datname = $1`, [DB_NAME]
    );
    if (dbCheck.rows.length === 0) {
        await pgClient.query(`CREATE DATABASE "${DB_NAME}"`);
        progressLine(`✅ Base de datos creada: ${DB_NAME}`);
    } else {
        progressLine(`ℹ️  Base de datos ya existe: ${DB_NAME}`);
    }
    await pgClient.end();

    // ── 4. Aplicar schema con prisma db push ────
    progressLine('📋 Aplicando migraciones al liceo de carga...');
    const schemaPath = path.join(
        path.dirname(path.dirname(path.dirname(__dirname))),
        'backend', 'src', 'prisma', 'schema.prisma'
    );
    const tenantUrl = buildTenantDbUrl(DB_NAME);

    try {
        const { stdout, stderr } = await execAsync(
            `npx prisma migrate deploy --schema="${schemaPath}"`,
            {
                cwd: path.join(path.dirname(path.dirname(path.dirname(path.dirname(__dirname)))), 'apps', 'backend'),
                env: { ...process.env, DATABASE_URL: tenantUrl },
            }
        );
        if (stderr && !stderr.includes('warning') && !stderr.includes('Your database is now in sync')) {
            progressLine(`⚠️  db push warnings: ${stderr.slice(0, 200)}`);
        }
        progressLine('✅ Schema aplicado correctamente');
    } catch (err: any) {
        throw new Error(`migrate deploy falló: ${err.message?.slice(0, 300)}`);
    }

    // ── 5. Crear admin inicial ────
    progressLine('👤 Creando usuario admin inicial...');
    const tenantPrisma = new PrismaClient({ datasourceUrl: tenantUrl });

    /**
     * La fila del instituto TAMBIÉN va dentro de su propia base.
     *
     * Sin esto, todo lo que lleva `instituteId` —las observaciones, por ejemplo—
     * falla con "Foreign key constraint violated" y el liceo parece roto. Costó
     * una tanda entera de pruebas de carga: las escrituras daban error y el
     * tiempo medido era el que tardaba en fallar, no en guardar.
     *
     * El aprovisionamiento de verdad ya lo hace
     * (`services/tenant-provisioning.service.ts`); esta siembra se había quedado
     * atrás.
     */
    await tenantPrisma.institute.upsert({
        where: { id: institute.id },
        update: {},
        create: {
            id: institute.id,
            name: institute.name,
            code: institute.code,
            email: institute.email,
            slug: institute.slug,
            subdomain: institute.subdomain ?? institute.slug,
            status: 'ACTIVE',
            plan: 'BASIC',
        } as any,
    });
    const hashedPw = await hash(BASE_PASSWORD, 12);
    try {
        await tenantPrisma.user.upsert({
            where: { id: ADMIN_CI },
            create: {
                id: ADMIN_CI,
                email: 'admin1@testload.com',
                password: hashedPw,
                firstName: 'Admin',
                lastName: 'Principal',
                role: 'ADMIN',
                isActive: true,
            },
            update: {},
        });
    } finally {
        await tenantPrisma.$disconnect();
    }

    // ── 6. Actualizar instituto en platform ────
    // La fila del liceo tiene que llevar TODAS las credenciales: con solo el
    // nombre de la base, la aplicación no sabe a qué servidor conectarse y cada
    // login responde "Error al conectar con la base de datos del instituto".
    await platformPrisma.institute.update({
        where: { id: institute.id },
        data: {
            status: 'ACTIVE',
            databaseName: DB_NAME,
            databaseHost: creds.host,
            databasePort: creds.port,
            databaseUser: creds.user,
            databasePassword: creds.password,
        },
    });

    progressLine(`✅ Instituto provisionado → DB: ${DB_NAME}`);
    return { databaseName: DB_NAME, adminId: ADMIN_CI };
}

// ─── FASE 2: ESTRUCTURA ACADÉMICA ─────────────────────────────────────────────

async function seedAcademicStructure(prisma: PrismaClient) {
    progressLine('\n📚 Creando estructura académica...');

    // AcademicYear
    const year = await prisma.academicYear.create({
        data: {
            name: '2024-2025',
            startDate: new Date('2024-09-15'),
            endDate: new Date('2025-06-30'),
            isActive: true,
            status: 'ACTIVE',
        },
    });

    // 3 lapsos
    const lapsos = await Promise.all([
        prisma.period.create({
            data: {
                name: 'Lapso 1',
                startDate: new Date('2024-09-15'),
                endDate: new Date('2024-12-13'),
                isActive: false,
                academicYearId: year.id,
            },
        }),
        prisma.period.create({
            data: {
                name: 'Lapso 2',
                startDate: new Date('2025-01-13'),
                endDate: new Date('2025-03-28'),
                isActive: false,
                academicYearId: year.id,
            },
        }),
        prisma.period.create({
            data: {
                name: 'Lapso 3',
                startDate: new Date('2025-04-07'),
                endDate: new Date('2025-06-27'),
                isActive: true,
                academicYearId: year.id,
            },
        }),
    ]);

    progressLine(`  ✅ Año académico + 3 lapsos`);

    // 12 materias globales
    const subjects = await Promise.all(
        SUBJECT_NAMES.map((name, i) =>
            prisma.subject.upsert({
                where: { slug: `${name.toLowerCase().replace(/[^a-z0-9]/gi, '-')}-5k` },
                create: {
                    name: `${name} (5K)`,
                    slug: `${name.toLowerCase().replace(/[^a-z0-9]/gi, '-')}-5k`,
                    code: `MAT5K-${pad(i + 1, 3)}`,
                    color: `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`,
                },
                update: {},
            })
        )
    );

    progressLine(`  ✅ ${subjects.length} materias base`);

    return { year, lapsos, subjects };
}

// ─── FASE 3: TEACHERS ─────────────────────────────────────────────────────────

async function seedTeachers(
    prisma: PrismaClient,
    hashedPassword: string,
    csvRows: string[]
): Promise<string[]> {
    progressLine('\n👨‍🏫 Creando 200 profesores...');

    const teacherIds: string[] = [];

    for (let batch = 0; batch < CONFIG.teachers; batch += BATCH_SIZE) {
        const size = Math.min(BATCH_SIZE, CONFIG.teachers - batch);
        const data = Array.from({ length: size }, (_, i) => {
            const n = batch + i + 1;
            const id = `V-T${pad(n)}`;
            csvRows.push(`TEACHER,teacher${n}@testload.com,${BASE_PASSWORD},Teacher Test${n},${id}`);
            teacherIds.push(id);
            return {
                id,
                email: `teacher${n}@testload.com`,
                password: hashedPassword,
                firstName: `Teacher${n}`,
                lastName: `Test${n}`,
                role: 'TEACHER' as const,
                isActive: true,
                specialization: SUBJECT_NAMES[n % SUBJECT_NAMES.length],
            };
        });

        await prisma.user.createMany({ data, skipDuplicates: true });
        progress(`  Profesores: ${Math.min(batch + BATCH_SIZE, CONFIG.teachers)}/${CONFIG.teachers}`);
    }
    progressLine(`  ✅ ${CONFIG.teachers} profesores`);
    return teacherIds;
}

// ─── FASE 4: ADMINS ───────────────────────────────────────────────────────────

async function seedAdmins(
    prisma: PrismaClient,
    hashedPassword: string,
    csvRows: string[]
): Promise<string[]> {
    progressLine('\n🔑 Creando 50 admins...');
    const adminIds: string[] = [];

    // admin1 ya existe (provisionado), crear del 2 al 50
    const data = Array.from({ length: CONFIG.admins - 1 }, (_, i) => {
        const n = i + 2;
        const id = `V-A${pad(n)}`;
        csvRows.push(`ADMIN,admin${n}@testload.com,${BASE_PASSWORD},Admin Test${n},${id}`);
        adminIds.push(id);
        return {
            id,
            email: `admin${n}@testload.com`,
            password: hashedPassword,
            firstName: `Admin${n}`,
            lastName: `Test${n}`,
            role: 'ADMIN' as const,
            isActive: true,
        };
    });

    await prisma.user.createMany({ data, skipDuplicates: true });
    progressLine(`  ✅ ${CONFIG.admins} admins (incluye admin1 provisionado)`);
    return adminIds;
}

// ─── FASE 5: CLASSROOMS ───────────────────────────────────────────────────────

async function seedClassrooms(
    prisma: PrismaClient,
    teacherIds: string[],
    yearId: string,
    subjects: Array<{ id: string }>
): Promise<Array<{ id: string; gradeNum: number; section: string; subjectIds: string[] }>> {
    progressLine('\n🏫 Creando 100 aulas...');

    const classrooms: Array<{ id: string; gradeNum: number; section: string; subjectIds: string[] }> = [];
    let teacherIdx = 0;

    for (let g = 0; g < CONFIG.grades; g++) {
        for (let s = 0; s < CONFIG.sectionsPerGrade; s++) {
            const gradeNum = g + 1;  // 1-10
            const gradeName = GRADES[g]; // '1ero', '2do', etc. (solo para el nombre)
            const section = SECTIONS[s];
            const mainTeacherId = teacherIds[teacherIdx % teacherIds.length];
            teacherIdx++;

            const slug = `grado-${gradeNum}-${section.toLowerCase()}-5k-${g * 10 + s}`;

            const classroom = await prisma.classroom.create({
                data: {
                    name: `${gradeName} "${section}"`,
                    slug,
                    grade: gradeNum,
                    section,
                    capacity: 50,
                    academicYearId: yearId,
                    teacherId: mainTeacherId,
                },
            });

            // Asignar profesor principal al aula
            await prisma.teacherClassroom.create({
                data: {
                    teacherId: mainTeacherId,
                    classroomId: classroom.id,
                    isMainTeacher: true,
                },
            });

            // Asignar 12 materias al aula
            const subjectIds = subjects.map((sub) => sub.id);
            await prisma.classroomSubject.createMany({
                data: subjectIds.map((subjectId, si) => ({
                    classroomId: classroom.id,
                    subjectId,
                    teacherId: teacherIds[(teacherIdx + si) % teacherIds.length],
                    weeklyBlocks: si < 2 ? 6 : 4,
                })),
                skipDuplicates: true,
            });

            classrooms.push({ id: classroom.id, gradeNum, section, subjectIds });
            progress(
                `  Aulas: ${classrooms.length}/${TOTAL_CLASSROOMS} (${gradeName} "${section}")`
            );
        }
    }

    progressLine(`  ✅ ${classrooms.length} aulas con 12 materias c/u`);
    return classrooms;
}

// ─── FASE 6: STUDENTS ─────────────────────────────────────────────────────────

async function seedStudents(
    prisma: PrismaClient,
    hashedPassword: string,
    classrooms: Array<{ id: string; gradeNum: number; section: string; subjectIds: string[] }>,
    yearId: string,
    subjectIds: string[],
    csvRows: string[]
): Promise<string[]> {
    progressLine('\n👨‍🎓 Creando 5,000 estudiantes...');
    const studentIds: string[] = [];

    for (let ci = 0; ci < classrooms.length; ci++) {
        const classroom = classrooms[ci];
        const batchData = Array.from({ length: CONFIG.studentsPerClassroom }, (_, i) => {
            const n = ci * CONFIG.studentsPerClassroom + i + 1;
            const id = `V-S${pad(n, 6)}`;
            studentIds.push(id);
            csvRows.push(`STUDENT,student${n}@testload.com,${BASE_PASSWORD},Student${n} Test${n},${id}`);
            return {
                id,
                email: `student${n}@testload.com`,
                password: hashedPassword,
                firstName: `Student${n}`,
                lastName: `Test${n}`,
                role: 'STUDENT' as const,
                isActive: true,
                // El alumno pertenece a la sección por su inscripción
                // (StudentClassroom), no por un campo suyo: ese campo ya no existe
                // y este seed llevaba tiempo sin poder correr.
            };
        });

        await prisma.user.createMany({ data: batchData, skipDuplicates: true });

        // Enroll en aula
        await prisma.studentClassroom.createMany({
            data: batchData.map((u) => ({
                studentId: u.id,
                classroomId: classroom.id,
                academicYearId: yearId,
                isActive: true,
            })),
            skipDuplicates: true,
        });

        if ((ci + 1) % 10 === 0 || ci === classrooms.length - 1) {
            progressLine(
                `  Estudiantes: ${Math.min((ci + 1) * CONFIG.studentsPerClassroom, TOTAL_STUDENTS)}/${TOTAL_STUDENTS}`
            );
        }
    }

    progressLine(`  ✅ ${studentIds.length} estudiantes`);
    return studentIds;
}

// ─── FASE 7: TUTORES ──────────────────────────────────────────────────────────

async function seedTutors(
    prisma: PrismaClient,
    hashedPassword: string,
    studentIds: string[],
    csvRows: string[]
): Promise<void> {
    progressLine('\n👪 Creando 10,000 tutores...');

    let created = 0;

    for (let batch = 0; batch < TOTAL_TUTORS; batch += BATCH_SIZE) {
        const size = Math.min(BATCH_SIZE, TOTAL_TUTORS - batch);

        const tutorData = Array.from({ length: size }, (_, i) => {
            const n = batch + i + 1;
            const id = `V-TU${pad(n, 6)}`;
            csvRows.push(`TUTOR,tutor${n}@testload.com,${BASE_PASSWORD},Tutor${n} Test${n},${id}`);
            return {
                id,
                email: `tutor${n}@testload.com`,
                password: hashedPassword,
                firstName: `Tutor${n}`,
                lastName: `Test${n}`,
                role: 'TUTOR' as const,
                isActive: true,
            };
        });

        await prisma.user.createMany({ data: tutorData, skipDuplicates: true });

        // Vincular cada tutor con su estudiante
        // tutor 1 y 2 → student 1, tutor 3 y 4 → student 2, etc.
        const relations = tutorData.map((tutor, i) => {
            const absIdx = batch + i;
            const studentIdx = Math.floor(absIdx / CONFIG.tutorsPerStudent) % studentIds.length;
            return {
                tutorId: tutor.id,
                studentId: studentIds[studentIdx],
                relationship: absIdx % 2 === 0 ? 'PADRE' : 'MADRE',
            };
        });

        await prisma.studentTutor.createMany({ data: relations, skipDuplicates: true });

        created += size;
        if (created % 2000 === 0 || created === TOTAL_TUTORS) {
            progress(`  Tutores: ${created}/${TOTAL_TUTORS}`);
        }
    }

    progressLine(`  ✅ ${TOTAL_TUTORS} tutores vinculados`);
}

// ─── FASE 8: ACTIVIDADES ──────────────────────────────────────────────────────

async function seedActivities(
    prisma: PrismaClient,
    classrooms: Array<{ id: string; subjectIds: string[] }>,
    lapsoIds: string[],
    teacherIds: string[]
): Promise<Map<string, string[]>> {
    // activityMap[classroomId+lapsoId+subjectId] = activityId[]
    progressLine('\n📋 Creando actividades (48,000)...');

    const activityMap = new Map<string, string[]>();
    let total = 0;

    const TEACHER_ADMIN_ID = 'V-A000001'; // El admin-teacher que existe en el tenant

    for (const classroom of classrooms) {
        for (let li = 0; li < lapsoIds.length; li++) {
            const lapsoId = lapsoIds[li];
            const lapsoStart = new Date(2024, 8 + li * 3, 15); // Sep, Dic, Mar

            const actBatch: Array<{
                title: string;
                type: string;
                scope: string;
                startDate: Date;
                dueDate: Date;
                periodId: string;
                subjectId: string;
                classroomId: string;
                createdBy: string;
                maxGrade: number;
                weight: number;
                isActive: boolean;
                isVisible: boolean;
            }> = [];

            for (const subjectId of classroom.subjectIds) {
                const key = `${classroom.id}:${lapsoId}:${subjectId}`;

                for (let a = 0; a < CONFIG.activitiesPerSubjectPerLapso; a++) {
                    const dueDate = new Date(lapsoStart);
                    dueDate.setDate(dueDate.getDate() + a * 7 + 7);

                    actBatch.push({
                        title: `Actividad ${a + 1} L${li + 1}`,
                        type: a % 2 === 0 ? 'EXAM' : 'TASK',
                        scope: 'CLASSROOM',
                        startDate: lapsoStart,
                        dueDate,
                        periodId: lapsoId,
                        subjectId,
                        classroomId: classroom.id,
                        createdBy: teacherIds[0], // primer teacher disponible
                        maxGrade: 20,
                        weight: 1,
                        isActive: false,
                        isVisible: true,
                    });
                }

                if (!activityMap.has(key)) activityMap.set(key, []);
            }

            if (actBatch.length > 0) {
                // Insertar y recuperar IDs (createMany no devuelve IDs en Prisma)
                // Insertamos de a 50 y luego los buscamos
                const insertedActivities = await prisma.$transaction(
                    actBatch.map((a) => prisma.activity.create({ data: a, select: { id: true, subjectId: true, periodId: true } }))
                );

                for (const act of insertedActivities) {
                    const key = `${classroom.id}:${act.periodId}:${act.subjectId}`;
                    const arr = activityMap.get(key) || [];
                    arr.push(act.id);
                    activityMap.set(key, arr);
                }

                total += actBatch.length;
            }
        }

        if (total % 4800 === 0 || total >= 48000) {
            progress(`  Actividades: ${total}/48,000`);
        }
    }

    progressLine(`  ✅ ${total} actividades`);
    return activityMap;
}

// ─── FASE 9: CALIFICACIONES ───────────────────────────────────────────────────

async function seedGrades(
    prisma: PrismaClient,
    classrooms: Array<{ id: string; subjectIds: string[] }>,
    lapsoIds: string[],
    teacherIds: string[],
    activityMap: Map<string, string[]>,
    studentsPerClassroom: Array<string[]>
): Promise<void> {
    progressLine('\n📊 Creando calificaciones (2,400,000)...');

    let total = 0;
    const GRADE_BATCH = 500;

    for (let ci = 0; ci < classrooms.length; ci++) {
        const classroom = classrooms[ci];
        const students = studentsPerClassroom[ci];
        const teacherId = teacherIds[ci % teacherIds.length];

        for (const subjectId of classroom.subjectIds) {
            for (let li = 0; li < lapsoIds.length; li++) {
                const lapsoId = lapsoIds[li];
                const key = `${classroom.id}:${lapsoId}:${subjectId}`;
                const actIds = activityMap.get(key) || [];

                if (actIds.length === 0) continue;

                // Crear notas en batches
                let gradeBuf: Array<{
                    studentId: string;
                    activityId: string;
                    periodId: string;
                    subjectId: string;
                    teacherId: string;
                    score: number;
                }> = [];

                for (const studentId of students) {
                    for (const activityId of actIds) {
                        gradeBuf.push({
                            studentId,
                            activityId,
                            periodId: lapsoId,
                            subjectId,
                            teacherId,
                            score: Math.round((Math.random() * 20) * 100) / 100,
                        });

                        if (gradeBuf.length >= GRADE_BATCH) {
                            await prisma.grade.createMany({ data: gradeBuf, skipDuplicates: true });
                            total += gradeBuf.length;
                            gradeBuf = [];
                        }
                    }
                }

                if (gradeBuf.length > 0) {
                    await prisma.grade.createMany({ data: gradeBuf, skipDuplicates: true });
                    total += gradeBuf.length;
                    gradeBuf = [];
                }
            }
        }

        if ((ci + 1) % 10 === 0) {
            progressLine(`  Calificaciones: ~${total.toLocaleString()}/2,400,000 (aula ${ci + 1}/100)`);
        }
    }

    progressLine(`  ✅ ~${total.toLocaleString()} calificaciones`);
}

// ─── FASE 10: ASISTENCIAS ─────────────────────────────────────────────────────

async function seedAttendance(
    prisma: PrismaClient,
    classrooms: Array<{ id: string }>,
    teacherIds: string[],
    studentsPerClassroom: Array<string[]>
): Promise<void> {
    progressLine('\n📅 Creando asistencias (600,000)...');

    const schoolDays: Date[] = [];
    const start = new Date('2024-09-16');
    let d = new Date(start);

    while (schoolDays.length < CONFIG.schoolDays) {
        const dow = d.getDay();
        if (dow !== 0 && dow !== 6) schoolDays.push(new Date(d));
        d.setDate(d.getDate() + 1);
    }

    let total = 0;
    const ATTEND_BATCH = 500;

    for (let ci = 0; ci < classrooms.length; ci++) {
        const classroom = classrooms[ci];
        const students = studentsPerClassroom[ci];
        const teacherId = teacherIds[ci % teacherIds.length];

        let buf: Array<{
            date: Date;
            status: AttendanceStatus;
            periods: number;
            studentId: string;
            classroomId: string;
            teacherId: string;
        }> = [];

        for (const studentId of students) {
            for (const day of schoolDays) {
                const rand = Math.random();
                let status: AttendanceStatus;
                let periods: number;

                if (rand < 0.90) {
                    status = AttendanceStatus.PRESENT;
                    periods = 255; // todos los períodos del día
                } else if (rand < 0.95) {
                    status = AttendanceStatus.LATE;
                    periods = 127; // 01111111 - llegó tarde al primero
                } else {
                    status = AttendanceStatus.ABSENT;
                    periods = 0;
                }

                buf.push({
                    date: day,
                    status,
                    periods,
                    studentId,
                    classroomId: classroom.id,
                    teacherId,
                });

                if (buf.length >= ATTEND_BATCH) {
                    await prisma.dailyAttendance.createMany({ data: buf, skipDuplicates: true });
                    total += buf.length;
                    buf = [];
                }
            }
        }

        if (buf.length > 0) {
            await prisma.dailyAttendance.createMany({ data: buf, skipDuplicates: true });
            total += buf.length;
            buf = [];
        }

        if ((ci + 1) % 10 === 0) {
            progressLine(`  Asistencias: ~${total.toLocaleString()}/600,000 (aula ${ci + 1}/100)`);
        }
    }

    progressLine(`  ✅ ~${total.toLocaleString()} registros de asistencia`);
}

// ─── LIMPIEZA ─────────────────────────────────────────────────────────────────

async function cleanExisting(): Promise<void> {
    progressLine('🧹 Limpiando instituto de prueba 5K...');

    const institute = await platformPrisma.institute.findFirst({
        where: { slug: INSTITUTE_SLUG },
    });

    if (!institute) {
        progressLine('ℹ️  No hay datos para limpiar');
        return;
    }

    if (institute.databaseName) {
        const prisma = new PrismaClient({ datasourceUrl: buildTenantDbUrl(institute.databaseName) });
        try {
            await prisma.dailyAttendance.deleteMany({});
            await prisma.grade.deleteMany({});
            await prisma.activity.deleteMany({});
            await prisma.studentTutor.deleteMany({});
            await prisma.studentClassroom.deleteMany({});
            await prisma.teacherClassroom.deleteMany({});
            await prisma.user.deleteMany({ where: { email: { contains: '@testload.com' } } });
            await prisma.classroomSubject.deleteMany({});
            await prisma.classroom.deleteMany({});
            await prisma.subject.deleteMany({ where: { slug: { endsWith: '-5k' } } });
            await prisma.period.deleteMany({});
            await prisma.academicYear.deleteMany({});
            progressLine('✅ Datos del tenant limpiados');
        } finally {
            await prisma.$disconnect();
        }
    }

    await platformPrisma.institute.delete({ where: { id: institute.id } });
    progressLine('✅ Instituto eliminado de platform DB');
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
    const isClean = process.argv.includes('--clean');

    console.log('\n' + '═'.repeat(55));
    console.log('   SEED DE LOAD TESTING - INSTITUTO 5K');
    console.log('═'.repeat(55));

    const startTime = Date.now();

    try {
        if (isClean) {
            await cleanExisting();
            return;
        }

        // ── 1. Provisionar ───
        const { databaseName, adminId } = await provisionInstitute();
        const prisma = new PrismaClient({ datasourceUrl: buildTenantDbUrl(databaseName) });

        const csvRows: string[] = ['role,email,password,name,ci'];
        csvRows.push(`ADMIN,admin1@testload.com,${BASE_PASSWORD},Admin Principal,${adminId}`);

        const hashedPassword = await hash(BASE_PASSWORD, 10);

        try {
            // ── 2. Estructura académica ───
            const { year, lapsos, subjects } = await seedAcademicStructure(prisma);

            // ── 3. Teachers ───
            const teacherIds = await seedTeachers(prisma, hashedPassword, csvRows);

            // ── 4. Admins ───
            await seedAdmins(prisma, hashedPassword, csvRows);

            // ── 5. Classrooms ───
            const classrooms = await seedClassrooms(prisma, teacherIds, year.id, subjects);

            // ── 6. Students ───
            const subjectIds = subjects.map((s) => s.id);
            const lapsoIds = lapsos.map((l) => l.id);
            const allStudentIds = await seedStudents(
                prisma,
                hashedPassword,
                classrooms,
                year.id,
                subjectIds,
                csvRows
            );

            // Construir mapa de estudiantes por aula
            const studentsPerClassroom: Array<string[]> = classrooms.map((_, ci) =>
                allStudentIds.slice(
                    ci * CONFIG.studentsPerClassroom,
                    (ci + 1) * CONFIG.studentsPerClassroom
                )
            );

            // ── 7. Tutores ───
            await seedTutors(prisma, hashedPassword, allStudentIds, csvRows);

            // ── 8. Actividades ───
            const activityMap = await seedActivities(prisma, classrooms, lapsoIds, teacherIds);

            // ── 9. Calificaciones ───
            await seedGrades(
                prisma,
                classrooms,
                lapsoIds,
                teacherIds,
                activityMap,
                studentsPerClassroom
            );

            // ── 10. Asistencias ───
            await seedAttendance(prisma, classrooms, teacherIds, studentsPerClassroom);

        } finally {
            await prisma.$disconnect();
        }

        // ── CSV ───
        // Las pruebas de k6 leen test-users-5k.csv: el del liceo de siempre no cambia de nombre.
        const csvPath = path.join(process.cwd(), 'load-tests', INSTITUTE_SLUG === 'test-load-5k' ? 'test-users-5k.csv' : `usuarios-${INSTITUTE_SLUG}.csv`);
        fs.mkdirSync(path.dirname(csvPath), { recursive: true });
        fs.writeFileSync(csvPath, csvRows.join('\n'), 'utf-8');

        const elapsed = Math.round((Date.now() - startTime) / 1000);
        const mins = Math.floor(elapsed / 60);
        const secs = elapsed % 60;

        console.log('\n' + '═'.repeat(55));
        console.log('✅ SEED COMPLETADO');
        console.log('═'.repeat(55));
        console.log(`\n  ✅ Instituto:       ${INSTITUTE_SLUG}`);
        console.log(`  ✅ Admins:          ${CONFIG.admins}`);
        console.log(`  ✅ Profesores:      ${CONFIG.teachers}`);
        console.log(`  ✅ Estudiantes:     ${TOTAL_STUDENTS.toLocaleString()}`);
        console.log(`  ✅ Tutores:         ${TOTAL_TUTORS.toLocaleString()}`);
        console.log(`  ✅ Aulas:           ${TOTAL_CLASSROOMS}`);
        console.log(`  ✅ Materias:        ${CONFIG.subjects}`);
        console.log(`  ✅ Lapsos:          ${CONFIG.lapsos}`);
        console.log(`  ✅ Actividades:     ~48,000`);
        console.log(`  ✅ Calificaciones:  ~2,400,000`);
        console.log(`  ✅ Asistencias:     ~600,000`);
        console.log(`  ✅ CSV:             ${path.relative(process.cwd(), csvPath)} (${csvRows.length - 1} usuarios)`);
        console.log(`\n  ⏱️  Tiempo total:   ${mins}m ${secs}s`);
        console.log(`\n  🌐 Instituto:      http://${INSTITUTE_SLUG}.localhost:3000`);
        console.log('\n  ▶️  Ejecutar tests:');
        console.log('     npm run test:load:basic:5k');
        console.log('     npm run test:load:write');
        console.log('     npm run test:load:completo');
        console.log('     npm run test:load:stress\n');

    } catch (err) {
        console.error('\n❌ ERROR:', err);
        process.exit(1);
    } finally {
        await platformPrisma.$disconnect();
    }
}

main();
