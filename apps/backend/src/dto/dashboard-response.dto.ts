// DTOs para respuestas de dashboards

export interface AdminDashboardDto {
    kpis: {
        totalStudents: number;
        totalTeachers: number;
        totalClassrooms: number;
        activeAcademicYear: string | null;
    };
    stats: {
        averageAttendance: number;
        studentsAtRisk: number;
        pendingActivities: number;
    };
    recentActivity: Array<{
        id: string;
        action: string;
        entity: string;
        timestamp: string;
        user: string | null;
    }>;
    alerts: Array<{
        id: string;
        type: string;
        severity: string;
        message: string;
        createdAt: string;
    }>;
}

export interface TeacherDashboardDto {
    teacher: {
        id: string;
        fullName: string;
        specialization: string | null;
    };
    classrooms: Array<{
        id: string;
        name: string;
        grade: number;
        section: string;
        studentCount: number;
    }>;
    upcomingActivities: Array<{
        id: string;
        title: string;
        type: string;
        dueDate: string;
        classroom: string;
        subject: string;
    }>;
    stats: {
        totalStudents: number;
        totalClassrooms: number;
        pendingGrades: number;
    };
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
    periodAverages: Array<{
        periodId: string;
        periodName: string;
        average: number;
    }>;
    upcomingActivities: Array<{
        id: string;
        title: string;
        subject: string;
        dueDate: string;
        type: string;
    }>;
    recentObservations: Array<{
        id: string;
        title: string;
        type: string;
        date: string;
    }>;
}

export interface TutorDashboardDto {
    tutor: {
        id: string;
        fullName: string;
    };
    children: Array<{
        id: string;
        fullName: string;
        avatar: string | null;
        classroom: string | null;
        average: number;
        attendancePercentage: number;
        relationship: string;
    }>;
    alerts: Array<{
        studentId: string;
        studentName: string;
        type: string;
        message: string;
        date: string;
    }>;
}
