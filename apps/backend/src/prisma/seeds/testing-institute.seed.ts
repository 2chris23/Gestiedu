import { PrismaClient } from '@prisma/client';
import { PrismaClient as PlatformPrismaClient } from '../../generated/platform-client';
import * as bcrypt from 'bcrypt';
import { Client } from 'pg';
import { execSync } from 'child_process';

async function seedTestingInstitute() {
    console.log('🧹 1. Limpiando todas las bases de datos de prueba anteriores y platform DB...');

    const pgClient = new Client({
        connectionString: 'postgresql://postgres:82nQKb95S7wNDmuxyvIG6dOYkZUo@localhost:5432/postgres'
    });
    await pgClient.connect();

    // Obtener todas las bases de datos tenant
    const dbRes = await pgClient.query("SELECT datname FROM pg_database WHERE datname LIKE 'tenant_%' OR datname = 'gestion_escolar_platform'");
    for (const row of dbRes.rows) {
        const dbName = row.datname;
        console.log(`   Eliminando base de datos: ${dbName}...`);
        await pgClient.query(`
            SELECT pg_terminate_backend(pid) FROM pg_stat_activity 
            WHERE datname = '${dbName}' AND pid <> pg_backend_pid();
        `);
        await pgClient.query(`DROP DATABASE IF EXISTS "${dbName}";`);
    }

    // Recrear platform DB y tenant DB limpias
    console.log('📦 2. Creando bases de datos limpias: gestion_escolar_platform y tenant_instituto_testing...');
    await pgClient.query(`CREATE DATABASE "gestion_escolar_platform";`);
    await pgClient.query(`CREATE DATABASE "tenant_instituto_testing";`);
    await pgClient.end();

    // Sincronizar platform DB con el esquema de platform-schema.prisma
    console.log('⚡ 3. Sincronizando Platform DB schema...');
    execSync('npx prisma db push --schema=src/prisma/platform-schema.prisma --accept-data-loss --skip-generate', {
        env: {
            ...process.env,
            PLATFORM_DATABASE_URL: 'postgresql://postgres:82nQKb95S7wNDmuxyvIG6dOYkZUo@localhost:5432/gestion_escolar_platform'
        },
        stdio: 'inherit'
    });

    console.log('🏛️  4. Creando SuperAdmin e Instituto Testing en Platform DB...');
    const platformPrisma = new PlatformPrismaClient({
        datasources: { db: { url: 'postgresql://postgres:82nQKb95S7wNDmuxyvIG6dOYkZUo@localhost:5432/gestion_escolar_platform' } }
    });

    const superAdminPassword = await bcrypt.hash('SuperAdmin2026!', 10);
    await platformPrisma.superAdmin.create({
        data: {
            email: 'admin@tuapp.com',
            password: superAdminPassword,
            name: 'Super Admin',
            isActive: true,
        }
    });

    await platformPrisma.platformConfig.upsert({
        where: { id: 'platform' },
        create: { id: 'platform', platformName: 'GestiEdu' },
        update: {}
    });

    const institute = await platformPrisma.institute.create({
        data: {
            id: 'inst-testing',
            name: 'Instituto Testing',
            code: 'TEST01',
            slug: 'instituto-testing',
            subdomain: 'instituto-testing',
            email: 'admin@institutotesting.edu',
            status: 'ACTIVE',
            plan: 'PREMIUM',
            databaseName: 'tenant_instituto_testing',
            databaseHost: 'localhost',
            databasePort: 5432,
            databaseUser: 'postgres',
            databasePassword: '82nQKb95S7wNDmuxyvIG6dOYkZUo',
            maxStudents: 1000,
            maxTeachers: 100,
        }
    });
    console.log('   Instituto Testing creado en platform DB:', institute.id);
    await platformPrisma.$disconnect();

    // Inicializar el esquema de Prisma en tenant_instituto_testing
    console.log('⚡ 5. Inicializando tablas en tenant_instituto_testing...');
    execSync('npx prisma db push --schema=src/prisma/schema.prisma --accept-data-loss --skip-generate', {
        env: {
            ...process.env,
            DATABASE_URL: 'postgresql://postgres:82nQKb95S7wNDmuxyvIG6dOYkZUo@localhost:5432/tenant_instituto_testing'
        },
        stdio: 'inherit'
    });

    const tenantPrisma = new PrismaClient({
        datasources: { db: { url: 'postgresql://postgres:82nQKb95S7wNDmuxyvIG6dOYkZUo@localhost:5432/tenant_instituto_testing' } }
    });

    console.log('👥 6. Creando usuarios (Admin, Profesores, Estudiantes)...');
    const passwordHash = await bcrypt.hash('123456', 10);

    // Admin del instituto
    const admin = await tenantPrisma.user.create({
        data: {
            id: 'V-10000001',
            email: 'admin@tuapp.com',
            password: passwordHash,
            firstName: 'Profesor',
            lastName: 'Admin',
            role: 'ADMIN',
            isActive: true,
        }
    });

    // Profesores
    const profPerez = await tenantPrisma.user.create({
        data: {
            id: 'V-10000002',
            email: 'profesor.perez@tuapp.com',
            password: passwordHash,
            firstName: 'Juan',
            lastName: 'Pérez',
            role: 'TEACHER',
            specialization: 'Matemáticas',
            isActive: true,
        }
    });

    const profIngles = await tenantPrisma.user.create({
        data: {
            id: 'V-10000003',
            email: 'profesor.ingles@tuapp.com',
            password: passwordHash,
            firstName: 'Elena',
            lastName: 'García',
            role: 'TEACHER',
            specialization: 'Inglés',
            isActive: true,
        }
    });

    // Estudiantes con nombres reales y géneros
    const studentsData = [
        { id: 'V-20000001', firstName: 'Lucas', lastName: 'Silva', gender: 'MASCULINO' as const, email: 'lucas.silva@testing.edu' },
        { id: 'V-20000002', firstName: 'Sofia', lastName: 'Martínez', gender: 'FEMENINO' as const, email: 'sofia.martinez@testing.edu' },
        { id: 'V-20000003', firstName: 'Carlos', lastName: 'Rodríguez', gender: 'MASCULINO' as const, email: 'carlos.rodriguez@testing.edu' },
        { id: 'V-20000004', firstName: 'María', lastName: 'González', gender: 'FEMENINO' as const, email: 'maria.gonzalez@testing.edu' },
        { id: 'V-20000005', firstName: 'Pedro', lastName: 'Sánchez', gender: 'MASCULINO' as const, email: 'pedro.sanchez@testing.edu' },
        { id: 'V-20000006', firstName: 'Ana', lastName: 'López', gender: 'FEMENINO' as const, email: 'ana.lopez@testing.edu' },
        { id: 'V-20000007', firstName: 'José', lastName: 'Pérez', gender: 'MASCULINO' as const, email: 'jose.perez@testing.edu' },
        { id: 'V-20000008', firstName: 'Andrés', lastName: 'Mendoza', gender: 'MASCULINO' as const, email: 'andres.mendoza@testing.edu' },
    ];

    const students: any[] = [];
    for (const s of studentsData) {
        const student = await tenantPrisma.user.create({
            data: {
                id: s.id,
                email: s.email,
                password: passwordHash,
                firstName: s.firstName,
                lastName: s.lastName,
                gender: s.gender,
                role: 'STUDENT',
                isActive: true,
            }
        });
        students.push(student);
    }

    console.log('📚 7. Creando Materias...');
    const mate = await tenantPrisma.subject.create({
        data: { name: 'Matemáticas', slug: 'matematicas', code: 'MAT', color: '#3B82F6' }
    });
    const ingles = await tenantPrisma.subject.create({
        data: { name: 'Inglés', slug: 'ingles', code: 'ING', color: '#8B5CF6' }
    });
    const castellano = await tenantPrisma.subject.create({
        data: { name: 'Lengua y Literatura', slug: 'lengua-literatura', code: 'LEN', color: '#10B981' }
    });

    console.log('📅 8. Creando Año Escolar 2026-2027 (Activo)...');
    const ay2026 = await tenantPrisma.academicYear.create({
        data: {
            id: 'ay-2026-2027',
            name: '2026-2027',
            status: 'ACTIVE',
            isActive: true,
            startDate: new Date('2026-08-20'),
            endDate: new Date('2027-07-15'),
        }
    });

    // Lapsos
    const lapso1 = await tenantPrisma.period.create({
        data: {
            academicYearId: ay2026.id,
            name: '1er Lapso',
            startDate: new Date('2026-08-20'),
            endDate: new Date('2026-12-15'),
            isActive: true,
        }
    });

    console.log('🏫 9. Creando Aulas (1er Año A/B, 2do Año A, 5to Año A)...');
    const aula1A = await tenantPrisma.classroom.create({
        data: {
            name: '1er Año A',
            slug: '1er-ano-a',
            section: 'A',
            grade: 1,
            capacity: 35,
            academicYearId: ay2026.id,
            teacherId: profPerez.id,
        }
    });

    const aula1B = await tenantPrisma.classroom.create({
        data: {
            name: '1er Año B',
            slug: '1er-ano-b',
            section: 'B',
            grade: 1,
            capacity: 35,
            academicYearId: ay2026.id,
            teacherId: profIngles.id,
        }
    });

    const aula2A = await tenantPrisma.classroom.create({
        data: {
            name: '2do Año A',
            slug: '2do-ano-a',
            section: 'A',
            grade: 2,
            capacity: 35,
            academicYearId: ay2026.id,
            teacherId: profPerez.id,
        }
    });

    const aula5A = await tenantPrisma.classroom.create({
        data: {
            name: '5to Año A',
            slug: '5to-ano-a',
            section: 'A',
            grade: 5,
            capacity: 35,
            academicYearId: ay2026.id,
            teacherId: profIngles.id,
        }
    });

    // Asignar materias a aulas
    for (const classroom of [aula1A, aula1B, aula2A, aula5A]) {
        await tenantPrisma.classroomSubject.create({
            data: { classroomId: classroom.id, subjectId: mate.id, teacherId: profPerez.id, weeklyBlocks: 4 }
        });
        await tenantPrisma.classroomSubject.create({
            data: { classroomId: classroom.id, subjectId: ingles.id, teacherId: profIngles.id, weeklyBlocks: 3 }
        });
        await tenantPrisma.classroomSubject.create({
            data: { classroomId: classroom.id, subjectId: castellano.id, teacherId: profPerez.id, weeklyBlocks: 4 }
        });
    }

    console.log('🎓 10. Matriculando estudiantes y cargando notas...');
    // Matricular en 1er Año B: Lucas (V-20000001), Sofia (V-20000002)
    for (const s of [students[0], students[1]]) {
        await tenantPrisma.studentClassroom.create({
            data: { studentId: s.id, classroomId: aula1B.id, academicYearId: ay2026.id, isActive: true }
        });
        await tenantPrisma.user.update({
            where: { id: s.id },
            data: { classroomId: aula1B.id }
        });
    }

    // Matricular en 1er Año A: Carlos (V-20000003), Maria (V-20000004), Pedro (V-20000005)
    for (const s of [students[2], students[3], students[4]]) {
        await tenantPrisma.studentClassroom.create({
            data: { studentId: s.id, classroomId: aula1A.id, academicYearId: ay2026.id, isActive: true }
        });
        await tenantPrisma.user.update({
            where: { id: s.id },
            data: { classroomId: aula1A.id }
        });
    }

    // Matricular en 2do Año A: Ana (V-20000006), Jose (V-20000007)
    for (const s of [students[5], students[6]]) {
        await tenantPrisma.studentClassroom.create({
            data: { studentId: s.id, classroomId: aula2A.id, academicYearId: ay2026.id, isActive: true }
        });
        await tenantPrisma.user.update({
            where: { id: s.id },
            data: { classroomId: aula2A.id }
        });
    }

    // Matricular en 5to Año A: Andrés (V-20000008)
    await tenantPrisma.studentClassroom.create({
        data: { studentId: students[7].id, classroomId: aula5A.id, academicYearId: ay2026.id, isActive: true }
    });
    await tenantPrisma.user.update({
        where: { id: students[7].id },
        data: { classroomId: aula5A.id }
    });

    // Crear Actividades y Calificaciones
    const actMate1A = await tenantPrisma.activity.create({
        data: {
            title: 'Examen de Álgebra',
            type: 'EXAM',
            scope: 'ACADEMIC',
            maxGrade: 20,
            weight: 1,
            startDate: new Date('2026-10-10'),
            periodId: lapso1.id,
            subjectId: mate.id,
            classroomId: aula1A.id,
            createdBy: profPerez.id,
        }
    });

    // Notas en 1er Año A:
    // Carlos: 18, Maria: 15, Pedro: 08 (Reprobado)
    await tenantPrisma.grade.create({ data: { studentId: students[2].id, activityId: actMate1A.id, periodId: lapso1.id, subjectId: mate.id, score: 18, teacherId: profPerez.id } });
    await tenantPrisma.grade.create({ data: { studentId: students[3].id, activityId: actMate1A.id, periodId: lapso1.id, subjectId: mate.id, score: 15, teacherId: profPerez.id } });
    await tenantPrisma.grade.create({ data: { studentId: students[4].id, activityId: actMate1A.id, periodId: lapso1.id, subjectId: mate.id, score: 8, teacherId: profPerez.id } });

    // Notas en 1er Año B: Lucas: 16, Sofia: 17
    const actMate1B = await tenantPrisma.activity.create({
        data: {
            title: 'Examen de Álgebra',
            type: 'EXAM',
            scope: 'ACADEMIC',
            maxGrade: 20,
            weight: 1,
            startDate: new Date('2026-10-10'),
            periodId: lapso1.id,
            subjectId: mate.id,
            classroomId: aula1B.id,
            createdBy: profPerez.id,
        }
    });
    await tenantPrisma.grade.create({ data: { studentId: students[0].id, activityId: actMate1B.id, periodId: lapso1.id, subjectId: mate.id, score: 16, teacherId: profPerez.id } });
    await tenantPrisma.grade.create({ data: { studentId: students[1].id, activityId: actMate1B.id, periodId: lapso1.id, subjectId: mate.id, score: 17, teacherId: profPerez.id } });

    // Notas en 2do Año A: Ana: 19, Jose: 16
    const actMate2A = await tenantPrisma.activity.create({
        data: {
            title: 'Examen de Geometría',
            type: 'EXAM',
            scope: 'ACADEMIC',
            maxGrade: 20,
            weight: 1,
            startDate: new Date('2026-10-10'),
            periodId: lapso1.id,
            subjectId: mate.id,
            classroomId: aula2A.id,
            createdBy: profPerez.id,
        }
    });
    await tenantPrisma.grade.create({ data: { studentId: students[5].id, activityId: actMate2A.id, periodId: lapso1.id, subjectId: mate.id, score: 19, teacherId: profPerez.id } });
    await tenantPrisma.grade.create({ data: { studentId: students[6].id, activityId: actMate2A.id, periodId: lapso1.id, subjectId: mate.id, score: 16, teacherId: profPerez.id } });

    // Notas en 5to Año A: Andrés: 18
    const actMate5A = await tenantPrisma.activity.create({
        data: {
            title: 'Examen de Cálculo',
            type: 'EXAM',
            scope: 'ACADEMIC',
            maxGrade: 20,
            weight: 1,
            startDate: new Date('2026-10-10'),
            periodId: lapso1.id,
            subjectId: mate.id,
            classroomId: aula5A.id,
            createdBy: profPerez.id,
        }
    });
    await tenantPrisma.grade.create({ data: { studentId: students[7].id, activityId: actMate5A.id, periodId: lapso1.id, subjectId: mate.id, score: 18, teacherId: profPerez.id } });

    console.log('✅ ¡Seed del Instituto Testing completado con éxito!');
    await tenantPrisma.$disconnect();
}

seedTestingInstitute().catch((err) => {
    console.error('❌ Error en seed:', err);
    process.exit(1);
});
