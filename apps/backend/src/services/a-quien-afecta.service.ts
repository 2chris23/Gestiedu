import { PrismaClient } from '@prisma/client';
import { UserRole } from '../utils/prisma-enums';
import { liceoActual } from '../config/ambito-del-liceo';

/**
 * A QUIÉN LE TOCA UN CAMBIO
 *
 * Cuando un profesor le pone una nota a Sofía, el sistema tiraba la copia
 * guardada del liceo entero y le decía a los 5.000 que volvieran a pedir sus
 * datos. Luis, que no tiene nada que ver, también. Eso es lo que ahogaba al
 * servidor: no repetir un cálculo, sino **tirar comida buena a la basura**.
 *
 * Aquí se calcula quién queda afectado de verdad, siguiendo las mismas reglas de
 * quién ve qué:
 *
 *   - **el alumno**, que ve lo suyo;
 *   - **sus representantes**, que ven a los alumnos que tutelan;
 *   - **los profesores de esa sección y los administradores**, que son los
 *     únicos que ven los medidores y los promedios del salón.
 *
 * El alumno NO ve el promedio del salón, y el representante tampoco. Por eso el
 * aviso de los medidores va aparte y solo para el personal.
 */

export interface AQuienAfecta {
    /** Alumnos cuyos datos propios cambiaron. */
    studentIds?: string[];
    /** Sección afectada, para los medidores y los profesores. */
    classroomId?: string;
}

export interface Destinatarios {
    /** Personas cuyos datos propios hay que refrescar. */
    personas: string[];
    /** Personal que ve los medidores de esa sección (profesores y admins). */
    personal: string[];
}

/**
 * Se recuerda un rato quién es el personal de cada sección: cambia poquísimo y
 * se consulta en cada escritura.
 *
 * SE RECUERDA POR LICEO, NO POR SECCIÓN A SECAS. Esta memoria es una sola para
 * todo el servidor, y el identificador de una sección **puede repetirse entre
 * liceos**: los que se dan de alta copiando una base de ejemplo nacen con los
 * mismos. Con la sección sola como clave, un cambio en el liceo A avisaba a los
 * profesores del liceo B —y, peor, **dejaba sin avisar a los del A**, que se
 * quedaban mirando datos viejos—. Es el mismo fallo de fondo que el de la
 * memoria rápida: ver `config/ambito-del-liceo.ts`.
 */
const PERSONAL_RECORDADO_MS = 60_000;
const personalPorSeccion = new Map<string, { ids: string[]; hasta: number }>();

/** La clave lleva el liceo delante; sin liceo, su propio apartado. */
function clavePorLiceo(classroomId: string): string {
    return `${liceoActual() ?? 'sin-liceo'}|${classroomId}`;
}

export function olvidarPersonalRecordado(): void {
    personalPorSeccion.clear();
}

async function personalDeLaSeccion(prisma: PrismaClient, classroomId: string): Promise<string[]> {
    const clave = clavePorLiceo(classroomId);
    const recordado = personalPorSeccion.get(clave);
    if (recordado && recordado.hasta > Date.now()) return recordado.ids;

    const [seccion, materias, profesores, admins] = await Promise.all([
        prisma.classroom.findUnique({ where: { id: classroomId }, select: { teacherId: true } }),
        prisma.classroomSubject.findMany({ where: { classroomId }, select: { teacherId: true } }),
        prisma.teacherClassroom.findMany({ where: { classroomId }, select: { teacherId: true } }),
        // Los administradores ven todo el liceo: son pocos y cambian poco.
        prisma.user.findMany({ where: { role: UserRole.ADMIN, isActive: true }, select: { id: true } }),
    ]);

    const ids = new Set<string>();
    if (seccion?.teacherId) ids.add(seccion.teacherId);
    for (const m of materias) if (m.teacherId) ids.add(m.teacherId);
    for (const p of profesores) if (p.teacherId) ids.add(p.teacherId);
    for (const a of admins) ids.add(a.id);

    const lista = [...ids];
    personalPorSeccion.set(clave, { ids: lista, hasta: Date.now() + PERSONAL_RECORDADO_MS });
    return lista;
}

async function representantesDe(prisma: PrismaClient, studentIds: string[]): Promise<string[]> {
    if (studentIds.length === 0) return [];
    const vinculos = await prisma.studentTutor.findMany({
        where: { studentId: { in: studentIds } },
        select: { tutorId: true },
    });
    return [...new Set(vinculos.map((v) => v.tutorId))];
}

/**
 * Resuelve los destinatarios de un cambio.
 *
 * Devuelve `null` cuando no se puede acotar: en ese caso quien llama debe seguir
 * avisando a todo el liceo, que es correcto aunque cueste más. Acotar de menos
 * deja pantallas viejas; eso no se negocia.
 */
export async function resolverDestinatarios(
    prisma: PrismaClient,
    afecta: AQuienAfecta | undefined
): Promise<Destinatarios | null> {
    if (!afecta) return null;

    const studentIds = (afecta.studentIds ?? []).filter(Boolean);
    const classroomId = afecta.classroomId;

    if (studentIds.length === 0 && !classroomId) return null;

    const personas = new Set<string>(studentIds);
    for (const tutor of await representantesDe(prisma, studentIds)) personas.add(tutor);

    const personal = classroomId ? await personalDeLaSeccion(prisma, classroomId) : [];

    return { personas: [...personas], personal };
}
