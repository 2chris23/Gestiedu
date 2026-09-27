import { PrismaClient } from '@prisma/client';
import { platformPrisma } from '../config/database';
import { AppErrors, createError } from '../middleware/error.middleware';
import { membreteDelLiceo } from './datos-del-plantel.service';
import { plantillaDe, parrafosDe, type TipoDePlantilla } from './plantillas-de-documentos.service';

/**
 * LAS CONSTANCIAS DEL ALUMNO
 *
 * Lo que más le piden a la secretaría (control de estudios) de un liceo
 * venezolano, después de la boleta. Todas son una hoja con el membrete, uno o
 * dos párrafos que «hacen constar» y la firma del director. El texto sale de
 * la plantilla del liceo (`plantillas-de-documentos.service`, editable en
 * Configuración → Documentos), rellena aquí y como texto.
 *
 *   - **Estudio:** solo para quien ESTÁ inscrito hoy. Un retirado o un
 *     egresado no «cursa»: 409 NO_INSCRITO. La piden el admin, el alumno y su
 *     representante.
 *   - **Inscripción:** inscrito en el año en curso o en el siguiente (la que
 *     se pide en agosto para la beca). La piden los mismos.
 *   - **Buena conducta:** la valoración es del liceo: solo el admin. Vale para
 *     quien estudió allí aunque ya no esté («cursó»).
 *   - **Prosecución:** aprobó un año ya cerrado y puede seguir al siguiente
 *     (409 SIN_PROSECUCION si no). Solo el admin.
 *   - **Retiro:** se retiró (su cuenta archivada, la inscripción inactiva): la
 *     fecha es la del retiro (409 NO_RETIRADO si no). Solo el admin.
 *   - **Labor social:** cumplió las horas del liceo (`labor-social.service`).
 *     Solo el admin.
 *
 * Ninguna depende de los pagos: en Venezuela no se puede condicionar la
 * entrega de constancias al pago de la mensualidad.
 *
 * Pruebas: CONS-01…05 y DOC-01…05.
 */

export type TipoDeConstancia = TipoDePlantilla;
export const TIPOS_DE_CONSTANCIA: TipoDeConstancia[] = ['ESTUDIO', 'BUENA_CONDUCTA', 'PROSECUCION', 'RETIRO', 'INSCRIPCION', 'LABOR_SOCIAL'];
export const esTipoDeConstancia = (v: unknown): v is TipoDeConstancia =>
    typeof v === 'string' && (TIPOS_DE_CONSTANCIA as string[]).includes(v);

/** Las que el alumno y su representante sacan solos; las demás, el admin. */
const DE_LA_FAMILIA: TipoDeConstancia[] = ['ESTUDIO', 'INSCRIPCION'];

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
    /** El título y los párrafos, ya rellenos con la plantilla del liceo. Texto, no HTML. */
    titulo: string;
    parrafos: string[];
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

const ORDINAL = ['', '1er', '2do', '3er', '4to', '5to', '6to'];
export const gradoLegible = (g: number) => `${ORDINAL[g] ?? `${g}º`} año`;
const TURNO: Record<string, string> = { MANANA: 'mañana', TARDE: 'tarde', INTEGRAL: 'integral' };
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** «a los 25 días del mes de septiembre de 2026», como se escribe en una constancia. */
export const aLosDias = (ymd: string) => {
    const [y, m, d] = ymd.split('-').map(Number);
    return `a ${d === 1 ? 'un día' : `los ${d} días`} del mes de ${MESES[m - 1]} de ${y}`;
};
export const fechaLarga = (ymd: string) => {
    const [y, m, d] = ymd.split('-').map(Number);
    return `${d} de ${MESES[m - 1]} de ${y}`;
};

/** Lo que aporta cada tipo propio (labor social la pone su servicio). */
export type ExtrasDeLaConstancia = Record<string, string>;

export async function constanciaDelAlumno(
    prisma: PrismaClient,
    instituteId: string,
    studentId: string,
    tipo: TipoDeConstancia,
    hoy: string,
    extras: ExtrasDeLaConstancia = {}
): Promise<Constancia> {
    const alumno = await prisma.user.findUnique({
        where: { id: studentId },
        select: { id: true, firstName: true, lastName: true, role: true, tipoDeCedula: true, archivedAt: true, isActive: true },
    });
    if (!alumno || alumno.role !== 'STUDENT') throw AppErrors.NotFound('Estudiante');

    const inscripciones = await prisma.studentClassroom.findMany({
        where: { studentId },
        include: {
            academicYear: { select: { id: true, name: true, status: true, startDate: true } },
            classroom: { select: { grade: true, section: true, shift: true } },
        },
    });
    const porFecha = [...inscripciones].sort((a, b) => b.academicYear.startDate.getTime() - a.academicYear.startDate.getTime());
    // La vigente es la activa del ciclo en curso.
    const vigente = inscripciones.find((i) => i.isActive && i.academicYear.status === 'ACTIVE');
    let inscripcion = vigente ?? porFecha[0];
    const valoresPropios: Record<string, string> = { ...extras };

    if (tipo === 'ESTUDIO' && !vigente) {
        throw createError(409, 'El estudiante no está inscrito en el año escolar en curso: no se le puede hacer constar que estudia aquí', 'NO_INSCRITO');
    }
    if (tipo === 'INSCRIPCION') {
        // La del año siguiente, si ya está inscrito en él; si no, la de este.
        const proxima = porFecha.find((i) => i.isActive && i.academicYear.status === 'UPCOMING') ?? vigente;
        if (!proxima) throw createError(409, 'El estudiante no está inscrito en el año en curso ni en el siguiente', 'NO_INSCRITO');
        inscripcion = proxima;
    }
    if (tipo === 'PROSECUCION') {
        const aprobado = await prisma.academicRecord.findFirst({
            where: { studentId, status: 'COMPLETED', finalResult: { in: ['PROMOVIDO', 'PROMOVIDO_CON_PENDIENTES'] } },
            orderBy: { academicYear: { startDate: 'desc' } },
            select: { academicYearId: true, egreso: true },
        });
        const deEseAno = aprobado ? inscripciones.find((i) => i.academicYearId === aprobado.academicYearId) : null;
        if (!aprobado || !deEseAno) {
            throw createError(409, 'El estudiante no tiene un año aprobado y cerrado en este liceo', 'SIN_PROSECUCION');
        }
        inscripcion = deEseAno;
        const config = await getMaxGrado(instituteId);
        valoresPropios.gradoSiguiente =
            deEseAno.classroom.grade >= config ? 'nivel de Educación Universitaria' : gradoLegible(deEseAno.classroom.grade + 1);
    }
    if (tipo === 'RETIRO') {
        const retirada = porFecha.find((i) => !i.isActive);
        if (!retirada || (alumno.isActive && !alumno.archivedAt)) {
            throw createError(409, 'El estudiante no está retirado del plantel', 'NO_RETIRADO');
        }
        inscripcion = retirada;
        valoresPropios.fechaDeRetiro = fechaLarga((alumno.archivedAt ?? retirada.updatedAt).toISOString().slice(0, 10));
    }
    if (!inscripcion) throw AppErrors.NotFound('Inscripción del estudiante');

    const [liceo, membrete, plantilla] = await Promise.all([
        platformPrisma.institute.findUnique({
            where: { id: instituteId },
            select: { name: true, code: true, address: true, city: true, phone: true, academicConfig: true },
        }),
        membreteDelLiceo(instituteId),
        plantillaDe(instituteId, tipo),
    ]);
    const config = (liceo?.academicConfig ?? {}) as Record<string, unknown>;
    const docs = limpiarDatosDeDocumentos(config.documentos);
    const firmante = {
        nombre: docs.firmanteNombre ?? null,
        cedula: docs.firmanteCedula ?? null,
        cargo: docs.firmanteCargo ?? 'Director(a)',
    };
    const nivel = nivelDelLiceo(config.modalidad);
    const esVigente = Boolean(vigente);
    const c = inscripcion.classroom;

    const valores: Record<string, string> = {
        alumno: `${alumno.firstName} ${alumno.lastName}`,
        tipoDeCedula: alumno.tipoDeCedula === 'ESCOLAR' ? 'cédula escolar' : 'cédula de identidad',
        cedula: alumno.id,
        grado: gradoLegible(c.grade),
        seccion: c.section,
        turno: TURNO[(c as any).shift ?? 'MANANA'] ?? 'mañana',
        ciclo: inscripcion.academicYear.name,
        nivel,
        liceo: membrete.nombre || liceo?.name || '',
        codigoDea: membrete.codigoDea ?? docs.codigoDea ?? '',
        firmante: firmante.nombre
            ? `${firmante.nombre}${firmante.cedula ? `, titular de la cédula de identidad ${firmante.cedula}` : ''}`
            : '____________________________',
        cargo: firmante.cargo,
        cursa: esVigente ? 'cursa' : 'cursó',
        lugarYFecha: `${liceo?.city ? `en ${liceo.city}, ` : ''}${aLosDias(hoy)}`,
        ...valoresPropios,
    };

    return {
        tipo,
        titulo: plantilla.titulo,
        parrafos: parrafosDe(plantilla.texto, valores),
        liceo: {
            nombre: liceo?.name ?? '',
            codigo: liceo?.code ?? null,
            codigoDea: docs.codigoDea ?? membrete.codigoDea ?? null,
            direccion: liceo?.address ?? null,
            ciudad: liceo?.city ?? null,
            telefono: liceo?.phone ?? null,
        },
        firmante,
        alumno: { cedula: alumno.id, nombres: alumno.firstName, apellidos: alumno.lastName },
        ciclo: { id: inscripcion.academicYear.id, nombre: inscripcion.academicYear.name },
        seccion: { grado: c.grade, seccion: c.section, turno: (c as any).shift ?? null },
        nivel,
        vigente: esVigente,
        emitidaEl: hoy,
    };
}

async function getMaxGrado(instituteId: string): Promise<number> {
    const inst = await platformPrisma.institute.findUnique({ where: { id: instituteId }, select: { academicConfig: true } });
    const raw = (inst?.academicConfig ?? {}) as Record<string, unknown>;
    if (typeof raw.maxGradeLevel === 'number') return raw.maxGradeLevel;
    return raw.modalidad === 'MEDIA_TECNICA' ? 6 : 5;
}

/**
 * ¿Quién puede sacar la constancia? La de estudio y la de inscripción: el
 * admin, el propio alumno y su representante (es un dato suyo, como la
 * boleta). Las demás son del liceo: solo el admin.
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
    if (!DE_LA_FAMILIA.includes(tipo)) return false;
    if (user.role === 'STUDENT') return actor === studentId;
    if (user.role === 'TUTOR') {
        return (await prisma.studentTutor.count({ where: { tutorId: actor, studentId } })) > 0;
    }
    return false;
}
