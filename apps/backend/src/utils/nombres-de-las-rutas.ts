/**
 * CADA RUTA CON SU NOMBRE DE BOTÓN (salud, 18-oct-2026)
 *
 * En el panel del superadmin, «POST /api/classrooms/:classroomId/subjects/:subjectId/grades»
 * no le dice nada a nadie; «Guardar notas» sí. Las importantes van a mano
 * (`A_MANO`); las demás se arman con el verbo y las palabras de la ruta
 * traducidas. Si una palabra no está en el diccionario, sale tal cual: se ve
 * en el panel y se añade aquí.
 */

const A_MANO: Record<string, string> = {
    'POST /api/auth/login': 'Entrar (login)',
    'POST /api/auth/refresh': 'Renovar la sesión',
    'POST /api/auth/logout': 'Cerrar sesión',
    'GET /api/auth/me': 'Quién soy',
    'POST /api/auth/llave-del-telefono': 'Entrar con la huella',
    'GET /api/dashboard/admin': 'Inicio del admin',
    'GET /api/dashboard/teacher': 'Inicio del profesor',
    'GET /api/dashboard/student': 'Inicio del alumno',
    'GET /api/precarga/paquete': 'Descarga inicial (paquete)',
    'POST /api/precarga/plan': 'Descarga inicial (plan)',
    'POST /api/precarga/bloque': 'Descarga inicial (bloque)',
    'POST /api/precarga/cambios': 'Ponerse al día',
    'GET /api/time': 'La hora del liceo',
    'GET /health': 'Salud (los teléfonos preguntan)',
    'GET /api/health': 'Salud (los teléfonos preguntan)',
    'POST /api/errores': 'Reportar un fallo de pantalla',
};

const PALABRAS: Record<string, string> = {
    students: 'alumnos', student: 'alumno', teachers: 'profesores', teacher: 'profesor', users: 'usuarios',
    classrooms: 'secciones', classroom: 'sección', subjects: 'materias', subject: 'materia', grades: 'notas',
    attendance: 'asistencia', 'daily-attendance': 'asistencia', schedules: 'horarios', schedule: 'horario',
    sessions: 'clases', 'class-sessions': 'clases', activities: 'actividades', actividades: 'actividades',
    'academic-years': 'años escolares', periods: 'lapsos', cycles: 'ciclos', institutes: 'liceo', current: '',
    config: 'configuración', 'academic-config': 'configuración académica', payments: 'pagos', finanzas: 'finanzas',
    observations: 'observaciones', events: 'eventos', avisos: 'avisos', boleta: 'boleta', materias: 'materias',
    profesores: 'profesores', secciones: 'secciones', 'grupos-estables': 'grupos estables', precarga: 'descarga',
    'evaluation-plans': 'plan de evaluación', 'plan-evaluacion': 'plan de evaluación', reports: 'reportes',
    'cuadro-de-honor': 'cuadro de honor', 'labor-social': 'labor social', pae: 'comedor', citaciones: 'citaciones',
    'asistencia-qr': 'asistencia QR', 'class-replacements': 'reemplazos', 'live-overview': 'en vivo',
    membrete: 'membrete', 'horas-del-cargo': 'horas del cargo', 'carga-horaria': 'carga horaria', superadmin: 'superadmin',
    monitoring: 'monitoreo', promotion: 'cierre del año', pendientes: 'pendientes', 'mi-clase': 'mi clase',
    documentos: 'documentos', constancias: 'constancias', recaudos: 'recaudos', tutors: 'representantes',
    teacher_: 'profesor', enrollments: 'inscripciones', apreciaciones: 'apreciaciones', instrumentos: 'instrumentos',
};

const VERBO: Record<string, string> = { GET: 'Ver', POST: 'Guardar', PUT: 'Cambiar', PATCH: 'Cambiar', DELETE: 'Borrar' };

export function nombreDeLaRuta(metodoYRuta: string): string {
    if (A_MANO[metodoYRuta]) return A_MANO[metodoYRuta];
    const [metodo, ruta = ''] = metodoYRuta.split(' ');
    const partes = ruta
        .split('?')[0]
        .split('/')
        .filter((t) => t && t !== 'api' && !t.startsWith(':') && t !== ':id')
        .map((t) => (PALABRAS[t] !== undefined ? PALABRAS[t] : t.replace(/-/g, ' ')))
        .filter(Boolean);
    const verbo = VERBO[metodo] ?? metodo;
    return partes.length ? `${verbo} ${partes.join(' · ')}` : `${verbo} ${ruta}`;
}
