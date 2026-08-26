const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', '..', 'web', 'src', 'types', 'user.ts');

// Read the file
let content = fs.readFileSync(filePath, 'utf8');

// Find and replace the User interface
const oldInterface = `export interface User {
    id: string; // Cédula o Identificador único
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    phone?: string;
    address?: string;
    birthDate?: string | Date;
    gender?: Gender;
    avatar?: string;
    isActive: boolean;
    createdAt: string | Date;
}`;

const newInterface = `export interface User {
    id: string; // Cédula o Identificador único
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    phone?: string;
    address?: string;
    birthDate?: string | Date;
    gender?: Gender;
    avatar?: string;
    isActive: boolean;
    createdAt: string | Date;
    // Teacher-specific fields
    teacherClassrooms?: Array<{
        isMainTeacher: boolean;
        classroom: {
            id: string;
            name: string;
            slug: string;
            grade: number;
            section: string;
            academicYear: {
                id: string;
                name: string;
            };
        };
    }>;
}`;

// Replace
content = content.replace(oldInterface, newInterface);

// Write back
fs.writeFileSync(filePath, content, 'utf8');

console.log('✅ Successfully updated user.ts with teacherClassrooms type');
