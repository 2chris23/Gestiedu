export interface StudentDashboardStats {
    student: {
        id: string;
        fullName: string;
        avatar: string | null;
        section: string; // Backward compatibility
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
    academicHistory: {
        yearName: string;
        section: string;
        finalGrade: number;
        status: string;
    }[];
    subjects: {
        id: string;
        name: string;
        average: number;
        color: string;
        status?: string; // "Aprobado" | "Reprobado"
    }[];
    recentObservations: {
        id: string;
        title: string;
        description?: string;
        type: string; // "POSITIVE" | "NEGATIVE"
        date: string;
        teacher?: string;
        classroomId?: string;
        classroomName?: string;
        subjectId?: string;
        subjectName?: string;
        subjectColor?: string;
        classSessionId?: string;
    }[];
}
