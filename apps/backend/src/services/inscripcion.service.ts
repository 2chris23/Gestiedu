import { platformPrisma } from '../config/database';
import { AppErrors, createError } from '../middleware/error.middleware';
import { borrarGuardandoCopia } from '../utils/papelera';
import { datosDelPlantel, valoresDelAlumno, fechaLarga } from './constancias.service';
import { plantillaDe, parrafosDe } from './plantillas-de-documentos.service';

/**
 * LA INSCRIPCIÓN, SIN CASTIGAR AL LICEO
 *
 * Crear la cuenta de un alumno pide lo mínimo (nombre, apellido, correo,
 * cédula, contraseña, rol y sexo). Todo lo demás se completa después, en su
 * ficha, cuando haya tiempo: un liceo que empieza a usar el sistema tiene
 * cientos de alumnos y además lleva las notas del día.
 *
 *   - **Los recaudos** (partida de nacimiento, fotos…): la lista es de cada
 *     liceo (`academicConfig.inscripcion.recaudos`, en Configuración →
 *     Documentos); por defecto, lo que suele pedir un liceo del MPPE. El admin
 *     marca lo entregado en la ficha; quitar una marca guarda copia.
 *   - **Lo que le falta a cada uno** (datos para el Ministerio o recaudos):
 *     la lista de usuarios lo filtra, para ir completando.
 *   - **La planilla de inscripción**, para imprimir y que la firme el
 *     representante: sus datos, los del alumno, lo entregado y la declaración
 *     (plantilla `PLANILLA_INSCRIPCION`, editable).
 *
 * Todo es del admin. Pruebas: `tests/integration/inscripcion.test.ts` (REC-*).
 */

export interface Recaudo {
    clave: string;
    nombre: string;
}

/** Lo que suele pedir un liceo al inscribir (lo cambia cada liceo). */
export const RECAUDOS_POR_DEFECTO: Recaudo[] = [
    { clave: 'PARTIDA_DE_NACIMIENTO', nombre: 'Partida de nacimiento (original y copia)' },
    { clave: 'CEDULA_DEL_ALUMNO', nombre: 'Copia de la cédula del alumno (o cédula escolar)' },
    { clave: 'FOTOS', nombre: 'Fotos tipo carnet' },
    { clave: 'NOTAS_ANTERIORES', nombre: 'Notas certificadas del año anterior' },
    { clave: 'PROSECUCION', nombre: 'Constancia de prosecución o boleta de promoción' },
    { clave: 'CEDULA_DEL_REPRESENTANTE', nombre: 'Copia de la cédula del representante' },
    { clave: 'VACUNAS', nombre: 'Constancia de vacunación' },
];

const MAX_RECAUDOS = 30;

/** «Copia de la cédula» → «COPIA_DE_LA_CEDULA»: la clave que se guarda. */
export function claveDe(nombre: string): string {
    return nombre
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40);
}

const esListaDeRecaudos = (v: unknown): v is Recaudo[] =>
    Array.isArray(v) &&
    v.every((r) => r && typeof r === 'object' && typeof (r as Recaudo).clave === 'string' && typeof (r as Recaudo).nombre === 'string');

/** Los recaudos que pide el liceo. */
export async function recaudosDelLiceo(instituteId: string): Promise<Recaudo[]> {
    const inst = await platformPrisma.institute.findUnique({ where: { id: instituteId }, select: { academicConfig: true } });
    const guardados = ((inst?.academicConfig ?? {}) as Record<string, any>).inscripcion?.recaudos;
    return esListaDeRecaudos(guardados) ? guardados : RECAUDOS_POR_DEFECTO;
}

/**
 * Guarda la lista del liceo. Se escriben los NOMBRES; la clave se saca del
 * nombre, salvo la de un recaudo que ya estaba (así lo ya marcado sigue
 * marcado aunque se corrija una letra). `null` vuelve a la de siempre.
 */
export async function guardarRecaudos(instituteId: string, lista: Array<{ clave?: unknown; nombre: unknown }> | null): Promise<Recaudo[]> {
    const inst = await platformPrisma.institute.findUnique({ where: { id: instituteId }, select: { academicConfig: true } });
    const config = ((inst?.academicConfig ?? {}) as Record<string, any>) || {};
    const inscripcion = { ...(config.inscripcion ?? {}) };
    if (lista === null) {
        delete inscripcion.recaudos;
    } else {
        if (!Array.isArray(lista) || lista.length > MAX_RECAUDOS) {
            throw createError(400, `La lista va de 0 a ${MAX_RECAUDOS} recaudos`, 'RECAUDOS_INVALIDOS');
        }
        const limpia: Recaudo[] = [];
        for (const r of lista) {
            const nombre = typeof r?.nombre === 'string' ? r.nombre.replace(/\s+/g, ' ').trim() : '';
            if (nombre.length < 3 || nombre.length > 80) throw createError(400, 'Cada recaudo va de 3 a 80 letras', 'RECAUDOS_INVALIDOS');
            const clave = typeof r.clave === 'string' && /^[A-Z0-9_]{1,40}$/.test(r.clave) ? r.clave : claveDe(nombre);
            if (!clave) throw createError(400, `«${nombre}» no sirve como recaudo`, 'RECAUDOS_INVALIDOS');
            if (limpia.some((x) => x.clave === clave)) throw createError(400, `«${nombre}» está repetido`, 'RECAUDOS_INVALIDOS');
            limpia.push({ clave, nombre });
        }
        inscripcion.recaudos = limpia;
    }
    await platformPrisma.institute.update({ where: { id: instituteId }, data: { academicConfig: { ...config, inscripcion } } });
    return recaudosDelLiceo(instituteId);
}

async function alumno(prisma: any, studentId: string) {
    const a = await prisma.user.findUnique({ where: { id: studentId }, select: { id: true, role: true } });
    if (!a || a.role !== 'STUDENT') throw AppErrors.NotFound('Estudiante');
    return a;
}

/** Los recaudos del liceo, con lo que este alumno ya entregó. */
export async function recaudosDelAlumno(prisma: any, instituteId: string, studentId: string) {
    await alumno(prisma, studentId);
    const [lista, entregados] = await Promise.all([
        recaudosDelLiceo(instituteId),
        prisma.recaudoEntregado.findMany({ where: { studentId }, select: { recaudo: true, entregadoEl: true } }),
    ]);
    const porClave = new Map<string, Date>(entregados.map((e: any) => [e.recaudo, e.entregadoEl]));
    const recaudos = lista.map((r) => ({
        ...r,
        entregado: porClave.has(r.clave),
        entregadoEl: porClave.get(r.clave)?.toISOString().slice(0, 10) ?? null,
    }));
    return { recaudos, faltan: recaudos.filter((r) => !r.entregado).length };
}

/** Marca (o desmarca) un recaudo como entregado. Desmarcar guarda copia. */
export async function marcarRecaudo(prisma: any, instituteId: string, actor: string, studentId: string, clave: string, entregado: boolean) {
    await alumno(prisma, studentId);
    if (!(await recaudosDelLiceo(instituteId)).some((r) => r.clave === clave)) {
        throw createError(404, 'Ese recaudo no está en la lista del liceo', 'RECAUDO_DESCONOCIDO');
    }
    if (entregado) {
        await prisma.recaudoEntregado.upsert({
            where: { studentId_recaudo: { studentId, recaudo: clave } },
            create: { studentId, recaudo: clave, anotadoPor: actor },
            update: {},
        });
    } else {
        await borrarGuardandoCopia(prisma, 'recaudoEntregado', { studentId, recaudo: clave }, { usuarioId: actor, motivo: 'recaudo desmarcado' });
    }
    return recaudosDelAlumno(prisma, instituteId, studentId);
}

/**
 * EL FILTRO «LES FALTA ALGO», como condición de Prisma: alumnos a los que les
 * falta un dato de los que piden los documentos del Ministerio (fecha y lugar
 * de nacimiento, entidad, nacionalidad, sexo) o algún recaudo del liceo.
 */
export async function condicionDeLesFalta(instituteId: string): Promise<Record<string, unknown>> {
    const recaudos = await recaudosDelLiceo(instituteId);
    return {
        role: 'STUDENT',
        OR: [
            { birthDate: null },
            { gender: null },
            { nacionalidad: null },
            { lugarDeNacimiento: null },
            { entidadDeNacimiento: null },
            ...recaudos.map((r) => ({ recaudosEntregados: { none: { recaudo: r.clave } } })),
        ],
    };
}

/** Los datos de la ficha que piden los documentos del Ministerio (ver `loQueLeFalta`). */
export const DATOS_DE_LA_FICHA = 5;

/**
 * CUÁNTO LLEVA DE LA INSCRIPCIÓN
 *
 * El anillo de la ficha: cada dato del Ministerio y cada recaudo cuenta uno.
 * `falta` es la lista de `loQueLeFalta`, que junta los recaudos en una sola
 * entrada («6 recaudos»); por eso los datos que faltan son el resto.
 */
export function avanceDeLaInscripcion(
    recaudos: { recaudos: Array<{ entregado: boolean }>; faltan: number },
    falta: string[]
): { hecho: number; total: number } {
    const datosQueFaltan = falta.length - (recaudos.faltan > 0 ? 1 : 0);
    const total = DATOS_DE_LA_FICHA + recaudos.recaudos.length;
    return { hecho: total - datosQueFaltan - recaudos.faltan, total };
}

/** Lo que le falta a un alumno, en palabras (para su ficha). */
export async function loQueLeFalta(prisma: any, instituteId: string, studentId: string): Promise<string[]> {
    const a = await prisma.user.findUnique({
        where: { id: studentId },
        select: { role: true, birthDate: true, gender: true, nacionalidad: true, lugarDeNacimiento: true, entidadDeNacimiento: true },
    });
    if (!a || a.role !== 'STUDENT') return [];
    const falta: string[] = [];
    if (!a.birthDate) falta.push('fecha de nacimiento');
    if (!a.gender) falta.push('sexo');
    if (!a.nacionalidad) falta.push('nacionalidad');
    if (!a.lugarDeNacimiento) falta.push('lugar de nacimiento');
    if (!a.entidadDeNacimiento) falta.push('entidad de nacimiento');
    const { faltan } = await recaudosDelAlumno(prisma, instituteId, studentId);
    if (faltan > 0) falta.push(faltan === 1 ? '1 recaudo' : `${faltan} recaudos`);
    return falta;
}

const SEXO: Record<string, string> = { MASCULINO: 'Masculino', FEMENINO: 'Femenino', OTRO: 'Otro' };
const aYmd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

/** Edad cumplida en una fecha (AAAA-MM-DD). */
export function edadEn(nacimiento: string, fecha: string): number {
    const [ny, nm, nd] = nacimiento.split('-').map(Number);
    const [y, m, d] = fecha.split('-').map(Number);
    return y - ny - (m < nm || (m === nm && d < nd) ? 1 : 0);
}

/**
 * LA PLANILLA DE INSCRIPCIÓN: la sección de este año (o la del siguiente, si
 * ya está inscrito en él), sus datos, sus representantes, lo entregado y la
 * declaración que firma el representante.
 */
export async function planillaDeInscripcion(prisma: any, instituteId: string, studentId: string, hoy: string) {
    const a = await prisma.user.findUnique({
        where: { id: studentId },
        select: {
            id: true,
            role: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            address: true,
            birthDate: true,
            gender: true,
            nacionalidad: true,
            lugarDeNacimiento: true,
            entidadDeNacimiento: true,
            tipoDeCedula: true,
            cedulaEscolar: true,
            studentTutorings: {
                orderBy: { createdAt: 'asc' },
                select: {
                    relationship: true,
                    tutor: { select: { id: true, firstName: true, lastName: true, phone: true, email: true, address: true } },
                },
            },
            studentClassrooms: {
                where: { isActive: true },
                select: {
                    academicYear: { select: { name: true, status: true, startDate: true } },
                    classroom: { select: { grade: true, section: true, shift: true } },
                },
            },
        },
    });
    if (!a || a.role !== 'STUDENT') throw AppErrors.NotFound('Estudiante');

    const inscripciones = [...a.studentClassrooms].sort(
        (x: any, y: any) => y.academicYear.startDate.getTime() - x.academicYear.startDate.getTime()
    );
    const inscripcion = inscripciones.find((i: any) => i.academicYear.status === 'UPCOMING') ?? inscripciones[0] ?? null;

    const [plantel, plantilla, { recaudos }] = await Promise.all([
        datosDelPlantel(instituteId, hoy),
        plantillaDe(instituteId, 'PLANILLA_INSCRIPCION'),
        recaudosDelAlumno(prisma, instituteId, studentId),
    ]);
    const representantes = a.studentTutorings.map((t: any) => ({
        cedula: t.tutor.id,
        nombre: `${t.tutor.firstName} ${t.tutor.lastName}`,
        parentesco: t.relationship,
        telefono: t.tutor.phone ?? null,
        correo: t.tutor.email ?? null,
        direccion: t.tutor.address ?? null,
    }));
    const principal = representantes[0];
    // Sin sección todavía (se está inscribiendo): el año escolar en curso.
    const ciclo =
        inscripcion?.academicYear.name ??
        (await prisma.academicYear.findFirst({ where: { status: 'ACTIVE' }, orderBy: { startDate: 'desc' }, select: { name: true } }))?.name ??
        '';
    const valores = {
        ...plantel.valores,
        ...valoresDelAlumno(a, inscripcion?.classroom ?? null, ciclo, plantel.nivel),
        cursa: 'cursa',
        representante: principal?.nombre ?? '____________________________',
        cedulaDelRepresentante: principal?.cedula ?? '______________',
    };
    const nacimiento = aYmd(a.birthDate);

    return {
        titulo: plantilla.titulo,
        declaracion: parrafosDe(plantilla.texto, valores),
        liceo: plantel.liceo,
        firmante: plantel.firmante,
        ciclo,
        seccion: inscripcion
            ? { grado: inscripcion.classroom.grade, seccion: inscripcion.classroom.section, turno: inscripcion.classroom.shift ?? null }
            : null,
        alumno: {
            cedula: a.id,
            tipoDeCedula: a.tipoDeCedula ?? null,
            cedulaEscolar: a.cedulaEscolar ?? null,
            nombres: a.firstName,
            apellidos: a.lastName,
            sexo: a.gender ? SEXO[a.gender] ?? null : null,
            fechaDeNacimiento: nacimiento,
            edad: nacimiento ? edadEn(nacimiento, hoy) : null,
            lugarDeNacimiento: a.lugarDeNacimiento ?? null,
            entidadDeNacimiento: a.entidadDeNacimiento ?? null,
            nacionalidad: a.nacionalidad ?? null,
            telefono: a.phone ?? null,
            correo: a.email,
            direccion: a.address ?? null,
        },
        representantes,
        recaudos,
        emitidaEl: hoy,
        fechaLarga: fechaLarga(hoy),
    };
}
