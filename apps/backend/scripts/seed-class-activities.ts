import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://postgres:82nQKb95S7wNDmuxyvIG6dOYkZUo@localhost:5432/tenant_instituto_testing',
    },
  },
});

async function main() {
  console.log('🚀 Creando actividades pedagógicas en vivo y temas de clase...');

  const classrooms = await prisma.classroom.findMany({
    where: { slug: { in: ['1er-ano-a', '1er-ano-b', '2do-ano-a'] } },
    include: {
      subjects: { include: { subject: true } },
      studentClassrooms: { where: { isActive: true }, include: { student: true } }
    },
  });

  const lapso1 = await prisma.period.findFirst({
    where: { name: '1er Lapso' },
  });

  // Fechas reales del calendario escolar
  const sessionDates = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25'];

  for (const cls of classrooms) {
    for (const cs of cls.subjects) {
      const sub = cs.subject;

      // Crear o asegurar tema en EvaluationPlanRow para la semana 1 y 2
      await prisma.evaluationPlanRow.createMany({
        data: [
          {
            classroomId: cls.id,
            subjectId: sub.id,
            lapso: '1',
            rowType: 'HEADER',
            weekNumber: 1,
            orderIndex: 0,
            title: `Introducción al Pensamiento Crítico y Fundamentos de ${sub.name}`,
          },
          {
            classroomId: cls.id,
            subjectId: sub.id,
            lapso: '1',
            rowType: 'HEADER',
            weekNumber: 2,
            orderIndex: 1,
            title: `Aplicación Práctica y Métodos Analíticos en ${sub.name}`,
          }
        ],
        skipDuplicates: true
      });

      // Crear ClassActivity para la clase de hoy y próxima clase
      const act1 = await prisma.classActivity.create({
        data: {
          classroomId: cls.id,
          subjectId: sub.id,
          title: `Lectura Dirigida y Guía de Ejercicios — ${sub.name}`,
          description: 'Actividad presencial en aula evaluando comprensión y participación.',
          type: 'ACTIVITY',
          target: 'TODAY',
          tag: 'Individual',
          maxScore: 20,
          isDone: false,
          carriedOver: false,
        }
      });

      const act2 = await prisma.classActivity.create({
        data: {
          classroomId: cls.id,
          subjectId: sub.id,
          title: `Investigación Bibliográfica y Ficha Resumen — ${sub.name}`,
          description: 'Preparación para la discusión grupal de la siguiente sesión.',
          type: 'TASK',
          target: 'NEXT',
          tag: 'Grupal',
          maxScore: 20,
          isDone: false,
          carriedOver: false,
        }
      });
    }
  }

  console.log('✅ Temas generadores y actividades de clase creadas exitosamente.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
