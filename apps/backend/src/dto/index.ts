// TypeBox DTOs (se mantienen)
export * from './activity.dto';
export * from './schedule.dto';
export * from './report.dto';

// Response DTOs
export * from './dashboard-response.dto';
// student-response.dto re-exporta selectivamente para evitar conflicto
// con StudentDashboardDto que ya existe en dashboard-response.dto
export {
    StudentListItemDto,
    AvailableStudentDto,
    PaginatedStudentsResponse,
} from './student-response.dto';

// Los DTOs de class-validator fueron eliminados.
// Los tipos inferidos de Zod ahora se exportan desde '../utils/validators'.
