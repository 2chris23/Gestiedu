export type UserRole = 'ADMIN' | 'TEACHER' | 'STUDENT' | 'TUTOR';
export type Gender = 'MASCULINO' | 'FEMENINO' | 'OTRO';

export interface User {
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
    // Student-specific fields (retornadas por GET /users/:id)
    studentCode?: string;
    classroom?: {
        id: string;
        name: string;
        grade: number;
        section: string;
        teacher?: {
            id: string;
            firstName: string;
            lastName: string;
        };
    };
    // Teacher-specific fields
    specialization?: string;
    subjectTeachings?: Array<{
        subject: {
            name: string;
            code?: string;
        };
        classroom: {
            name: string;
            section: string;
            academicYear: {
                id: string;
                name: string;
            };
        };
    }>;
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
                status: string;
                startDate: string;
                endDate: string;
            };
        };
    }>;
}

export interface CreateUserData {
    id: string;
    email: string;
    password?: string; // Optional in editing, required in creation logic usually
    firstName: string;
    lastName: string;
    role: UserRole;
    phone?: string;
    address?: string;
    gender?: Gender;
    birthDate?: string | Date;
}
