/**
 * LO QUE SE BAJA SOLO, EN SEGUNDO PLANO (como WhatsApp baja los estados)
 *
 * Con conexión, sin que nadie lo pida, la app baja lo que cada uno usa a
 * diario: así, sin señal, se abre también lo que no se había abierto antes.
 * Cada lectura pasa por `api` y queda en `respuestas-guardadas.ts`; cada
 * pantalla se le manda al ayudante (`sw.js`), que la guarda con sus archivos.
 *
 * Las direcciones y sus parámetros son EXACTAMENTE los que piden las
 * pantallas (mismos ganchos): si no, sin conexión la pantalla pediría una
 * dirección distinta de la guardada y saldría vacía.
 *
 * Aquí solo se decide QUÉ; cuándo y a qué ritmo, `DescargaEnSegundoPlano`.
 */

export interface Lectura {
    url: string;
    params?: Record<string, string>;
}

export interface LoQueSeBaja {
    lecturas: Lectura[];
    pantallas: string[];
}

/** Lunes a viernes de la semana del liceo en que cae `hoy` ("YYYY-MM-DD"). */
export function laSemanaDe(hoy: string): string[] {
    const dia = new Date(`${hoy}T12:00:00Z`);
    const lunes = dia.getTime() - ((dia.getUTCDay() + 6) % 7) * 864e5;
    return [0, 1, 2, 3, 4].map((i) => new Date(lunes + i * 864e5).toISOString().slice(0, 10));
}

/** La fecha de esta semana del día `dayOfWeek` (0 = domingo). */
function fechaDelDia(semana: string[], dayOfWeek: number): string | null {
    return dayOfWeek >= 1 && dayOfWeek <= 5 ? semana[dayOfWeek - 1] : null;
}

export interface BloqueDelProfesor {
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    classroomSubject?: { subject?: { id?: string } | null; classroom?: { id?: string } | null } | null;
}

/**
 * EL PROFESOR: su semana de clases.
 *
 * Por cada bloque de esta semana, la clase en vivo de ese día (la pantalla con
 * la misma dirección que abre su horario: `?date=&start=&end=`), sus
 * actividades y el resumen del día de la sección. Así, sin señal, entra a
 * cualquier clase de la semana y pasa lista o pone notas.
 */
export function loDelProfesor(yoId: string, bloques: BloqueDelProfesor[], hoy: string): LoQueSeBaja {
    const semana = laSemanaDe(hoy);
    const lecturas: Lectura[] = [{ url: '/dashboard/teacher' }, { url: `/schedules/teacher/${yoId}/blocks` }];
    const pantallas = ['/dashboard', '/dashboard/horarios', '/dashboard/academico', '/dashboard/materias', `/dashboard/usuarios/${yoId}`];
    const clases = new Set<string>();
    const resumenes = new Set<string>();

    // Primero lo de hoy, luego el resto de la semana.
    const orden = [...bloques].sort((a, b) => {
        const fa = fechaDelDia(semana, a.dayOfWeek) ?? '';
        const fb = fechaDelDia(semana, b.dayOfWeek) ?? '';
        const pa = fa === hoy ? 0 : 1;
        const pb = fb === hoy ? 0 : 1;
        return pa - pb || fa.localeCompare(fb) || a.startTime.localeCompare(b.startTime);
    });

    for (const b of orden) {
        const classroomId = b.classroomSubject?.classroom?.id;
        const subjectId = b.classroomSubject?.subject?.id;
        const date = fechaDelDia(semana, b.dayOfWeek);
        if (!classroomId || !subjectId || !date) continue;
        lecturas.push({ url: '/sessions/live-detail', params: { classroomId, subjectId, date } });
        if (!resumenes.has(`${classroomId}|${date}`)) {
            resumenes.add(`${classroomId}|${date}`);
            lecturas.push({ url: '/sessions/live-overview', params: { classroomId, date } });
        }
        if (!clases.has(`${classroomId}|${subjectId}`)) {
            clases.add(`${classroomId}|${subjectId}`);
            lecturas.push({ url: '/sessions/activities', params: { classroomId, subjectId } });
        }
        pantallas.push(
            `/dashboard/clase-en-vivo/${classroomId}/${subjectId}?date=${date}&start=${encodeURIComponent(b.startTime)}&end=${encodeURIComponent(b.endTime)}`
        );
    }
    return { lecturas, pantallas };
}

/** EL ALUMNO: su inicio, su horario, cada materia («Mi clase») y su boleta. */
export function loDelAlumno(yoId: string, seccionId: string | null, materias: Array<{ id: string }>): LoQueSeBaja {
    const lecturas: Lectura[] = [
        { url: '/students/my-dashboard' },
        { url: `/students/${encodeURIComponent(yoId)}/materias` },
        { url: `/students/${encodeURIComponent(yoId)}/boleta` },
    ];
    if (seccionId) lecturas.push({ url: `/schedules/classroom/${seccionId}` });
    const pantallas = ['/dashboard', '/dashboard/boleta/mia'];
    for (const m of materias) {
        lecturas.push({ url: `/students/${encodeURIComponent(yoId)}/materias/${encodeURIComponent(m.id)}/clase` });
        pantallas.push(`/dashboard/mi-clase/${encodeURIComponent(m.id)}`);
    }
    return { lecturas, pantallas };
}

/** EL ADMIN: las pantallas de cada día, su inicio, los ciclos y la primera página de usuarios. */
export function loDelAdmin(): LoQueSeBaja {
    return {
        lecturas: [
            { url: '/dashboard/admin' },
            { url: '/academic-years' },
            // La primera página de Usuarios y su contador de archivados, como los pide la pantalla.
            { url: '/users', params: { page: '1', limit: '10', status: 'ACTIVE' } },
            { url: '/users', params: { limit: '1', status: 'ARCHIVED' } },
        ],
        pantallas: [
            '/dashboard',
            '/dashboard/academico',
            '/dashboard/usuarios',
            '/dashboard/horarios',
            '/dashboard/eventos',
            '/dashboard/observaciones',
            '/dashboard/materias',
            '/dashboard/configuracion',
        ],
    };
}

