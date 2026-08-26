const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'services', 'users.service.ts');

// Read the file
let content = fs.readFileSync(filePath, 'utf8');

// Find and replace the getUserById method
const oldMethod = `  async getUserById(id: string, prisma: any) {
    return prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        phone: true,
        address: true,
        birthDate: true,
        gender: true,
        avatar: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      }
    });
  }`;

const newMethod = `  async getUserById(id: string, prisma: any) {
    return prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        phone: true,
        address: true,
        birthDate: true,
        gender: true,
        avatar: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        // Include teacher classrooms for teacher profiles
        teacherClassrooms: {
          select: {
            isMainTeacher: true,
            classroom: {
              select: {
                id: true,
                name: true,
                slug: true,
                grade: true,
                section: true,
                academicYear: {
                  select: {
                    id: true,
                    name: true
                  }
                }
              }
            }
          }
        }
      }
    });
  }`;

// Replace
content = content.replace(oldMethod, newMethod);

// Write back
fs.writeFileSync(filePath, content, 'utf8');

console.log('✅ Successfully updated users.service.ts');
