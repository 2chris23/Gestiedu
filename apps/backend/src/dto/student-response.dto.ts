// DTOs para respuestas de estudiantes optimizadas

export interface StudentListItemDto {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    avatar: string | null;
    studentCode: string | null;
    isActive: boolean;
    classroom: {
        id: string;
        name: string;
        grade: number;
        section: string;
    } | null;
    // Estadísticas calculadas (no raw data)
    average: number;
    attendancePercentage: number;
}

export interface AvailableStudentDto {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    studentCode: string | null;
    avatar: string | null;
    currentStatus: string;
    classroom?: {
        id: string;
        grade: number;
        section: string;
        academicYear?: {
            name: string;
        };
    } | null;
}

export interface StudentDashboardDto {
    student: {
        id: string;
        fullName: string;
        avatar: string | null;
        currentSection: {
            id: string;
            name: string;
            guideTeacher: string | null;
        } | null;
    };
    kpis: {
        globalAverage: number;
        failedSubjects: number;
        attendancePercentage: number;
        totalObservations: number;
    };
    subjects: Array<{
        id: string;
        name: string;
        average: number;
        color: string;
        status: string;
    }>;
    academicHistory: Array<{
        yearName: string;
        section: string;
        finalGrade: number;
        status: string;
    }>;
    recentObservations: Array<{
        id: string;
        title: string;
        type: string;
        date: string;
    }>;
}

export interface PaginatedStudentsResponse {
    students: StudentListItemDto[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
    };
}
