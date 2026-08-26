import { PrismaClient } from '@prisma/client';
import { UserRole, Gender, ActivityType, ActivityScope, AttendanceStatus, DayOfWeek } from '../utils/prisma-enums';
import { generateSlug } from '../utils/slug';
// Script de datos de prueba para Prisma
// apps/backend/src/prisma/seed.ts


import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Iniciando seed de la base de datos...')

  // Limpiar datos existentes (en orden correcto por dependencias)
  await prisma.notification.deleteMany({})
  await prisma.auditLog.deleteMany({})
  await prisma.schedule.deleteMany({})
  await prisma.dailyAttendance.deleteMany({})
  await prisma.grade.deleteMany({})
  await prisma.activity.deleteMany({})
  await prisma.classroomSubject.deleteMany({})
  await prisma.studentTutor.deleteMany({})
  await prisma.studentClassroom.deleteMany({})
  await prisma.teacherClassroom.deleteMany({})
  await prisma.period.deleteMany({})
  await prisma.classroom.deleteMany({})
  await prisma.subject.deleteMany({})
  await prisma.academicYear.deleteMany({})
  await prisma.refreshToken.deleteMany({})
  await prisma.user.deleteMany({})
  await prisma.institute.deleteMany({})

  // Hash para contraseñas
  const passwordHash = await bcrypt.hash('123456', 10)

  // 1. Crear Instituto único
  const institute = await prisma.institute.create({
    data: {
      id: 'institute', // ID fijo para el instituto único
      name: 'Instituto Educativo Demo',
      code: 'IED',
      slug: 'instituto-educativo-demo',
      email: 'admin@institutodemo.edu',
      phone: '+58-212-555-0100',
      address: 'Av. Principal, Caracas, Venezuela',
      // logo and favicon will be uploaded through the UI
      primaryColor: '#1e40af',
      secondaryColor: '#3b82f6',
    }
  })

  // 2. Crear Año Académico
  const academicYear = await prisma.academicYear.create({
    data: {
      id: 'ay_2024_2025',
      name: '2024-2025',
      startDate: new Date('2024-09-01'),
      endDate: new Date('2025-07-15'),
      isActive: true,
      instituteId: institute.id
    }
  })

  // 3. Crear Períodos
  const periods = await Promise.all([
    prisma.period.create({
      data: {
        id: 'period_1_2024',
        name: 'Primer Lapso',
        startDate: new Date('2024-09-01'),
        endDate: new Date('2024-12-15'),
        isActive: true,
        academicYearId: academicYear.id
      }
    }),
    prisma.period.create({
      data: {
        id: 'period_2_2024',
        name: 'Segundo Lapso',
        startDate: new Date('2025-01-08'),
        endDate: new Date('2025-04-15'),
        isActive: false,
        academicYearId: academicYear.id
      }
    }),
    prisma.period.create({
      data: {
        id: 'period_3_2024',
        name: 'Tercer Lapso',
        startDate: new Date('2025-04-16'),
        endDate: new Date('2025-07-15'),
        isActive: false,
        academicYearId: academicYear.id
      }
    })
  ])

  // 4. Crear Materias
  const subjects = await Promise.all([
    prisma.subject.create({
      data: {
        id: 'subj_math',
        name: 'Matemáticas',
        slug: generateSlug('Matemáticas'),
        code: 'MAT',
        description: 'Matemáticas básicas y avanzadas',
        color: '#ef4444',
        instituteId: institute.id
      }
    }),
    prisma.subject.create({
      data: {
        id: 'subj_spanish',
        name: 'Lenguaje y Literatura',
        slug: generateSlug('Lenguaje y Literatura'),
        code: 'LEN',
        description: 'Lengua española y literatura',
        color: '#22c55e',
        instituteId: institute.id
      }
    }),
    prisma.subject.create({
      data: {
        id: 'subj_science',
        name: 'Ciencias Naturales',
        slug: generateSlug('Ciencias Naturales'),
        code: 'CIE',
        description: 'Ciencias naturales y experimentos',
        color: '#3b82f6',
        instituteId: institute.id
      }
    }),
    prisma.subject.create({
      data: {
        id: 'subj_history',
        name: 'Historia Universal',
        slug: generateSlug('Historia Universal'),
        code: 'HIS',
        description: 'Historia universal y nacional',
        color: '#f59e0b',
        instituteId: institute.id
      }
    }),
    prisma.subject.create({
      data: {
        id: 'subj_pe',
        name: 'Educación Física',
        slug: generateSlug('Educación Física'),
        code: 'EDF',
        description: 'Educación física y deportes',
        color: '#8b5cf6',
        instituteId: institute.id
      }
    })
  ])

  // 5. Crear Usuarios

  // Administrador
  const admin = await prisma.user.create({
    data: {
      id: '12345678',
      email: 'admin@institutodemo.edu',
      password: passwordHash,
      firstName: 'Juan Carlos',
      lastName: 'Rodríguez',
      phone: '+58-414-555-0001',
      birthDate: new Date('1980-05-15'),
      address: 'Urb. Los Palos Grandes, Caracas',
      gender: Gender.MASCULINO,
      role: UserRole.ADMIN,
      isActive: true,
      instituteId: institute.id,
      preferences: JSON.stringify({
        theme: 'light',
        notifications: {
          email: true,
          push: true,
          grades: true,
          activities: true
        }
      })
    }
  })

  // Profesores
  const teachers = await Promise.all([
    prisma.user.create({
      data: {
        id: '23456789',
        email: 'maria.gonzalez@institutodemo.edu',
        password: passwordHash,
        firstName: 'María Elena',
        lastName: 'González',
        phone: '+58-424-555-0002',
        birthDate: new Date('1985-03-20'),
        gender: Gender.FEMENINO,
        role: UserRole.TEACHER,
        isActive: true,
        instituteId: institute.id
      }
    }),
    prisma.user.create({
      data: {
        id: '34567890',
        email: 'carlos.martinez@institutodemo.edu',
        password: passwordHash,
        firstName: 'Carlos Andrés',
        lastName: 'Martínez',
        phone: '+58-416-555-0003',
        birthDate: new Date('1978-11-10'),
        gender: Gender.MASCULINO,
        role: UserRole.TEACHER,
        isActive: true,
        instituteId: institute.id
      }
    }),
    prisma.user.create({
      data: {
        id: '45678901',
        email: 'ana.lopez@institutodemo.edu',
        password: passwordHash,
        firstName: 'Ana Patricia',
        lastName: 'López',
        phone: '+58-412-555-0004',
        birthDate: new Date('1982-07-25'),
        gender: Gender.FEMENINO,
        role: UserRole.TEACHER,
        isActive: true,
        instituteId: institute.id
      }
    })
  ])

  // Estudiantes
  const students = await Promise.all([
    prisma.user.create({
      data: {
        id: '56789012',
        email: 'pedro.silva@estudiante.edu',
        password: passwordHash,
        firstName: 'Pedro José',
        lastName: 'Silva',
        phone: '+58-426-555-0011',
        birthDate: new Date('2010-04-12'),
        gender: Gender.MASCULINO,
        role: UserRole.STUDENT,
        isActive: true,
        instituteId: institute.id
      }
    }),
    prisma.user.create({
      data: {
        id: '67890123',
        email: 'sofia.ramirez@estudiante.edu',
        password: passwordHash,
        firstName: 'Sofía Alejandra',
        lastName: 'Ramírez',
        phone: '+58-414-555-0012',
        birthDate: new Date('2009-08-30'),
        gender: Gender.FEMENINO,
        role: UserRole.STUDENT,
        isActive: true,
        instituteId: institute.id
      }
    }),
    prisma.user.create({
      data: {
        id: '78901234',
        email: 'diego.morales@estudiante.edu',
        password: passwordHash,
        firstName: 'Diego Alejandro',
        lastName: 'Morales',
        phone: '+58-424-555-0013',
        birthDate: new Date('2010-01-18'),
        gender: Gender.MASCULINO,
        role: UserRole.STUDENT,
        isActive: true,
        instituteId: institute.id
      }
    }),
    prisma.user.create({
      data: {
        id: '89012345',
        email: 'valentina.torres@estudiante.edu',
        password: passwordHash,
        firstName: 'Valentina María',
        lastName: 'Torres',
        phone: '+58-416-555-0014',
        birthDate: new Date('2009-12-05'),
        gender: Gender.FEMENINO,
        role: UserRole.STUDENT,
        isActive: true,
        instituteId: institute.id
      }
    })
  ])

  // Tutores
  const tutors = await Promise.all([
    prisma.user.create({
      data: {
        id: '90123456',
        email: 'ricardo.silva@tutor.com',
        password: passwordHash,
        firstName: 'Ricardo Antonio',
        lastName: 'Silva',
        phone: '+58-412-555-0021',
        birthDate: new Date('1975-06-20'),
        gender: Gender.MASCULINO,
        role: UserRole.TUTOR,
        isActive: true,
        instituteId: institute.id
      }
    }),
    prisma.user.create({
      data: {
        id: '01234567',
        email: 'carmen.ramirez@tutor.com',
        password: passwordHash,
        firstName: 'Carmen Elena',
        lastName: 'Ramírez',
        phone: '+58-424-555-0022',
        birthDate: new Date('1980-09-14'),
        gender: Gender.FEMENINO,
        role: UserRole.TUTOR,
        isActive: true,
        institute: { connect: { id: institute.id } }
      }
    })
  ])

  // 6. Crear Aulas
  const classrooms = await Promise.all([
    prisma.classroom.create({
      data: {
        id: 'class_5a',
        name: '5to Grado A',
        slug: generateSlug('5to Grado A'),
        section: 'A',
        grade: 5,
        capacity: 30,
        instituteId: institute.id,
        academicYearId: academicYear.id
      }
    }),
    prisma.classroom.create({
      data: {
        id: 'class_5b',
        name: '5to Grado B',
        slug: generateSlug('5to Grado B'),
        section: 'B',
        grade: 5,
        capacity: 28,
        instituteId: institute.id,
        academicYearId: academicYear.id
      }
    })
  ])

  // 7. Asignar Profesores a Aulas
  await Promise.all([
    // María González - 5to A (Profesora principal)
    prisma.teacherClassroom.create({
      data: {
        teacherId: teachers[0].id,
        classroomId: classrooms[0].id,
        isMainTeacher: true
      }
    }),
    // Carlos Martínez - 5to B (Profesor principal)
    prisma.teacherClassroom.create({
      data: {
        teacherId: teachers[1].id,
        classroomId: classrooms[1].id,
        isMainTeacher: true
      }
    })
  ])

  // 8. Asignar Estudiantes a Aulas
  await Promise.all([
    prisma.studentClassroom.create({
      data: {
        studentId: students[0].id, // Pedro
        classroomId: classrooms[0].id, // 5to A
        academicYearId: academicYear.id
      }
    }),
    prisma.studentClassroom.create({
      data: {
        studentId: students[1].id, // Sofía
        classroomId: classrooms[1].id, // 5to B
        academicYearId: academicYear.id
      }
    }),
    prisma.studentClassroom.create({
      data: {
        studentId: students[2].id, // Diego
        classroomId: classrooms[0].id, // 5to A
        academicYearId: academicYear.id
      }
    }),
    prisma.studentClassroom.create({
      data: {
        studentId: students[3].id, // Valentina
        classroomId: classrooms[1].id, // 5to B
        academicYearId: academicYear.id
      }
    })
  ])

  // 9. Asignar Materias a Aulas con Profesores
  const classroomSubjects = await Promise.all([
    // 5to Grado A - Matemáticas con María Elena
    prisma.classroomSubject.create({
      data: {
        classroomId: classrooms[0].id, // 5to A
        subjectId: subjects[0].id,     // Matemáticas
        teacherId: teachers[0].id       // María Elena
      }
    }),
    // 5to Grado A - Lenguaje con Carlos Martínez
    prisma.classroomSubject.create({
      data: {
        classroomId: classrooms[0].id, // 5to A
        subjectId: subjects[1].id,     // Lenguaje
        teacherId: teachers[1].id       // Carlos Martínez
      }
    }),
    // 5to Grado A - Ciencias con Ana López
    prisma.classroomSubject.create({
      data: {
        classroomId: classrooms[0].id, // 5to A
        subjectId: subjects[2].id,     // Ciencias Naturales
        teacherId: teachers[2].id       // Ana López
      }
    }),
    // 5to Grado A - Historia con María Elena
    prisma.classroomSubject.create({
      data: {
        classroomId: classrooms[0].id, // 5to A
        subjectId: subjects[3].id,     // Historia
        teacherId: teachers[0].id       // María Elena
      }
    }),
    // 5to Grado A - Educación Física con Carlos Martínez
    prisma.classroomSubject.create({
      data: {
        classroomId: classrooms[0].id, // 5to A
        subjectId: subjects[4].id,     // Educación Física
        teacherId: teachers[1].id       // Carlos Martínez
      }
    }),

    // 5to Grado B - Matemáticas con Carlos Martínez
    prisma.classroomSubject.create({
      data: {
        classroomId: classrooms[1].id, // 5to B
        subjectId: subjects[0].id,     // Matemáticas
        teacherId: teachers[1].id       // Carlos Martínez
      }
    }),
    // 5to Grado B - Lenguaje con Ana López
    prisma.classroomSubject.create({
      data: {
        classroomId: classrooms[1].id, // 5to B
        subjectId: subjects[1].id,     // Lenguaje
        teacherId: teachers[2].id       // Ana López
      }
    }),
    // 5to Grado B - Ciencias con María Elena
    prisma.classroomSubject.create({
      data: {
        classroomId: classrooms[1].id, // 5to B
        subjectId: subjects[2].id,     // Ciencias Naturales
        teacherId: teachers[0].id       // María Elena
      }
    }),
    // 5to Grado B - Historia con Ana López
    prisma.classroomSubject.create({
      data: {
        classroomId: classrooms[1].id, // 5to B
        subjectId: subjects[3].id,     // Historia
        teacherId: teachers[2].id       // Ana López
      }
    }),
    // 5to Grado B - Educación Física con María Elena
    prisma.classroomSubject.create({
      data: {
        classroomId: classrooms[1].id, // 5to B
        subjectId: subjects[4].id,     // Educación Física
        teacherId: teachers[0].id       // María Elena
      }
    })
  ])

  // 10. Asignar Tutores a Estudiantes

  await Promise.all([
    prisma.studentTutor.create({
      data: {
        studentId: students[0].id, // Pedro
        tutorId: tutors[0].id,     // Ricardo Silva
        relationship: 'Padre'
      }
    }),
    prisma.studentTutor.create({
      data: {
        studentId: students[1].id, // Sofía
        tutorId: tutors[1].id,     // Carmen Ramírez
        relationship: 'Madre'
      }
    })
  ])

  // 11. Crear Horarios de Clases
  const schedules = await Promise.all([
    // 5to Grado A - Lunes
    prisma.schedule.create({
      data: {
        dayOfWeek: DayOfWeek.LUNES,
        startTime: '08:00',
        endTime: '09:30',
        institute: { connect: { id: institute.id } },
        classroom: { connect: { id: classrooms[0].id } },
        subject: { connect: { id: subjects[0].id } },
        teacher: { connect: { id: teachers[0].id } }
      }
    }),
    prisma.schedule.create({
      data: {
        dayOfWeek: DayOfWeek.LUNES,
        startTime: '09:30',
        endTime: '11:00',
        institute: { connect: { id: institute.id } },
        classroom: { connect: { id: classrooms[0].id } },
        subject: { connect: { id: subjects[1].id } },
        teacher: { connect: { id: teachers[0].id } }
      }
    }),
    prisma.schedule.create({
      data: {
        dayOfWeek: DayOfWeek.LUNES,
        startTime: '11:30',
        endTime: '13:00',
        institute: { connect: { id: institute.id } },
        classroom: { connect: { id: classrooms[0].id } },
        subject: { connect: { id: subjects[2].id } },
        teacher: { connect: { id: teachers[1].id } }
      }
    }),

    // 5to Grado A - Martes
    prisma.schedule.create({
      data: {
        dayOfWeek: DayOfWeek.MARTES,
        startTime: '08:00',
        endTime: '09:30',
        institute: { connect: { id: institute.id } },
        classroom: { connect: { id: classrooms[0].id } },
        subject: { connect: { id: subjects[1].id } },
        teacher: { connect: { id: teachers[0].id } }
      }
    }),
    prisma.schedule.create({
      data: {
        dayOfWeek: DayOfWeek.MARTES,
        startTime: '09:30',
        endTime: '11:00',
        institute: { connect: { id: institute.id } },
        classroom: { connect: { id: classrooms[0].id } },
        subject: { connect: { id: subjects[0].id } },
        teacher: { connect: { id: teachers[0].id } }
      }
    }),

    // 5to Grado B - Lunes
    prisma.schedule.create({
      data: {
        dayOfWeek: DayOfWeek.LUNES,
        startTime: '08:00',
        endTime: '09:30',
        institute: { connect: { id: institute.id } },
        classroom: { connect: { id: classrooms[1].id } },
        subject: { connect: { id: subjects[0].id } },
        teacher: { connect: { id: teachers[1].id } }
      }
    }),
    prisma.schedule.create({
      data: {
        dayOfWeek: DayOfWeek.LUNES,
        startTime: '11:30',
        endTime: '13:00',
        institute: { connect: { id: institute.id } },
        classroom: { connect: { id: classrooms[1].id } },
        subject: { connect: { id: subjects[4].id } },
        teacher: { connect: { id: teachers[2].id } }
      }
    })
  ])

  // 12. Crear Actividades
  const activities = await Promise.all([
    // Actividad Global
    prisma.activity.create({
      data: {
        id: 'act_global_001',
        title: 'Día de la Independencia',
        description: 'Celebración del día de la independencia nacional',
        type: ActivityType.PROYECTO,
        scope: ActivityScope.GLOBAL,
        startDate: new Date('2024-07-05T09:00:00'),
        endDate: new Date('2024-07-05T15:00:00'),
        maxGrade: 20,
        weight: 1,
        instituteId: institute.id,
        periodId: periods[0].id,
        createdBy: admin.id
      }
    }),

    // Actividades por Aula
    prisma.activity.create({
      data: {
        id: 'act_math_exam_001',
        title: 'Examen de Matemáticas - Fracciones',
        description: 'Evaluación sobre operaciones con fracciones',
        type: ActivityType.EXAMEN,
        scope: ActivityScope.CLASSROOM,
        startDate: new Date('2024-10-15T08:00:00'),
        endDate: new Date('2024-10-15T10:00:00'),
        dueDate: new Date('2024-10-15T10:00:00'),
        maxGrade: 20,
        weight: 2,
        instituteId: institute.id,
        periodId: periods[0].id,
        subjectId: subjects[0].id, // Matemáticas
        classroomId: classrooms[0].id, // 5to A
        createdBy: teachers[0].id // María González
      }
    }),

    prisma.activity.create({
      data: {
        id: 'act_spanish_homework_001',
        title: 'Ensayo sobre la Amistad',
        description: 'Redactar un ensayo de 2 páginas sobre la importancia de la amistad',
        type: ActivityType.ENTREGA_TRABAJO,
        scope: ActivityScope.CLASSROOM,
        startDate: new Date('2024-10-01T00:00:00'),
        dueDate: new Date('2024-10-08T23:59:59'),
        maxGrade: 20,
        weight: 1.5,
        instituteId: institute.id,
        periodId: periods[0].id,
        subjectId: subjects[1].id, // Lenguaje
        classroomId: classrooms[0].id, // 5to A
        createdBy: teachers[0].id // María González
      }
    }),

    prisma.activity.create({
      data: {
        id: 'act_science_lab_001',
        title: 'Laboratorio de Plantas',
        description: 'Observación del crecimiento de plantas en diferentes condiciones',
        type: ActivityType.LABORATORIO,
        scope: ActivityScope.CLASSROOM,
        startDate: new Date('2024-10-20T11:30:00'),
        endDate: new Date('2024-10-20T13:00:00'),
        maxGrade: 20,
        weight: 1,
        instituteId: institute.id,
        periodId: periods[0].id,
        subjectId: subjects[2].id, // Ciencias
        classroomId: classrooms[0].id, // 5to A
        createdBy: teachers[1].id // Carlos Martínez
      }
    }),

    prisma.activity.create({
      data: {
        id: 'act_pe_evaluation_001',
        title: 'Evaluación Práctica de Fútbol',
        description: 'Evaluación de habilidades básicas del fútbol',
        type: ActivityType.EVALUACION,
        scope: ActivityScope.CLASSROOM,
        startDate: new Date('2024-10-25T11:30:00'),
        endDate: new Date('2024-10-25T13:00:00'),
        maxGrade: 20,
        weight: 1,
        instituteId: institute.id,
        periodId: periods[0].id,
        subjectId: subjects[4].id, // Educación Física
        classroomId: classrooms[1].id, // 5to B
        createdBy: teachers[2].id // Ana López
      }
    })
  ])

  // 13. Crear Calificaciones
  const grades = await Promise.all([
    // Pedro Silva (5to A) - Matemáticas
    prisma.grade.create({
      data: {
        score: 18.5,
        comments: 'Excelente trabajo con las fracciones',
        student: { connect: { id: students[0].id } }, // Pedro
        activity: { connect: { id: activities[1].id } }, // Examen de Matemáticas
        period: { connect: { id: periods[0].id } },
        subject: { connect: { id: subjects[0].id } }, // Matemáticas
        teacher: { connect: { id: teachers[0].id } } // María González
      }
    }),

    // Pedro Silva (5to A) - Lenguaje
    prisma.grade.create({
      data: {
        score: 16.0,
        comments: 'Buen ensayo, mejorar la ortografía',
        student: { connect: { id: students[0].id } }, // Pedro
        activity: { connect: { id: activities[2].id } }, // Ensayo sobre la Amistad
        period: { connect: { id: periods[0].id } },
        subject: { connect: { id: subjects[1].id } }, // Lenguaje
        teacher: { connect: { id: teachers[0].id } } // María González
      }
    }),

    // Pedro Silva (5to A) - Ciencias
    prisma.grade.create({
      data: {
        score: 19.0,
        comments: 'Excelente observación y reporte del experimento',
        student: { connect: { id: students[0].id } }, // Pedro
        activity: { connect: { id: activities[3].id } }, // Laboratorio de Plantas
        period: { connect: { id: periods[0].id } },
        subject: { connect: { id: subjects[2].id } }, // Ciencias
        teacher: { connect: { id: teachers[1].id } } // Carlos Martínez
      }
    }),

    // Diego Morales (5to A) - Matemáticas
    prisma.grade.create({
      data: {
        score: 15.5,
        comments: 'Necesita repasar las operaciones mixtas',
        student: { connect: { id: students[2].id } }, // Diego
        activity: { connect: { id: activities[1].id } }, // Examen de Matemáticas
        period: { connect: { id: periods[0].id } },
        subject: { connect: { id: subjects[0].id } }, // Matemáticas
        teacher: { connect: { id: teachers[0].id } } // María González
      }
    }),

    // Sofía Ramírez (5to B) - Educación Física
    prisma.grade.create({
      data: {
        score: 17.5,
        comments: 'Muy buena técnica en el manejo del balón',
        student: { connect: { id: students[1].id } }, // Sofía
        activity: { connect: { id: activities[4].id } }, // Evaluación de Fútbol
        period: { connect: { id: periods[0].id } },
        subject: { connect: { id: subjects[4].id } }, // Educación Física
        teacher: { connect: { id: teachers[2].id } } // Ana López
      }
    })
  ])

  // 14. Crear Registros de Asistencia
  const attendanceRecords = await Promise.all([
    // Pedro Silva - Semana 1
    prisma.dailyAttendance.create({
      data: {
        date: new Date('2024-09-02'),
        status: AttendanceStatus.PRESENT,
        studentId: students[0].id, // Pedro
        classroomId: classrooms[0].id, // 5to A
        teacherId: teachers[0].id // María González
      }
    }),
    prisma.dailyAttendance.create({
      data: {
        date: new Date('2024-09-03'),
        status: AttendanceStatus.PRESENT,
        studentId: students[0].id, // Pedro
        classroomId: classrooms[0].id, // 5to A
        teacherId: teachers[0].id // María González
      }
    }),
    prisma.dailyAttendance.create({
      data: {
        date: new Date('2024-09-04'),
        status: AttendanceStatus.LATE,
        comments: 'Llegó 15 minutos tarde',
        studentId: students[0].id, // Pedro
        classroomId: classrooms[0].id, // 5to A
        teacherId: teachers[0].id // María González
      }
    }),

    // Diego Morales - Semana 1
    prisma.dailyAttendance.create({
      data: {
        date: new Date('2024-09-02'),
        status: AttendanceStatus.PRESENT,
        studentId: students[2].id, // Diego
        classroomId: classrooms[0].id, // 5to A
        teacherId: teachers[0].id // María González
      }
    }),
    prisma.dailyAttendance.create({
      data: {
        date: new Date('2024-09-03'),
        status: AttendanceStatus.ABSENT,
        comments: 'Cita médica justificada',
        studentId: students[2].id, // Diego
        classroomId: classrooms[0].id, // 5to A
        teacherId: teachers[0].id // María González
      }
    }),

    // Sofía Ramírez - Semana 1
    prisma.dailyAttendance.create({
      data: {
        date: new Date('2024-09-02'),
        status: AttendanceStatus.PRESENT,
        studentId: students[1].id, // Sofía
        classroomId: classrooms[1].id, // 5to B
        teacherId: teachers[1].id // Carlos Martínez
      }
    }),
    prisma.dailyAttendance.create({
      data: {
        date: new Date('2024-09-03'),
        status: AttendanceStatus.PRESENT,
        studentId: students[1].id, // Sofía
        classroomId: classrooms[1].id, // 5to B
        teacherId: teachers[1].id // Carlos Martínez
      }
    }),

    // Valentina Torres - Semana 1
    prisma.dailyAttendance.create({
      data: {
        date: new Date('2024-09-02'),
        status: AttendanceStatus.PRESENT,
        studentId: students[3].id, // Valentina
        classroomId: classrooms[1].id, // 5to B
        teacherId: teachers[2].id // Ana López
      }
    })
  ])

  console.log('✅ Seed completado exitosamente!')
  console.log('\n📊 Datos creados:')
  console.log(`- 1 Instituto: ${institute.name}`)
  console.log(`- 1 Año académico: ${academicYear.name}`)
  console.log(`- ${periods.length} Períodos`)
  console.log(`- ${subjects.length} Materias`)
  console.log(`- 7 Usuarios total:`)
  console.log(`  • 1 Administrador: ${admin.firstName} ${admin.lastName}`)
  console.log(`  • 3 Profesores: ${teachers.map(t => t.firstName).join(', ')}`)
  console.log(`  • 4 Estudiantes: ${students.map(s => s.firstName).join(', ')}`)
  console.log(`  • 2 Tutores: ${tutors.map(t => t.firstName).join(', ')}`)
  console.log(`- ${classrooms.length} Aulas`)
  console.log(`- ${schedules.length} Horarios`)
  console.log(`- ${activities.length} Actividades`)
  console.log(`- ${grades.length} Calificaciones`)
  console.log(`- ${attendanceRecords.length} Registros de asistencia`)

  console.log('\n🔑 Credenciales de acceso:')
  console.log('📧 Todos los usuarios tienen la contraseña: 123456')
  console.log('\n👑 Administrador:')
  console.log(`   Email: ${admin.email}`)
  console.log(`   Cédula: ${admin.id}`)
  console.log('\n👨‍🏫 Profesores:')
  teachers.forEach(teacher => {
    console.log(`   ${teacher.firstName}: ${teacher.email} (Cédula: ${teacher.id})`)
  })
  console.log('\n👨‍🎓 Estudiantes:')
  students.forEach(student => {
    console.log(`   ${student.firstName}: ${student.email} (Cédula: ${student.id})`)
  })
  console.log('\n👨‍👩‍👧‍👦 Tutores:')
  tutors.forEach(tutor => {
    console.log(`   ${tutor.firstName}: ${tutor.email} (Cédula: ${tutor.id})`)
  })
}

main()
  .catch((e) => {
    console.error('❌ Error durante el seed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })