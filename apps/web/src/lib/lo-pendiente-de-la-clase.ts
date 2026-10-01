import type { CambioPendiente } from './por-enviar';

/**
 * LA CLASE CON LO QUE ESPERA PARA SUBIR, ENCIMA
 *
 * Lo hecho sin conexión aún no está en el servidor, así que lo que devuelve
 * (o lo guardado en el teléfono) no lo trae. Se pone encima al pintar: la
 * asistencia marcada, las notas, las actividades creadas (y sin las borradas).
 * Así un refresco no lo tapa, y cada cosa lleva `pendiente` para su relojito.
 */
export function conLoPendiente<T extends { students?: any[]; activities?: any[]; subject?: { id?: string } | null }>(
    datos: T | null | undefined,
    cola: CambioPendiente[],
    classroomId: string,
    subjectId: string,
    date: string
): T | null | undefined {
    if (!datos || !cola.length) return datos;
    const vivos = cola.filter((c) => c.estado !== 'rechazado');

    const asistencia = new Map<string, string>();
    for (const c of vivos) {
        if (c.tipo !== 'asistencia' || c.objeto !== `clase|${classroomId}|${subjectId}|${date}`) continue;
        for (const a of c.datos?.attendances ?? []) if (!a.soloSiNoHay) asistencia.set(a.studentId, a.status);
    }
    const students = (datos.students ?? []).map((s) => (asistencia.has(s.id) ? { ...s, status: asistencia.get(s.id), pendiente: true } : s));

    const materia = (m: string) => m === subjectId || m === datos.subject?.id;
    const borradas = new Set(vivos.filter((c) => c.tipo === 'borrar-actividad').map((c) => c.objeto.slice('actividad|'.length)));
    const existentes = new Set((datos.activities ?? []).map((a) => a.id));
    const creadas = vivos
        .filter((c) => c.tipo === 'crear-actividad' && c.datos?.classroomId === classroomId && materia(c.datos?.subjectId) && !existentes.has(c.datos?.id))
        .map((c) => ({
            ...c.datos,
            tag: c.datos.tag || c.datos.type,
            scores: {},
            isDone: false,
            // Nació en esta clase (la que se ve): sale en su lista.
            belongsToSession: (c.datos.date ?? date) === date,
            pendiente: true,
        }));
    const notasPendientes = new Map<string, Record<string, number | null>>();
    for (const c of vivos) {
        if (c.tipo !== 'notas') continue;
        const id = c.objeto.slice('actividad|'.length);
        notasPendientes.set(id, { ...(notasPendientes.get(id) ?? {}), ...(c.datos?.scores ?? {}) });
    }
    const activities = [...(datos.activities ?? []).filter((a) => !borradas.has(a.id)), ...creadas].map((a) => {
        const n = notasPendientes.get(a.id);
        return n ? { ...a, scores: { ...(a.scores || {}), ...n }, notasPendientes: Object.keys(n) } : a;
    });
    return { ...datos, students, activities };
}
