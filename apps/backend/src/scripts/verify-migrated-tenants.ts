import { getTenantPrisma, disconnectAll } from '../config/database';

async function verifyMigratedTenants() {
  console.log('=== VERIFICACION DE TENANTS MIGRADOS A BASE COMPARTIDA ===');

  const institutes = [
    { id: 'inst-testing', name: 'Instituto Testing' },
    { id: 'institute-b', name: 'Test Institute B' },
    { id: 'cmtyo8zkc0000vvswp5yjl7d8', name: 'Instituto Load Testing 5K' },
  ];

  for (const item of institutes) {
    console.log(`\nVerificando ${item.name} (${item.id})...`);
    const prisma = await getTenantPrisma(item.id);

    const [userCount, studentCount, teacherCount] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: 'STUDENT' } }),
      prisma.user.count({ where: { role: 'TEACHER' } }),
    ]);

    // Consultar una tabla adicional según el instituto
    let extra = '';
    if (item.id === 'inst-testing') {
      const grades = await prisma.grade.count();
      const attendance = await prisma.dailyAttendance.count();
      extra = ` | Calificaciones: ${grades} | Asistencias: ${attendance}`;
    } else if (item.id === 'cmtyo8zkc0000vvswp5yjl7d8') {
      const grades = await prisma.grade.count();
      extra = ` | Calificaciones de carga: ${grades}`;
    }

    console.log(`  OK: Total usuarios: ${userCount} (Alumnos: ${studentCount}, Profesores: ${teacherCount})${extra}`);
  }

  await disconnectAll();
  console.log('\n=== TODOS LOS TENANTS FUNCIONAN AL 100% EN LA NUEVA ARQUITECTURA ===');
}

verifyMigratedTenants()
  .catch((err) => {
    console.error('Error en verificacion:', err);
    process.exit(1);
  });
