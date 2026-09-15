const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient({
  datasources: { db: { url: 'postgresql://postgres:82nQKb95S7wNDmuxyvIG6dOYkZUo@localhost:5432/tenant_instituto_testing' } }
});

async function main() {
  const newHash = await bcrypt.hash('123456', 10);
  await prisma.user.updateMany({
    data: { password: newHash, isActive: true }
  });
  console.log('✅ Contraseñas reseteadas a 123456');

  const admin = await prisma.user.findUnique({ where: { email: 'admin@tuapp.com' } });
  const match = await bcrypt.compare('123456', admin.password);
  console.log('Admin:', admin.email, 'isActive:', admin.isActive, 'Password Match:', match);
}

main().finally(() => prisma.$disconnect());
