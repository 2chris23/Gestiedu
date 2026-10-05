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
        /** Promedio del ciclo activo (nivel 6, MAPA §3), o null sin ciclo o sin notas. */
        promedioGeneral?: number | null;
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
    todayAttendance?: {
        total: number;
        present: number;
        absent: number;
        late: number;
        excused: number;
        percentage: number;
        dateLabel: string;
    };
    atRiskStudentsTop?: Array<{
        id: string;
        name: string;
        classroomName: string;
        failedCount: number;
    }>;
    gradeCapacity?: Array<{
        grade: number;
        name: string;
        enrolled: number;
        capacity: number;
        percentage: number;
    }>;
    periodClosure?: {
        periodName: string | null;
        daysLeft: number | null;
        endDate: string | null;
    } | null;
    upcomingEvents?: Array<{
        id: string;
        title: string;
        description?: string | null;
        date: string;
        startTime?: string | null;
        endTime?: string | null;
        scope?: string | null;
    }>;
    eventsCalendar?: {
        currentPeriod?: {
            id: string;
            name: string;
            startDate: string;
            endDate: string;
            daysLeft: number | null;
        } | null;
        events: Array<{
            id: string;
            title: string;
            description?: string | null;
            date: string;
            startTime?: string | null;
            endTime?: string | null;
            scope?: string | null;
            isHoliday?: boolean;
        }>;
    };
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
            academicYearName?: string | null;
            academicYearId?: string | null;
        } | null;
    };
    kpis: {
        globalAverage: number;
        failedSubjects: number;
        /** Asistencia del LAPSO en curso, no de toda la vida escolar del alumno. */
        attendancePercentage: number;
        /** La misma cifra, pero del ciclo escolar completo. */
        attendancePercentageCiclo: number;
        /** Observaciones del lapso en curso. */
        totalObservations: number;
        /** Observaciones de todo el ciclo. */
        totalObservationsCiclo: number;
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
        classroomId?: string | null;
        shift?: string | null;
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
