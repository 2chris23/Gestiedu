import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';

/**
 * LAS CUENTAS QUE ESPERAN LAS PRUEBAS DE NAVEGADOR
 *
 * `tests/e2e/` entra con cuentas que ningún sembrado creaba
 * (`admin@testing.edu.ve` en 67 sitios, `est0575@…`, `tutor.prueba@…`,
 * `profesor3@…` con la materia `materia-mate`, `est0001@…`). Quien montaba el
 * entorno siguiendo la guía veía la tanda caerse casi entera en la entrada, y
 * las crearon a mano en cada máquina.
 *
 * Se corre DESPUÉS de `testing-institute.seed.ts` (y, si se quiere el liceo
 * lleno, de `scripts/seed-full-testing-institute.ts`). No borra nada y se
 * puede repetir: cada cuenta se crea o se deja como estaba. Contraseña de
 * todas: 123456, la de las pruebas.
 *
 *   cd apps/backend && npx tsx src/prisma/seeds/cuentas-de-las-pruebas.seed.ts
 *
 * La base es la del `DATABASE_URL` del .env (el liceo de pruebas).
 */

const URL = process.env.DATABASE_URL;
if (!URL) throw new Error('Falta DATABASE_URL en el .env');

async function main() {
    const prisma = new PrismaClient({ datasources: { db: { url: URL } } });
    const clave = await bcrypt.hash('123456', 10);

    const ciclo = await prisma.academicYear.findFirst({ where: { status: 'ACTIVE' }, orderBy: { startDate: 'desc' } });
    if (!ciclo) throw new Error('No hay ciclo activo: corre antes testing-institute.seed.ts');
    const secciones = await prisma.classroom.findMany({
        where: { academicYearId: ciclo.id },
        orderBy: [{ grade: 'asc' }, { section: 'asc' }],
    });
    const seccion = (grado: number, letra: string) => secciones.find((s) => s.grade === grado && s.section === letra);
    const primeroA = seccion(1, 'A');
    if (!primeroA) throw new Error('No existe 1er Año A en el ciclo activo');

    const cuenta = async (id: string, email: string, role: 'ADMIN' | 'TEACHER' | 'STUDENT' | 'TUTOR', firstName: string, lastName: string) => {
        const ya = await prisma.user.findFirst({ where: { OR: [{ id }, { email }] } });
        if (ya) return ya;
        return prisma.user.create({ data: { id, email, password: clave, role, firstName, lastName, isActive: true } });
    };

    await cuenta('V-10000099', 'admin@testing.edu.ve', 'ADMIN', 'Admin', 'Pruebas');

    // El alumno de las pruebas y su representante, en 1er Año A.
    const alumno = await cuenta('V-20000575', 'est0575@testing.edu.ve', 'STUDENT', 'Estudiante', 'Prueba');
    const otro = await cuenta('V-20000901', 'est0001@testing.edu.ve', 'STUDENT', 'Estudiante', 'Uno');
    for (const a of [alumno, otro]) {
        const inscrito = await prisma.studentClassroom.findUnique({
            where: { studentId_academicYearId: { studentId: a.id, academicYearId: ciclo.id } },
        });
        if (!inscrito) {
            await prisma.studentClassroom.create({
                data: { studentId: a.id, classroomId: primeroA.id, academicYearId: ciclo.id, isActive: true },
            });
        }
    }
    const tutor = await cuenta('V-30000001', 'tutor.prueba@testing.edu.ve', 'TUTOR', 'Representante', 'Prueba');
    await prisma.studentTutor.upsert({
        where: { studentId_tutorId: { studentId: alumno.id, tutorId: tutor.id } },
        update: {},
        create: { studentId: alumno.id, tutorId: tutor.id, relationship: 'Madre' },
    });

    // Un profesor que da la misma materia en varias secciones (copiar el
    // plan de una a otra, dos pestañas sobre el mismo plan).
    const profe = await cuenta('V-10000013', 'profesor3@testing.edu.ve', 'TEACHER', 'Profesor', 'Tres');
    const materia =
        (await prisma.subject.findFirst({ where: { slug: 'materia-mate' } })) ??
        (await prisma.subject.create({ data: { name: 'Matemática (pruebas)', slug: 'materia-mate', code: 'MATP', color: '#2563EB' } }));
    for (const s of [seccion(1, 'B'), seccion(2, 'A')].filter(Boolean)) {
        await prisma.classroomSubject.upsert({
            where: { classroomId_subjectId: { classroomId: s!.id, subjectId: materia.id } },
            update: {},
            create: { classroomId: s!.id, subjectId: materia.id, teacherId: profe.id, weeklyBlocks: 2 },
        });
    }

    console.log('✅ Cuentas de las pruebas de navegador listas (contraseña 123456).');
    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
