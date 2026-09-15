import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://postgres:82nQKb95S7wNDmuxyvIG6dOYkZUo@localhost:5432/tenant_instituto_testing',
    },
  },
});

async function main() {
  console.log('🚀 Poblando 30 estudiantes por cada una de las 20 secciones...');

  const passwordHash = await bcrypt.hash('123456', 10);

  const academicYear = await prisma.academicYear.findFirst({
    where: { name: '2026-2027' },
  });
  if (!academicYear) throw new Error('Año escolar no encontrado');

  const classrooms = await prisma.classroom.findMany({
    where: { academicYearId: academicYear.id },
    include: { subjects: { include: { subject: true } } },
  });

  const lapso1 = await prisma.period.findFirst({
    where: { academicYearId: academicYear.id, name: '1er Lapso' },
  });

  const firstNames = [
    'Alejandro', 'Ana', 'Andrés', 'Antonella', 'Carlos', 'Camila', 'Carmen', 'Daniel',
    'Daniela', 'Diego', 'Elena', 'Gabriel', 'Gabriela', 'Isabella', 'Joaquín', 'José',
    'Leonardo', 'Lucas', 'Lucía', 'María', 'Mariana', 'Mateo', 'Nicolás', 'Paula',
    'Pedro', 'Roberto', 'Samuel', 'Santiago', 'Sebastián', 'Sofia', 'Valentina', 'Valeria'
  ];

  const lastNames = [
    'Acosta', 'Aguilar', 'Álvarez', 'Blanco', 'Campos', 'Castillo', 'Delgado', 'Díaz',
    'Flores', 'García', 'González', 'Guerrero', 'Hernández', 'Herrera', 'López', 'Martínez',
    'Medina', 'Mendoza', 'Molina', 'Morales', 'Ortiz', 'Paredes', 'Pérez', 'Rivas',
    'Rodríguez', 'Rojas', 'Romero', 'Ruiz', 'Sánchez', 'Silva', 'Suárez', 'Torres'
  ];

  let studentCounter = 1;

  for (const cls of classrooms) {
    console.log(`Poblando 30 estudiantes para sección: ${cls.name}...`);

    for (let i = 0; i < 30; i++) {
      const fn = firstNames[(studentCounter + i) % firstNames.length];
      const ln = lastNames[(studentCounter + i * 2) % lastNames.length];
      const ci = `V-${String(20000000 + studentCounter).padStart(8, '0')}`;
      const email = `estudiante.${studentCounter}@testing.edu`;
      studentCounter++;

      const student = await prisma.user.upsert({
        where: { id: ci },
        update: { email, firstName: fn, lastName: ln, role: 'STUDENT', isActive: true },
        create: {
          id: ci,
          email,
          password: passwordHash,
          firstName: fn,
          lastName: ln,
          role: 'STUDENT',
          isActive: true,
        },
      });

      await prisma.studentClassroom.upsert({
        where: {
          studentId_academicYearId: {
            studentId: student.id,
            academicYearId: academicYear.id,
          },
        },
        update: {
          classroomId: cls.id,
          isActive: true,
        },
        create: {
          studentId: student.id,
          classroomId: cls.id,
          academicYearId: academicYear.id,
          isActive: true,
        },
      });
    }
  }

  console.log(`✅ ${studentCounter - 1} estudiantes matriculados (30 por cada sección de 1º a 5º Año).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
