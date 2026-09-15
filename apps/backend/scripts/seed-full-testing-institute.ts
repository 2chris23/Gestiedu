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
  console.log('🚀 Iniciando población completa de datos para Instituto Testing (Sistema Venezolano)...');

  const passwordHash = await bcrypt.hash('123456', 10);

  // 1. Asegurar Año Escolar 2026-2027
  let academicYear = await prisma.academicYear.findFirst({
    where: { name: '2026-2027' },
  });

  if (!academicYear) {
    academicYear = await prisma.academicYear.create({
      data: {
        id: 'ay-2026-2027',
        name: '2026-2027',
        startDate: new Date('2026-09-15'),
        endDate: new Date('2027-07-31'),
        status: 'ACTIVE',
      },
    });
  }

  // 2. Asegurar Períodos / Lapsos (1er, 2do y 3er Lapso)
  const lapsos = [
    { name: '1er Lapso', startDate: new Date('2026-09-15'), endDate: new Date('2026-12-15'), isActive: true },
    { name: '2do Lapso', startDate: new Date('2027-01-08'), endDate: new Date('2027-04-05'), isActive: false },
    { name: '3er Lapso', startDate: new Date('2027-04-12'), endDate: new Date('2027-07-15'), isActive: false },
  ];

  const periodsMap: Record<string, string> = {};
  for (const l of lapsos) {
    let p = await prisma.period.findFirst({
      where: { academicYearId: academicYear.id, name: l.name },
    });
    if (!p) {
      p = await prisma.period.create({
        data: {
          name: l.name,
          startDate: l.startDate,
          endDate: l.endDate,
          isActive: l.isActive,
          academicYearId: academicYear.id,
        },
      });
    }
    periodsMap[l.name] = p.id;
  }
  const lapso1Id = periodsMap['1er Lapso'];

  // 3. Profesores
  const teachersData = [
    { id: 'V-10000001', email: 'admin@tuapp.com', firstName: 'Profesor', lastName: 'Admin', role: 'ADMIN' },
    { id: 'V-10000002', email: 'profesor.perez@tuapp.com', firstName: 'Juan', lastName: 'Pérez', role: 'TEACHER' },
    { id: 'V-10000003', email: 'profesor.ingles@tuapp.com', firstName: 'Elena', lastName: 'García', role: 'TEACHER' },
    { id: 'V-10000004', email: 'profesor.matematica@tuapp.com', firstName: 'Carlos', lastName: 'Mendoza', role: 'TEACHER' },
    { id: 'V-10000005', email: 'profesora.castellano@tuapp.com', firstName: 'María', lastName: 'Rodríguez', role: 'TEACHER' },
    { id: 'V-10000006', email: 'profesor.ciencias@tuapp.com', firstName: 'Alejandro', lastName: 'Silva', role: 'TEACHER' },
    { id: 'V-10000007', email: 'profesora.historia@tuapp.com', firstName: 'Carmen', lastName: 'Hernández', role: 'TEACHER' },
    { id: 'V-10000008', email: 'profesor.educfisica@tuapp.com', firstName: 'Roberto', lastName: 'Morales', role: 'TEACHER' },
  ];

  const teachersMap: Record<string, string> = {};
  for (const t of teachersData) {
    const user = await prisma.user.upsert({
      where: { email: t.email },
      update: { firstName: t.firstName, lastName: t.lastName, role: t.role as any, isActive: true },
      create: {
        id: t.id,
        email: t.email,
        password: passwordHash,
        firstName: t.firstName,
        lastName: t.lastName,
        role: t.role as any,
        isActive: true,
      },
    });
    teachersMap[t.email] = user.id;
  }

  // 4. Materias Oficiales del Pensum Venezolano (Media General)
  const subjectsData = [
    { name: 'Castellano', slug: 'castellano', code: 'CAS', color: '#EF4444', teacherEmail: 'profesora.castellano@tuapp.com' },
    { name: 'Matemáticas', slug: 'matematicas', code: 'MAT', color: '#3B82F6', teacherEmail: 'profesor.matematica@tuapp.com' },
    { name: 'Inglés y Otras Lenguas Extranjeras', slug: 'ingles', code: 'ING', color: '#8B5CF6', teacherEmail: 'profesor.ingles@tuapp.com' },
    { name: 'Ciencias Naturales (Biología)', slug: 'ciencias-naturales', code: 'CN', color: '#10B981', teacherEmail: 'profesor.ciencias@tuapp.com' },
    { name: 'Geografía, Historia y Ciudadanía (GHC)', slug: 'ghc', code: 'GHC', color: '#F59E0B', teacherEmail: 'profesora.historia@tuapp.com' },
    { name: 'Educación Física', slug: 'educacion-fisica', code: 'EDF', color: '#06B6D4', teacherEmail: 'profesor.educfisica@tuapp.com' },
    { name: 'Orientación y Convivencia', slug: 'orientacion-convivencia', code: 'OAC', color: '#EC4899', teacherEmail: 'profesor.perez@tuapp.com' },
  ];

  const subjectsMap: Record<string, any> = {};
  for (const s of subjectsData) {
    let subject = await prisma.subject.findFirst({
      where: { slug: s.slug },
    });
    if (!subject) {
      subject = await prisma.subject.create({
        data: {
          name: s.name,
          slug: s.slug,
          code: s.code,
          color: s.color,
        },
      });
    }
    subjectsMap[s.slug] = { ...subject, teacherId: teachersMap[s.teacherEmail] };
  }

  // 5. Crear 4 Secciones por Año (1º a 5º Año: A, B, C, D = 20 Secciones en total)
  const grades = [
    { grade: 1, namePrefix: '1er Año' },
    { grade: 2, namePrefix: '2do Año' },
    { grade: 3, namePrefix: '3er Año' },
    { grade: 4, namePrefix: '4to Año' },
    { grade: 5, namePrefix: '5to Año' },
  ];
  const sections = ['A', 'B', 'C', 'D'];

  const allClassrooms: any[] = [];
  const teacherKeys = Object.values(teachersMap);

  for (const g of grades) {
    for (let sIdx = 0; sIdx < sections.length; sIdx++) {
      const sec = sections[sIdx];
      const name = `${g.namePrefix} ${sec}`;
      const slug = `${g.grade}${g.grade === 1 ? 'er' : g.grade === 2 ? 'do' : g.grade === 3 ? 'er' : g.grade === 4 ? 'to' : 'to'}-ano-${sec.toLowerCase()}`;
      const guideTeacherId = teacherKeys[(g.grade + sIdx) % teacherKeys.length];

      const classroom = await prisma.classroom.upsert({
        where: { slug },
        update: {
          name,
          grade: g.grade,
          section: sec,
          academicYearId: academicYear.id,
          teacherId: guideTeacherId,
          capacity: 35,
          isActive: true,
        },
        create: {
          name,
          slug,
          grade: g.grade,
          section: sec,
          academicYearId: academicYear.id,
          teacherId: guideTeacherId,
          capacity: 35,
          isActive: true,
        },
      });

      allClassrooms.push(classroom);

      // Asignar Materias y Horarios a la sección
      const days = [1, 2, 3, 4, 5]; // Lunes a Viernes
      const timeSlots = [
        { startTime: '07:00', endTime: '07:45' },
        { startTime: '07:45', endTime: '08:30' },
        { startTime: '08:30', endTime: '09:15' },
        { startTime: '09:30', endTime: '10:15' },
        { startTime: '10:15', endTime: '11:00' },
        { startTime: '11:00', endTime: '11:45' },
      ];

      let slotIndex = 0;
      for (const s of subjectsData) {
        const subObj = subjectsMap[s.slug];
        const cs = await prisma.classroomSubject.upsert({
          where: {
            classroomId_subjectId: { classroomId: classroom.id, subjectId: subObj.id },
          },
          update: {
            teacherId: subObj.teacherId,
            weeklyBlocks: 4,
            hoursPerWeek: 3,
          },
          create: {
            classroomId: classroom.id,
            subjectId: subObj.id,
            teacherId: subObj.teacherId,
            weeklyBlocks: 4,
            hoursPerWeek: 3,
          },
        });

        // Crear bloques de horario (Schedule Blocks)
        const day = days[slotIndex % days.length];
        const slot = timeSlots[slotIndex % timeSlots.length];
        slotIndex++;

        await prisma.scheduleBlock.deleteMany({
          where: { classroomId: classroom.id, classroomSubjectId: cs.id },
        });

        await prisma.scheduleBlock.create({
          data: {
            classroomId: classroom.id,
            classroomSubjectId: cs.id,
            dayOfWeek: day,
            startTime: slot.startTime,
            endTime: slot.endTime,
            blockType: 'CLASS',
            location: `Aula ${classroom.section}`,
          },
        });

        // Si es 1er Año A, generar Plan de Evaluación y Actividades detalladas
        if (classroom.slug === '1er-ano-a') {
          // Metadata del Plan de Evaluación
          await prisma.evaluationPlanMetadata.upsert({
            where: {
              classroomId_subjectId_lapso: {
                classroomId: classroom.id,
                subjectId: subObj.id,
                lapso: '1',
              },
            },
            update: {
              peic: 'El liceo como espacio de paz y fortalecimiento de habilidades para la vida',
              enfasisCurricular: 'Desarrollo del pensamiento lógico, crítico y comprensión lectora',
              referentesEticos: 'Educar con, por y para todas y todos. Educar en el amor a la Patria.',
              intencionalidad: 'Formación integral del estudiante mediante proyectos socioproductivos',
              temaIndispensable: 'Ciencia, tecnología e innovación para el desarrollo productivo',
              totalSemanas: 12,
            },
            create: {
              classroomId: classroom.id,
              subjectId: subObj.id,
              lapso: '1',
              peic: 'El liceo como espacio de paz y fortalecimiento de habilidades para la vida',
              enfasisCurricular: 'Desarrollo del pensamiento lógico, crítico y comprensión lectora',
              referentesEticos: 'Educar con, por y para todas y todos. Educar en el amor a la Patria.',
              intencionalidad: 'Formación integral del estudiante mediante proyectos socioproductivos',
              temaIndispensable: 'Ciencia, tecnología e innovación para el desarrollo productivo',
              totalSemanas: 12,
            },
          });

          // Crear 3 Actividades de evaluación por materia (4 pts, 4 pts, 4 pts, etc. = 20 pts)
          const planEvaluaciones = [
            {
              title: `Taller Práctico y Análisis — ${subObj.name}`,
              type: 'TALLER',
              week: 3,
              puntos: 5,
              ponderacion: 25,
              tecnica: 'Análisis de Producciones',
              instrumento: 'Escala de Estimación',
              criterio: 'Dominio de contenidos, coherencia y trabajo colaborativo',
            },
            {
              title: `Prueba Escrita de Desarrollo — ${subObj.name}`,
              type: 'PRUEBA_ESCRITA',
              week: 6,
              puntos: 5,
              ponderacion: 25,
              tecnica: 'Prueba Escrita',
              instrumento: 'Cuestionario Estructurado',
              criterio: 'Resolución de problemas y precisión conceptual',
            },
            {
              title: `Proyecto Socioproductivo / Exposición — ${subObj.name}`,
              type: 'PROYECTO',
              week: 9,
              puntos: 6,
              ponderacion: 30,
              tecnica: 'Observación Directa',
              instrumento: 'Rúbrica Holística',
              criterio: 'Innovación, aplicación práctica y dominio oral',
            },
            {
              title: `Rasgos y Autoevaluación/Coevaluación — ${subObj.name}`,
              type: 'RASGOS',
              week: 11,
              puntos: 4,
              ponderacion: 20,
              tecnica: 'Observación Continua',
              instrumento: 'Registro de Desempeño',
              criterio: 'Puntualidad, asistencia, responsabilidad y respeto',
            },
          ];

          for (let rowIdx = 0; rowIdx < planEvaluaciones.length; rowIdx++) {
            const ev = planEvaluaciones[rowIdx];
            const activity = await prisma.activity.create({
              data: {
                title: ev.title,
                description: `${ev.tecnica} - Criterios: ${ev.criterio}`,
                type: ev.type,
                scope: 'CLASSROOM',
                startDate: new Date('2026-10-01'),
                dueDate: new Date('2026-11-30'),
                maxGrade: 20,
                weight: ev.ponderacion / 100,
                lapso: '1',
                periodId: lapso1Id,
                subjectId: subObj.id,
                classroomId: classroom.id,
                createdBy: subObj.teacherId,
                tecnicas: ev.tecnica,
                instrumentos: ev.instrumento,
                criterios: ev.criterio,
                orderIndex: rowIdx,
              },
            });

            await prisma.evaluationPlanRow.create({
              data: {
                classroomId: classroom.id,
                subjectId: subObj.id,
                lapso: '1',
                rowType: 'EVALUATION',
                weekNumber: ev.week,
                orderIndex: rowIdx,
                actividadEval: ev.title,
                tecnicas: ev.tecnica,
                instrumentos: ev.instrumento,
                criterios: ev.criterio,
                puntos: ev.puntos,
                ponderacion: ev.ponderacion,
                tipoEvaluacion: 'SUMATIVA',
                activityId: activity.id,
              },
            });
          }
        }
      }
    }
  }

  // 6. Crear 32 Estudiantes venezolanos con nombres y apellidos realistas
  const studentNames = [
    { first: 'María', last: 'González', ci: 'V-20000001' },
    { first: 'Carlos', last: 'Rodríguez', ci: 'V-20000002' },
    { first: 'Pedro', last: 'Sánchez', ci: 'V-20000003' },
    { first: 'Sofia', last: 'Martínez', ci: 'V-20000004' },
    { first: 'Lucas', last: 'Silva', ci: 'V-20000005' },
    { first: 'Ana', last: 'López', ci: 'V-20000006' },
    { first: 'José', last: 'Pérez', ci: 'V-20000007' },
    { first: 'Andrés', last: 'Mendoza', ci: 'V-20000008' },
    { first: 'Valentina', last: 'Castillo', ci: 'V-20000009' },
    { first: 'Diego', last: 'Morales', ci: 'V-20000010' },
    { first: 'Camila', last: 'Rojas', ci: 'V-20000011' },
    { first: 'Gabriel', last: 'Hernández', ci: 'V-20000012' },
    { first: 'Isabella', last: 'Díaz', ci: 'V-20000013' },
    { first: 'Alejandro', last: 'Romero', ci: 'V-20000014' },
    { first: 'Lucía', last: 'Torres', ci: 'V-20000015' },
    { first: 'Mateo', last: 'Álvarez', ci: 'V-20000016' },
    { first: 'Mariana', last: 'Ruiz', ci: 'V-20000017' },
    { first: 'Sebastián', last: 'Flores', ci: 'V-20000018' },
    { first: 'Paula', last: 'Acosta', ci: 'V-20000019' },
    { first: 'Daniel', last: 'Medina', ci: 'V-20000020' },
    { first: 'Valeria', last: 'Herrera', ci: 'V-20000021' },
    { first: 'Nicolás', last: 'Aguilar', ci: 'V-20000022' },
    { first: 'Victoria', last: 'Suárez', ci: 'V-20000023' },
    { first: 'Samuel', last: 'Paredes', ci: 'V-20000024' },
    { first: 'Gabriela', last: 'Blanco', ci: 'V-20000025' },
    { first: 'Leonardo', last: 'Guerrero', ci: 'V-20000026' },
    { first: 'Daniela', last: 'Molina', ci: 'V-20000027' },
    { first: 'Joaquín', last: 'Delgado', ci: 'V-20000028' },
    { first: 'Elena', last: 'Ortiz', ci: 'V-20000029' },
    { first: 'Adrián', last: 'Rivas', ci: 'V-20000030' },
    { first: 'Santiago', last: 'Gutiérrez', ci: 'V-20000031' },
    { first: 'Antonella', last: 'Campos', ci: 'V-20000032' },
  ];

  const targetClassroom1A = allClassrooms.find((c) => c.slug === '1er-ano-a');

  // Matricular estudiantes en 1er Año A y otras secciones
  for (let i = 0; i < studentNames.length; i++) {
    const s = studentNames[i];
    const email = `${s.first.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')}.${s.last.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')}@testing.edu`;

    const student = await prisma.user.upsert({
      where: { email },
      update: { firstName: s.first, lastName: s.last, role: 'STUDENT', isActive: true },
      create: {
        id: s.ci,
        email,
        password: passwordHash,
        firstName: s.first,
        lastName: s.last,
        role: 'STUDENT',
        isActive: true,
      },
    });

    // Asignar los primeros 30 a 1er Año A (para tener la sección completa con 30 alumnos)
    const targetClass = i < 30 ? targetClassroom1A : allClassrooms[(i % allClassrooms.length)];

    await prisma.studentClassroom.upsert({
      where: {
        studentId_academicYearId: {
          studentId: student.id,
          academicYearId: academicYear.id,
        },
      },
      update: {
        classroomId: targetClass.id,
        isActive: true,
      },
      create: {
        studentId: student.id,
        classroomId: targetClass.id,
        academicYearId: academicYear.id,
        isActive: true,
      },
    });
  }

  // 7. Calificar a los alumnos en 1er Año A en las actividades del Lapso 1 para tener notas reales
  const activitiesIn1A = await prisma.activity.findMany({
    where: { classroomId: targetClassroom1A.id },
    include: { subject: true },
  });

  const enrolledStudents1A = await prisma.studentClassroom.findMany({
    where: { classroomId: targetClassroom1A.id, isActive: true },
    include: { student: true },
  });

  console.log(`Evaluando a ${enrolledStudents1A.length} estudiantes en 1er Año A...`);

  for (const act of activitiesIn1A) {
    for (const sc of enrolledStudents1A) {
      // Generar una nota representativa venezolana (escala 01 a 20)
      // Distribución: la mayoría aprueba (12-19), algunos destacados (20), pocos en riesgo (08-09)
      const baseHash = (sc.student.firstName.charCodeAt(0) + act.title.length) % 10;
      let score = 14 + (baseHash % 7); // Entre 14 y 20
      if (sc.student.lastName === 'Sánchez') score = 8; // Estudiante en riesgo para auditorías
      if (sc.student.lastName === 'Delgado') score = 9; // Estudiante con pendiente

      await prisma.grade.upsert({
        where: {
          studentId_activityId: {
            studentId: sc.studentId,
            activityId: act.id,
          },
        },
        update: {
          score,
          periodId: lapso1Id,
          subjectId: act.subjectId!,
          teacherId: act.createdBy,
        },
        create: {
          studentId: sc.studentId,
          activityId: act.id,
          periodId: lapso1Id,
          subjectId: act.subjectId!,
          teacherId: act.createdBy,
          score,
        },
      });
    }
  }

  console.log('✅ Población completada con éxito:');
  console.log(`- 20 Secciones (1º a 5º Año, Secciones A, B, C, D)`);
  console.log(`- 30 Estudiantes matriculados en 1er Año A`);
  console.log(`- Materias del pensum venezolano asignadas con horarios`);
  console.log(`- Plan de Evaluación estructurado con ponderaciones y actividades de 20 pts`);
  console.log(`- Calificaciones y promedios reales calculados`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
