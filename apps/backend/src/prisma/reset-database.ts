// apps/backend/src/prisma/reset-database.ts

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function resetDatabase() {
  console.log('🔄 Iniciando reset de la base de datos...')
  
  try {
    // Eliminar todos los datos en orden correcto (respetando foreign keys)
    console.log('🗑️ Eliminando datos existentes...')
    
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
    
    console.log('✅ Datos eliminados exitosamente')
    
    // Reiniciar secuencias si las hubiera (PostgreSQL)
    console.log('🔄 Reiniciando secuencias...')
    
    // No necesitamos reiniciar secuencias porque usamos CUIDs, no SERIAL
    
    console.log('✅ Base de datos reseteada correctamente')
    console.log('💡 Ejecuta "npm run db:seed" para poblar con datos de prueba')
    
  } catch (error) {
    console.error('❌ Error al resetear la base de datos:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  resetDatabase()
    .then(() => {
      console.log('🎉 Reset completado exitosamente!')
      process.exit(0)
    })
    .catch((error) => {
      console.error('💥 Error durante el reset:', error)
      process.exit(1)
    })
}

export { resetDatabase }