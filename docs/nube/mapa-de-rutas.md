{"level":30,"time":1790287422228,"pid":9383,"hostname":"vm","msg":"Se acepta la cabecera de dirección solo desde: 127.0.0.1, ::1, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, fc00::/7."}
⚠️  Skipping Redis connection in test environment
{"level":"info","message":"Tope de carga activo","retrasoMaximoMs":1000,"timestamp":"2026-09-24 22:03:42","tope":1500}
{"level":"info","message":"Skipping academic year sync in test environment","timestamp":"2026-09-24 22:03:42"}
{"level":"info","message":"Academic year auto-sync job configured","timestamp":"2026-09-24 22:03:42"}
# Mapa de rutas (sacado del servidor)

Generado por `src/scripts/mapa-de-rutas.ts`. 286 rutas bajo `/api`.
Alcance = guardias de alcance que aparecen en el controlador o en el servicio al que llama
(heurística de código: lo que cuenta es la prueba `quien-puede-que.test.ts`).

| Método | Ruta | authenticate | Guardia de rol | Guardia de alcance |
|---|---|---|---|---|
| GET | `/api` | **NO** | — | — |
| GET | `/api/academic-years` | sí | — | — |
| POST | `/api/academic-years` | sí | `requireAdmin` | — |
| DELETE | `/api/academic-years/:id` | sí | `requireAdmin` | — |
| PUT | `/api/academic-years/:id` | sí | `requireAdmin` | — |
| POST | `/api/academic-years/:id/close` | sí | `requireAdmin` | — |
| POST | `/api/academic-years/:id/close/prepare` | sí | `requireAdmin` | — |
| GET | `/api/academic-years/:id/promotion-context` | sí | `requireAdmin` | — |
| POST | `/api/academic-years/:id/promotion/strategy-preview` | sí | `requireAdmin` | `assertCanSeeStudent` |
| GET | `/api/academic-years/:id/stats` | sí | — | — |
| PUT | `/api/academic-years/:id/status` | sí | `requireAdmin` | — |
| GET | `/api/academic-years/active` | sí | — | — |
| GET | `/api/academic-years/close/strategies` | sí | `requireAdmin` | — |
| GET | `/api/activities` | sí | `requireTeacher` | — |
| POST | `/api/activities` | sí | `requireTeacher` | — |
| DELETE | `/api/activities/:id` | sí | `requireTeacher` | `assertClassroomScope` |
| GET | `/api/activities/:id` | sí | — | — |
| PUT | `/api/activities/:id` | sí | `requireTeacher` | — |
| GET | `/api/activities/classroom/:classroomId` | sí | — | — |
| GET | `/api/activities/student/my-activities` | sí | `requireStudent` | — |
| GET | `/api/activities/subject/:subjectId` | sí | — | — |
| GET | `/api/app-movil/:paquete/apk` | **NO** | — | — |
| GET | `/api/app-movil/:paquete/version` | **NO** | — | — |
| DELETE | `/api/asistencia-qr/aparato/:studentId` | sí | `requireAdmin` | `assertClassroomScope` `canSeeStudent` `teacherClassroomIds` |
| GET | `/api/asistencia-qr/aparato/:studentId` | sí | `requireAdmin` | — |
| GET | `/api/asistencia-qr/configuracion` | sí | — | `assertClassroomScope` |
| PUT | `/api/asistencia-qr/configuracion` | sí | `requireAdmin` | `assertClassroomScope` |
| POST | `/api/asistencia-qr/escanear` | sí | `requireRoles(…)` | `assertClassroomScope` |
| GET | `/api/asistencia-qr/mi-codigo` | sí | `requireRoles(…)` | `assertClassroomScope` |
| POST | `/api/asistencia-qr/pases` | sí | `requireTeacher` | `assertClassroomScope` |
| GET | `/api/asistencia-qr/pases/:id` | sí | `requireTeacher` | `assertClassroomScope` |
| POST | `/api/asistencia-qr/pases/:id/cerrar` | sí | `requireTeacher` | `assertClassroomScope` |
| POST | `/api/asistencia-qr/pases/:id/escanear-alumno` | sí | `requireTeacher` | `assertClassroomScope` |
| POST | `/api/asistencia-qr/pases/:id/faro` | sí | `requireTeacher` | `assertClassroomScope` |
| POST | `/api/asistencia-qr/pases/:id/registros/:registroId/aprobar` | sí | `requireTeacher` | `assertClassroomScope` |
| POST | `/api/asistencia-qr/pases/:id/registros/:registroId/quitar` | sí | `requireTeacher` | `assertClassroomScope` |
| POST | `/api/attendance` | sí | `requireTeacher` `verifyInstitute` | `assertClassroomScope` |
| DELETE | `/api/attendance/:id` | sí | `requireTeacher` `verifyInstitute` | `assertClassroomScope` `assertCanSeeClassroom` `assertCanSeeStudent` |
| GET | `/api/attendance/:id` | sí | `verifyInstitute` | `assertClassroomScope` `canSeeStudent` |
| PUT | `/api/attendance/:id` | sí | `requireTeacher` `verifyInstitute` | `assertClassroomScope` |
| POST | `/api/attendance/bulk` | sí | `requireTeacher` `verifyInstitute` | `assertClassroomScope` |
| GET | `/api/attendance/classroom/:classroomId` | sí | `verifyInstitute` | `assertClassroomScope` |
| GET | `/api/attendance/classroom/:classroomId/date/:date` | sí | `verifyInstitute` | — |
| GET | `/api/attendance/student/:studentId` | sí | `verifyInstitute` | `canSeeStudent` |
| GET | `/api/attendance/summary/classroom/:classroomId` | sí | `verifyInstitute` | — |
| GET | `/api/attendance/summary/student/:studentId` | sí | `verifyInstitute` | `canSeeStudent` |
| POST | `/api/auth/anular-llave-del-telefono` | sí | — | — |
| POST | `/api/auth/change-password` | sí | — | — |
| POST | `/api/auth/entrar-con-el-telefono` | **NO** | `userRateLimit` | — |
| POST | `/api/auth/llave-del-telefono` | sí | — | — |
| POST | `/api/auth/login` | **NO** | `userRateLimit` | — |
| POST | `/api/auth/logout` | sí | — | — |
| GET | `/api/auth/profile` | sí | — | — |
| POST | `/api/auth/refresh-token` | **NO** | `userRateLimit` | — |
| GET | `/api/auth/sessions` | sí | — | — |
| DELETE | `/api/auth/sessions/:sessionId` | sí | — | — |
| DELETE | `/api/auth/sessions/others` | sí | — | — |
| GET | `/api/class-replacements` | sí | — | `assertCanSeeClassroom` |
| POST | `/api/class-replacements` | sí | `requireAdmin` | — |
| DELETE | `/api/class-replacements/:id` | sí | `requireAdmin` | `assertClassroomScope` `assertCanSeeClassroom` `assertCanSeeStudent` |
| GET | `/api/classrooms` | sí | — | `canSeeClassroom` |
| POST | `/api/classrooms` | sí | `requireAdmin` | — |
| POST | `/api/classrooms/:classroomId/students` | sí | `requireTeacher` | — |
| DELETE | `/api/classrooms/:classroomId/students/:studentId` | sí | `requireTeacher` | — |
| GET | `/api/classrooms/:classroomId/subjects` | sí | `requireTeacher` | — |
| POST | `/api/classrooms/:classroomId/subjects` | sí | `requireTeacher` | — |
| GET | `/api/classrooms/:classroomId/subjects-available` | sí | `requireTeacher` | — |
| DELETE | `/api/classrooms/:classroomId/subjects/:subjectId` | sí | `requireAdmin` | `assertClassroomScope` `assertCanSeeClassroom` `assertCanSeeStudent` |
| GET | `/api/classrooms/:classroomId/subjects/:subjectId` | sí | `requireTeacher` | — |
| PATCH | `/api/classrooms/:classroomId/subjects/:subjectId` | sí | `requireAdmin` | — |
| PATCH | `/api/classrooms/:classroomId/subjects/:subjectId/teacher` | sí | `requireAdmin` | — |
| GET | `/api/classrooms/:classroomId/subjects/:subjectId/teacher-history` | sí | `requireTeacher` | — |
| DELETE | `/api/classrooms/:id` | sí | `requireAdmin` | `assertClassroomScope` `assertCanSeeClassroom` `assertCanSeeStudent` |
| GET | `/api/classrooms/:id` | sí | — | — |
| PUT | `/api/classrooms/:id` | sí | `requireAdmin` | — |
| GET | `/api/classrooms/:id/stats` | sí | — | — |
| PATCH | `/api/classrooms/:id/teacher` | sí | `requireAdmin` | — |
| GET | `/api/classrooms/slug/:slug` | sí | — | — |
| GET | `/api/dashboard` | sí | — | — |
| GET | `/api/dashboard/activity/recent` | sí | — | — |
| GET | `/api/dashboard/admin` | sí | `requireAdmin` | — |
| GET | `/api/dashboard/events/upcoming` | sí | — | — |
| GET | `/api/dashboard/metrics/performance` | sí | `requireTeacher` | `assertClassroomScope` `assertCanSeeClassroom` |
| GET | `/api/dashboard/stats/institute` | sí | `requireAdmin` | — |
| GET | `/api/dashboard/stats/system` | sí | `requireAdmin` | — |
| GET | `/api/dashboard/student` | sí | `requireStudent` | — |
| GET | `/api/dashboard/teacher` | sí | `requireTeacher` | — |
| GET | `/api/dashboard/tutor` | sí | `requireTutor` | — |
| POST | `/api/evaluation-plan/activities/batch` | sí | — | `assertClassroomScope` |
| GET | `/api/evaluation-plan/calendar-data` | sí | — | `assertCanSeeClassroom` |
| POST | `/api/evaluation-plan/copy` | sí | — | `assertClassroomScope` |
| GET | `/api/evaluation-plan/copy-targets` | sí | — | `assertClassroomScope` |
| GET | `/api/evaluation-plan/metadata` | sí | — | — |
| POST | `/api/evaluation-plan/metadata` | sí | — | `assertClassroomScope` |
| POST | `/api/evaluation-plan/parse-word` | sí | `requireTeacher` | `canSeeStudent` |
| GET | `/api/evaluation-plan/rows` | sí | — | `assertClassroomScope` |
| POST | `/api/evaluation-plan/rows/batch` | sí | — | `assertClassroomScope` |
| GET | `/api/events` | sí | `requireTeacher` | — |
| POST | `/api/events` | sí | `requireAdmin` | — |
| DELETE | `/api/events/:id` | sí | `requireAdmin` | — |
| PUT | `/api/events/:id` | sí | `requireAdmin` | — |
| GET | `/api/events/day` | sí | `requireTeacher` | — |
| POST | `/api/events/preview` | sí | `requireAdmin` | — |
| GET | `/api/grades` | sí | `requireTeacher` | — |
| POST | `/api/grades` | sí | `requireTeacher` | — |
| DELETE | `/api/grades/:id` | sí | `requireTeacher` | `assertClassroomScope` `assertCanSeeClassroom` `assertCanSeeStudent` |
| GET | `/api/grades/:id` | sí | — | `assertClassroomScope` `canSeeStudent` `studentTutor` `tutorId` |
| PUT | `/api/grades/:id` | sí | `requireTeacher` | — |
| GET | `/api/grades/activity/:activityId` | sí | `requireTeacher` | — |
| POST | `/api/grades/bulk` | sí | `requireTeacher` | — |
| GET | `/api/grades/export/:format` | sí | `requireTeacher` | — |
| GET | `/api/grades/stats` | sí | `requireTeacher` | — |
| GET | `/api/grades/student/:studentId` | sí | `requireSelfOrAdmin` | — |
| GET | `/api/grades/student/my-grades` | sí | `requireStudent` | — |
| GET | `/api/grades/subject/:subjectId` | sí | `requireTeacher` | — |
| GET | `/api/health` | **NO** | — | — |
| GET | `/api/institutes/:id/config` | sí | `requireAdmin` | — |
| PUT | `/api/institutes/:id/config` | sí | `requireAdmin` | — |
| PATCH | `/api/institutes/colors` | sí | `requireAdmin` | — |
| GET | `/api/institutes/current/academic-config` | sí | — | — |
| PUT | `/api/institutes/current/academic-config` | sí | `requireAdmin` | — |
| GET | `/api/institutes/current/config` | **NO** | — | — |
| PUT | `/api/institutes/current/config` | sí | `requireAdmin` | — |
| GET | `/api/institutes/current/config/full` | sí | — | — |
| GET | `/api/institutes/current/icono` | **NO** | — | — |
| GET | `/api/institutes/current/info` | sí | — | — |
| POST | `/api/institutes/logos` | sí | `requireAdmin` | — |
| GET | `/api/institutes/public/:slug` | **NO** | — | — |
| GET | `/api/institutes/subject-palette` | sí | — | — |
| POST | `/api/institutes/subject-palette` | sí | `requireAdmin` | — |
| DELETE | `/api/institutes/subject-palette/:index` | sí | `requireAdmin` | — |
| PATCH | `/api/institutes/subject-palette/:index` | sí | `requireAdmin` | — |
| GET | `/api/instituto/:slug/info` | **NO** | — | — |
| GET | `/api/notifications` | sí | `requireTeacher` | — |
| POST | `/api/notifications` | sí | `requireTeacher` | — |
| DELETE | `/api/notifications/:id` | sí | `requireAdmin` | — |
| GET | `/api/notifications/:id` | sí | — | — |
| PUT | `/api/notifications/:id` | sí | `requireAdmin` | — |
| PATCH | `/api/notifications/:id/read` | sí | — | — |
| POST | `/api/notifications/bulk` | sí | `requireTeacher` | — |
| PATCH | `/api/notifications/mark-all-read` | sí | — | — |
| GET | `/api/notifications/my-notifications` | sí | — | — |
| GET | `/api/notifications/my-notifications/stats` | sí | — | — |
| GET | `/api/notifications/stats` | sí | `requireAdmin` | — |
| POST | `/api/notifications/system` | sí | `requireAdmin` | — |
| GET | `/api/notifications/user/:userId` | sí | `requireTeacher` | — |
| POST | `/api/observations` | sí | `requireTeacher` | `assertClassroomScope` |
| DELETE | `/api/observations/:id` | sí | `requireTeacher` | `assertClassroomScope` |
| GET | `/api/observations/classroom/:classroomId` | sí | — | `assertClassroomScope` |
| GET | `/api/observations/session/:sessionId` | sí | — | `assertClassroomScope` |
| GET | `/api/observations/student/:studentId` | sí | — | `assertCanSeeStudent` |
| GET | `/api/observations/subject/:classroomId/:subjectId` | sí | — | `assertClassroomScope` |
| POST | `/api/payments/:paymentId/annul` | sí | `requireAdmin` | — |
| GET | `/api/payments/:paymentId/receipt` | sí | — | `studentTutor` `tutorId` |
| GET | `/api/payments/my-children` | sí | — | `studentTutor` `tutorId` |
| GET | `/api/payments/overview` | sí | `requireAdmin` | `studentTutor` `tutorId` |
| GET | `/api/payments/settings` | sí | — | — |
| PUT | `/api/payments/settings` | sí | `requireAdmin` | — |
| GET | `/api/payments/students/:studentId` | sí | — | `studentTutor` `tutorId` |
| POST | `/api/payments/students/:studentId/payments` | sí | `requireAdmin` | — |
| PUT | `/api/payments/students/:studentId/plan` | sí | `requireAdmin` | — |
| GET | `/api/reports/analytics/grades` | sí | `requireTeacher` | — |
| GET | `/api/reports/attendance` | sí | `requireTeacher` | — |
| POST | `/api/reports/grades` | sí | `requireTeacher` | — |
| GET | `/api/reports/student/:studentId` | sí | `exigirVerAlumno` | `assertCanSeeClassroom` |
| GET | `/api/schedules` | sí | `requireTeacher` | — |
| POST | `/api/schedules` | sí | `requireTeacher` | — |
| DELETE | `/api/schedules/:id` | sí | `requireTeacher` | `assertClassroomScope` `assertCanSeeClassroom` `assertCanSeeStudent` |
| GET | `/api/schedules/:id` | sí | — | — |
| PUT | `/api/schedules/:id` | sí | `requireTeacher` | — |
| DELETE | `/api/schedules/blocks/:id` | sí | `requireAdmin` | `assertClassroomScope` `assertCanSeeClassroom` `assertCanSeeStudent` |
| PUT | `/api/schedules/blocks/:id` | sí | `requireAdmin` | — |
| GET | `/api/schedules/classroom/:classroomId` | sí | — | `assertCanSeeClassroom` |
| POST | `/api/schedules/classroom/:classroomId/auto-generate` | sí | `requireAdmin` | — |
| POST | `/api/schedules/classroom/:classroomId/blocks` | sí | `requireAdmin` | — |
| POST | `/api/schedules/classroom/:classroomId/bulk` | sí | `requireAdmin` | — |
| GET | `/api/schedules/classroom/:classroomId/history` | sí | `requireTeacher` | — |
| DELETE | `/api/schedules/personal-blocks/:id` | sí | `requireAdmin` | — |
| PUT | `/api/schedules/personal-blocks/:id` | sí | `requireAdmin` | — |
| GET | `/api/schedules/summary/:academicYearId` | sí | `requireTeacher` | — |
| GET | `/api/schedules/teacher/:teacherId` | sí | `requireTeacher` | — |
| POST | `/api/schedules/teacher/:teacherId/auto-fill` | sí | `requireAdmin` | — |
| GET | `/api/schedules/teacher/:teacherId/blocks` | sí | `requireTeacher` | — |
| POST | `/api/schedules/teacher/:teacherId/bulk` | sí | `requireAdmin` | — |
| POST | `/api/schedules/teacher/:teacherId/personal-blocks` | sí | `requireAdmin` | — |
| GET | `/api/schedules/teacher/:teacherId/subjects` | sí | `requireTeacher` | — |
| POST | `/api/sessions` | sí | `requireTeacher` | — |
| GET | `/api/sessions/:sessionId` | sí | `requireTeacher` | `assertClassroomScope` |
| PUT | `/api/sessions/:sessionId` | sí | `requireTeacher` | — |
| GET | `/api/sessions/activities` | sí | `requireTeacher` | — |
| POST | `/api/sessions/activities` | sí | `requireTeacher` | `assertClassroomScope` |
| DELETE | `/api/sessions/activities/:activityId` | sí | `requireTeacher` | `assertClassroomScope` |
| PUT | `/api/sessions/activities/:activityId` | sí | `requireTeacher` | `assertClassroomScope` |
| POST | `/api/sessions/activities/:activityId/grades` | sí | `requireTeacher` | `assertClassroomScope` |
| GET | `/api/sessions/live-detail` | sí | `requireTeacher` | `assertClassroomScope` |
| GET | `/api/sessions/live-overview` | sí | — | `assertCanSeeClassroom` `assertCanSeeStudent` |
| POST | `/api/sessions/live-save` | sí | `requireTeacher` | `assertClassroomScope` |
| POST | `/api/sessions/plan-week-save` | sí | `requireTeacher` | `assertClassroomScope` |
| GET | `/api/sessions/search-students` | sí | `requireTeacher` | — |
| POST | `/api/sessions/suspend` | sí | `requireAdmin` | — |
| POST | `/api/statistics/cache/clear/cycle/:academicYearId` | sí | `requireAdmin` | — |
| POST | `/api/statistics/cache/clear/section/:sectionId` | sí | `requireAdmin` | — |
| GET | `/api/statistics/cycle/:academicYearId` | sí | `requireAdmin` | — |
| GET | `/api/statistics/grade/:academicYearId/:gradeLevel` | sí | `requireAdmin` | — |
| GET | `/api/statistics/section/:sectionId` | sí | `exigirSeccionPropia` | — |
| GET | `/api/statistics/subject/:sectionId/:subjectId` | sí | `exigirMateriaPropia` | — |
| GET | `/api/students` | sí | `requireTeacher` | `teacherClassroomIds` |
| POST | `/api/students` | sí | `requireAdmin` | — |
| DELETE | `/api/students/:id` | sí | `requireAdmin` | — |
| GET | `/api/students/:id` | sí | `requireSelfOrAdmin` | — |
| PUT | `/api/students/:id` | sí | `requireAdmin` | — |
| GET | `/api/students/:id/actividades` | sí | — | `assertCanSeeStudent` |
| GET | `/api/students/:id/complete-history` | sí | `requireSelfOrAdmin` | `canSeeStudent` `tutorId` |
| GET | `/api/students/:id/dashboard` | sí | `requireSelfOrAdmin` | — |
| GET | `/api/students/available` | sí | `requireTeacher` | — |
| GET | `/api/students/my-attendance` | sí | `requireStudent` | `assertCanSeeStudent` `canSeeStudent` |
| GET | `/api/students/my-dashboard` | sí | `requireStudent` | — |
| GET | `/api/students/my-grades` | sí | `requireStudent` | `assertCanSeeStudent` `canSeeStudent` |
| GET | `/api/students/profile/me` | sí | `requireStudent` | `assertCanSeeStudent` `canSeeStudent` |
| PUT | `/api/students/profile/me` | sí | `requireAdmin` | `assertCanSeeStudent` `canSeeStudent` |
| GET | `/api/subjects` | sí | — | — |
| POST | `/api/subjects` | sí | `requireAdmin` | — |
| DELETE | `/api/subjects/:id` | sí | `requireAdmin` | — |
| GET | `/api/subjects/:id` | sí | — | — |
| PUT | `/api/subjects/:id` | sí | `requireAdmin` | — |
| GET | `/api/subjects/:id/students` | sí | `requireTeacher` | — |
| GET | `/api/subjects/:id/teachers` | sí | — | — |
| GET | `/api/subjects/grade/:grade` | sí | — | — |
| DELETE | `/api/subjects/grade/:grade/:subjectId` | sí | `requireAdmin` | — |
| POST | `/api/subjects/grade/:grade/assign` | sí | `requireAdmin` | — |
| GET | `/api/subjects/stats` | sí | `requireAdmin` | — |
| POST | `/api/superadmin/auth/login` | **NO** | `userRateLimit` | — |
| POST | `/api/superadmin/auth/logout` | sí | `superAdminAuthMiddleware` | — |
| GET | `/api/superadmin/auth/me` | sí | `superAdminAuthMiddleware` | — |
| POST | `/api/superadmin/auth/refresh` | **NO** | — | — |
| GET | `/api/superadmin/institutes` | sí | `superAdminAuthMiddleware` | — |
| POST | `/api/superadmin/institutes` | sí | `superAdminAuthMiddleware` | — |
| DELETE | `/api/superadmin/institutes/:id` | sí | `superAdminAuthMiddleware` | — |
| GET | `/api/superadmin/institutes/:id` | sí | `superAdminAuthMiddleware` | — |
| PATCH | `/api/superadmin/institutes/:id` | sí | `superAdminAuthMiddleware` | — |
| POST | `/api/superadmin/institutes/:id/migrate` | sí | `superAdminAuthMiddleware` | — |
| PUT | `/api/superadmin/institutes/:id/plan` | sí | `superAdminAuthMiddleware` | — |
| POST | `/api/superadmin/institutes/:id/reprovision` | sí | `superAdminAuthMiddleware` | — |
| GET | `/api/superadmin/institutes/migrations` | sí | `superAdminAuthMiddleware` | — |
| POST | `/api/superadmin/institutes/migrations/run` | sí | `superAdminAuthMiddleware` | — |
| GET | `/api/superadmin/institutes/plans` | sí | `superAdminAuthMiddleware` | — |
| GET | `/api/superadmin/institutes/ports/available` | sí | `superAdminAuthMiddleware` | — |
| GET | `/api/superadmin/institutes/ports/check` | sí | `superAdminAuthMiddleware` | — |
| GET | `/api/superadmin/institutes/stats` | sí | `superAdminAuthMiddleware` | — |
| GET | `/api/superadmin/metrics/cache` | sí | `superAdminAuthMiddleware` | `assertCanSeeClassroom` |
| POST | `/api/superadmin/metrics/cache/reset` | sí | `superAdminAuthMiddleware` | `assertCanSeeClassroom` |
| GET | `/api/superadmin/monitoring/alerts` | sí | `superAdminAuthMiddleware` | — |
| PATCH | `/api/superadmin/monitoring/alerts/:id/resolve` | sí | `superAdminAuthMiddleware` | — |
| GET | `/api/superadmin/monitoring/alerts/stats` | sí | `superAdminAuthMiddleware` | — |
| GET | `/api/superadmin/monitoring/health` | sí | `superAdminAuthMiddleware` | — |
| GET | `/api/superadmin/monitoring/metrics/history` | sí | `superAdminAuthMiddleware` | — |
| GET | `/api/superadmin/monitoring/metrics/queries` | sí | `superAdminAuthMiddleware` | — |
| GET | `/api/teachers` | sí | `requireAdmin` | — |
| POST | `/api/teachers` | sí | `requireAdmin` | — |
| DELETE | `/api/teachers/:id` | sí | `requireAdmin` | — |
| GET | `/api/teachers/:id` | sí | `requireSelfOrAdmin` | — |
| PUT | `/api/teachers/:id` | sí | `requireAdmin` | — |
| GET | `/api/teachers/my-classrooms` | sí | `requireTeacher` | — |
| GET | `/api/teachers/my-dashboard` | sí | `requireTeacher` | — |
| GET | `/api/teachers/my-subjects` | sí | `requireTeacher` | — |
| GET | `/api/teachers/profile/me` | sí | `requireTeacher` | — |
| PUT | `/api/teachers/profile/me` | sí | `requireAdmin` | — |
| GET | `/api/time` | sí | — | — |
| GET | `/api/users` | sí | `requireAdmin` | — |
| POST | `/api/users` | sí | `requireAdmin` `checkPlanLimits` | — |
| DELETE | `/api/users/:id` | sí | `requireAdmin` | `studentTutor` `tutorId` |
| GET | `/api/users/:id` | sí | `requireSelfOrAdmin` | `studentTutor` |
| PUT | `/api/users/:id` | sí | `requireAdmin` | — |
| POST | `/api/users/:id/archive` | sí | `requireAdmin` | — |
| DELETE | `/api/users/:id/photo` | sí | `requireAdmin` | `assertClassroomScope` `canSeeStudent` |
| GET | `/api/users/:id/photo` | sí | — | `canSeeStudent` |
| PUT | `/api/users/:id/photo` | sí | `requireAdmin` | — |
| PATCH | `/api/users/:id/status` | sí | `requireAdmin` | — |
| POST | `/api/users/:id/unarchive` | sí | `requireAdmin` | — |
| GET | `/api/users/:studentId/tutors` | sí | `requireAdmin` | `studentTutor` `tutorId` |
| POST | `/api/users/:studentId/tutors` | sí | `requireAdmin` | `studentTutor` `tutorId` |
| DELETE | `/api/users/:studentId/tutors/:tutorId` | sí | `requireAdmin` | `assertClassroomScope` `assertCanSeeClassroom` `assertCanSeeStudent` `teacherClassroomIds` `studentTutor` `tutorId` |
| GET | `/api/users/profile/me` | sí | — | — |
| PUT | `/api/users/profile/me` | sí | `requireAdmin` | — |
| GET | `/api/users/role/:role` | sí | `requireAdmin` | — |
| GET | `/api/users/stats` | sí | `requireAdmin` | — |
All database connections closed
{"level":30,"time":1790287422239,"pid":9383,"hostname":"vm","msg":"🛡️  Helmet security headers configured (Production: false)"}
{"level":40,"time":1790287422242,"pid":9383,"hostname":"vm","msg":"\"root\" path \"/home/user/Gestiedu/apps/backend/public\" must exist"}
