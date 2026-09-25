import { PrismaClient } from '@prisma/client';
import { platformPrisma } from '../config/database';
import { AppErrors, createError } from '../middleware/error.middleware';

/**
 * LAS CONSTANCIAS DEL ALUMNO
 *
 * Lo que más le piden a la secretaría (control de estudios) de un liceo
 * venezolano, después de la boleta: la **constancia de estudio** (para la
 * beca, el seguro, el pasaje estudiantil, otro colegio…) y la **constancia de
 * buena conducta** (sobre todo al cambiarse de liceo). Las dos son una hoja
 * con el membrete del liceo, un párrafo que «hace constar» y la firma del
 * director. Aquí se juntan los datos; la hoja la pinta la web.
 *
 *   - **Estudio:** solo para quien ESTÁ inscrito hoy (inscripción activa en el
 *     ciclo en curso). Un retirado o un egresado no «cursa»: 409 NO_INSCRITO.
 *     La piden el admin, el propio alumno y su representante.
 *   - **Buena conducta:** la valoración es del liceo, no del sistema: la emite
 *     solo el admin, y vale para quien estudió allí aunque ya no esté (dice
 *     «cursó» en vez de «cursa»).
 *
 * Quién firma y el código del plantel (DEA) son del liceo
 * (`academicConfig.documentos`, Configuración → Académico); sin ellos la hoja
 * sale con la línea de firma en blanco.
 *
 * Ninguna depende de los pagos: en Venezuela no se puede condicionar la
 * entrega de constancias al pago de la mensualidad.
 *
 * Pruebas: `tests/integration/funcional-constancias.test.ts` (CONS-01…05).
 */

export type TipoDeConstancia = 'ESTUDIO' | 'BUENA_CONDUCTA';
export const TIPOS_DE_CONSTANCIA: TipoDeConstancia[] = ['ESTUDIO', 'BUENA_CONDUCTA'];
export const esTipoDeConstancia = (v: unknown): v is TipoDeConstancia =>
    typeof v === 'string' && (TIPOS_DE_CONSTANCIA as string[]).includes(v);

/** Lo que el liceo pone en sus documentos. Todo opcional. */
export interface DatosDeLosDocumentos {
    firmanteNombre?: string;
    firmanteCedula?: string;
    firmanteCargo?: string;
    codigoDea?: string;
}

const CAMPOS_DE_DOCUMENTOS: (keyof DatosDeLosDocumentos)[] = ['firmanteNombre', 'firmanteCedula', 'firmanteCargo', 'codigoDea'];

/**
 * Deja solo los campos conocidos, como texto recortado y de largo razonable.
 * Un campo vacío se borra (vuelve a «sin dato»).
 */
export function limpiarDatosDeDocumentos(entrada: unknown): DatosDeLosDocumentos {
    const limpio: DatosDeLosDocumentos = {};
    if (!entrada || typeof entrada !== 'object') return limpio;
    for (const campo of CAMPOS_DE_DOCUMENTOS) {
        const v = (entrada as Record<string, unknown>)[campo];
        if (typeof v === 'string' && v.trim()) limpio[campo] = v.trim().slice(0, 120);
    }
    return limpio;
}

export interface Constancia {
    tipo: TipoDeConstancia;
    liceo: {
        nombre: string;
        codigo: string | null;
        codigoDea: string | null;
        direccion: string | null;
        ciudad: string | null;
        telefono: string | null;
    };
    firmante: { nombre: string | null; cedula: string | null; cargo: string };
    alumno: { cedula: string; nombres: string; apellidos: string };
    ciclo: { id: string; nombre: string };
    seccion: { grado: number; seccion: string; turno: string | null };
    nivel: string;
    /** true: está inscrito hoy («cursa»); false: estudió aquí («cursó»). */
    vigente: boolean;
    emitidaEl: string;
}

/** «Educación Media General» o «Media Técnica», según la modalidad del liceo. */
const nivelDelLiceo = (modalidad: unknown) =>
    modalidad === 'MEDIA_TECNICA' ? 'Educación Media Técnica' : 'Educación Media General';

export async function constanciaDelAlumno(
    prisma: PrismaClient,
    instituteId: string,
    studentId: string,
    tipo: TipoDeConstancia,
    hoy: string
): Promise<Constancia> {
    const alumno = await prisma.user.findUnique({
        where: { id: studentId },
        select: { id: true, firstName: true, lastName: true, role: true },
    });
    if (!alumno || alumno.role !== 'STUDENT') throw AppErrors.NotFound('Estudiante');

    const inscripciones = await prisma.studentClassroom.findMany({
        where: { studentId },
        include: {
            academicYear: { select: { id: true, name: true, status: true, startDate: true } },
            classroom: { select: { grade: true, section: true, shift: true } },
        },
    });
    // La vigente es la activa del ciclo en curso. Si no hay, la más reciente.
    const vigente = inscripciones.find((i) => i.isActive && i.academicYear.status === 'ACTIVE');
    const inscripcion =
        vigente ??
        [...inscripciones].sort((a, b) => b.academicYear.startDate.getTime() - a.academicYear.startDate.getTime())[0];

    if (tipo === 'ESTUDIO' && !vigente) {
        throw createError(
            409,
            'El estudiante no está inscrito en el año escolar en curso: no se le puede hacer constar que estudia aquí',
            'NO_INSCRITO'
        );
    }
    if (!inscripcion) throw AppErrors.NotFound('Inscripción del estudiante');

    const liceo = await platformPrisma.institute.findUnique({
        where: { id: instituteId },
        select: { name: true, code: true, address: true, city: true, phone: true, academicConfig: true },
    });
    const config = (liceo?.academicConfig ?? {}) as Record<string, unknown>;
    const docs = limpiarDatosDeDocumentos(config.documentos);

    return {
        tipo,
        liceo: {
            nombre: liceo?.name ?? '',
            codigo: liceo?.code ?? null,
            codigoDea: docs.codigoDea ?? null,
            direccion: liceo?.address ?? null,
            ciudad: liceo?.city ?? null,
            telefono: liceo?.phone ?? null,
        },
        firmante: {
            nombre: docs.firmanteNombre ?? null,
            cedula: docs.firmanteCedula ?? null,
            cargo: docs.firmanteCargo ?? 'Director(a)',
        },
        alumno: { cedula: alumno.id, nombres: alumno.firstName, apellidos: alumno.lastName },
        ciclo: { id: inscripcion.academicYear.id, nombre: inscripcion.academicYear.name },
        seccion: {
            grado: inscripcion.classroom.grade,
            seccion: inscripcion.classroom.section,
            turno: (inscripcion.classroom as any).shift ?? null,
        },
        nivel: nivelDelLiceo(config.modalidad),
        vigente: Boolean(vigente),
        emitidaEl: hoy,
    };
}

/**
 * ¿Quién puede sacar la constancia? La de estudio: el admin, el propio alumno
 * y su representante (es un dato suyo, como la boleta). La de buena conducta
 * es una valoración del liceo: solo el admin.
 */
export async function puedeSacarLaConstancia(
    prisma: PrismaClient,
    user: { id?: string; userId?: string; role?: string } | null | undefined,
    studentId: string,
    tipo: TipoDeConstancia
): Promise<boolean> {
    const actor = user?.userId ?? user?.id;
    if (!actor || !user?.role) return false;
    if (user.role === 'ADMIN') return true;
    if (tipo !== 'ESTUDIO') return false;
    if (user.role === 'STUDENT') return actor === studentId;
    if (user.role === 'TUTOR') {
        return (await prisma.studentTutor.count({ where: { tutorId: actor, studentId } })) > 0;
    }
    return false;
}
