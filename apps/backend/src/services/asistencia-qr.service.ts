import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import { platformPrisma } from '../config/database';
import { jwtConfig } from '../config/jwt';
import { AppErrors } from '../middleware/error.middleware';
import { instituteTimezone, todayInTimezone } from '../utils/school-time';
import { borrarGuardandoCopia, QuienBorra } from '../utils/papelera';

/**
 * ASISTENCIA POR QR
 *
 * Tres formas de pasar lista, y la de a mano no se quita nunca:
 *
 *   1. A mano, tocando a cada alumno (lo de siempre).
 *   2. El profesor abre un pase de lista: su teléfono enseña un QR y cada
 *      alumno lo escanea desde su app (`escanearComoAlumno`).
 *   3. Al revés: el profesor escanea el QR del alumno (`escanearAlAlumno`).
 *
 * El QR solo IDENTIFICA al alumno. Lo que queda escrito es la asistencia de
 * siempre (`daily_attendance`), la misma fila que marca el profesor a mano: un
 * alumno registrado por QR y uno marcado a mano no se distinguen en ningún
 * cálculo. Lo que se añade es el rastro: con qué teléfono, a qué hora, desde
 * dónde y por qué se aceptó (`registros_asistencia_qr`).
 *
 * ─── QUE NADIE FIRME POR OTRO ───────────────────────────────────────────────
 *
 * Diseño completo en `docs/PROXIMAS-FUNCIONES.md` §1. Lo que corta cada trampa:
 *
 *  · La foto del QR por WhatsApp → el código cambia cada 10 s (y se acepta el
 *    anterior, para quien lo escaneó justo al cambiar) y el faro: el alumno
 *    tiene que estar cerca del teléfono del profesor.
 *  · Escanear, cerrar sesión, entrar con la cuenta del amigo y escanear otra
 *    vez → un teléfono registra a UN alumno por clase, y una cuenta tiene UN
 *    teléfono (lo desbloquea el admin desde el perfil del alumno).
 *  · Llamar al servidor sin escanear → solo vale un código vivo, firmado, de un
 *    pase abierto, y de un alumno inscrito en esa sección.
 *  · Enseñarle al profesor la captura del QR de otro (forma 3) → el QR del
 *    alumno también cambia, y al escanearlo el profesor ve su foto y su nombre.
 *
 * Y por encima de todo: el profesor ve la lista llenándose y quita a
 * cualquiera de un toque. Está en el salón.
 *
 * ─── EL FARO ────────────────────────────────────────────────────────────────
 *
 * El centro del radio es el teléfono del profesor al abrir el pase. Si el GPS
 * del alumno no da (permiso negado, dentro del edificio, precisión peor que el
 * radio), NO se rechaza en silencio: entra «por confirmar» y el profesor lo
 * aprueba de un toque. Escudo, no muro. Una ubicación falsa (Android lo avisa
 * en la app) sí se rechaza.
 */

export const SEGUNDOS_DEL_CODIGO = 10;
/** Un pase olvidado abierto deja de servir a las 3 horas. */
const HORAS_DE_VIDA_DEL_PASE = 3;

export type FueraDelRadio = 'confirmar' | 'bloquear';

export interface ConfigAsistenciaQr {
    /** El liceo usa la asistencia por QR. */
    activa: boolean;
    /** Cuántos metros alrededor del teléfono del profesor. */
    radioMetros: number;
    /** Fuera del radio: entra por confirmar, o se rechaza. */
    fueraDelRadio: FueraDelRadio;
    /** Una cuenta, un teléfono (lo desbloquea el admin). */
    unTelefonoPorAlumno: boolean;
    /** Quien escanea pasados estos minutos desde que se abrió, entra como tarde. */
    minutosATiempo: number;
    /** Hasta cuántos días atrás se puede corregir con el QR (tope: el cierre del lapso). */
    diasParaCorregir: number;
}

/** Lo de fábrica. Cada liceo lo cambia en Configuración → Asistencia por QR. */
export const CONFIG_QR_POR_DEFECTO: ConfigAsistenciaQr = {
    activa: true,
    radioMetros: 150,
    fueraDelRadio: 'confirmar',
    unTelefonoPorAlumno: true,
    minutosATiempo: 2,
    diasParaCorregir: 7,
};

const entero = (v: unknown, min: number, max: number): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? Math.round(v) : undefined;

export function normalizarConfigQr(raw: any): ConfigAsistenciaQr {
    const c = raw && typeof raw === 'object' ? raw : {};
    const d = CONFIG_QR_POR_DEFECTO;
    return {
        activa: typeof c.activa === 'boolean' ? c.activa : d.activa,
        radioMetros: entero(c.radioMetros, 10, 5000) ?? d.radioMetros,
        fueraDelRadio: c.fueraDelRadio === 'bloquear' ? 'bloquear' : c.fueraDelRadio === 'confirmar' ? 'confirmar' : d.fueraDelRadio,
        unTelefonoPorAlumno: typeof c.unTelefonoPorAlumno === 'boolean' ? c.unTelefonoPorAlumno : d.unTelefonoPorAlumno,
        minutosATiempo: entero(c.minutosATiempo, 0, 120) ?? d.minutosATiempo,
        diasParaCorregir: entero(c.diasParaCorregir, 0, 365) ?? d.diasParaCorregir,
    };
}

export async function leerConfigQr(instituteId: string): Promise<ConfigAsistenciaQr> {
    const inst = await platformPrisma.institute.findUnique({ where: { id: instituteId }, select: { academicConfig: true } });
    return normalizarConfigQr((inst?.academicConfig as any)?.asistenciaQr);
}

/**
 * Se guarda DENTRO de la configuración académica del liceo, junto a lo demás,
 * y sin tocar lo demás: se lee la entera y se cambia solo esta llave.
 */
export async function guardarConfigQr(instituteId: string, cambios: Partial<ConfigAsistenciaQr>): Promise<ConfigAsistenciaQr> {
    const inst = await platformPrisma.institute.findUnique({ where: { id: instituteId }, select: { academicConfig: true } });
    const entera = ((inst?.academicConfig as any) || {}) as Record<string, unknown>;
    const nueva = normalizarConfigQr({ ...normalizarConfigQr(entera.asistenciaQr), ...cambios });
    await platformPrisma.institute.update({
        where: { id: instituteId },
        data: { academicConfig: { ...entera, asistenciaQr: nueva } as any },
    });
    return nueva;
}

// ─── Los códigos que rotan ──────────────────────────────────────────────────

export const ventanaDe = (ms: number = Date.now()) => Math.floor(ms / 1000 / SEGUNDOS_DEL_CODIGO);
const cambiaEnMs = (ms: number = Date.now()) => (ventanaDe(ms) + 1) * SEGUNDOS_DEL_CODIGO * 1000 - ms;

function firmar(secreto: string | Buffer, texto: string): string {
    return createHmac('sha256', secreto).update(texto).digest('base64url').slice(0, 22);
}

function mismaFirma(a: string, b: string): boolean {
    const x = Buffer.from(a);
    const y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
}

/** Vale el código de ahora y el anterior: quien lo escaneó justo al cambiar no pierde. */
function ventanaViva(ventana: number, ahora: number = Date.now()): boolean {
    const actual = ventanaDe(ahora);
    return ventana === actual || ventana === actual - 1;
}

interface CodigoLeido {
    tipo: 'PASE' | 'ALUMNO';
    id: string;
    ventana: number;
    firma: string;
}

/**
 * `GQP1.<pase>.<ventana>.<firma>` (el del profesor) o
 * `GQA1.<cédula>.<ventana>.<firma>` (el del alumno). La cédula puede llevar
 * puntos: se lee de los extremos hacia dentro.
 */
export function leerCodigo(codigo: unknown): CodigoLeido | null {
    if (typeof codigo !== 'string' || codigo.length > 300) return null;
    const trozos = codigo.trim().split('.');
    if (trozos.length < 4) return null;
    const tipo = trozos[0] === 'GQP1' ? 'PASE' : trozos[0] === 'GQA1' ? 'ALUMNO' : null;
    const firma = trozos[trozos.length - 1];
    const ventana = Number(trozos[trozos.length - 2]);
    const id = trozos.slice(1, -2).join('.');
    if (!tipo || !id || !Number.isInteger(ventana) || !/^[A-Za-z0-9_-]{10,40}$/.test(firma)) return null;
    return { tipo, id, ventana, firma };
}

export function codigoDelPase(pase: { id: string; secreto: string }, ms: number = Date.now()): string {
    const ventana = ventanaDe(ms);
    return `GQP1.${pase.id}.${ventana}.${firmar(pase.secreto, `${pase.id}.${ventana}`)}`;
}

/** El secreto de los QR de los alumnos de un liceo: derivado, no guardado. */
const secretoDeAlumnos = (instituteId: string) =>
    createHmac('sha256', jwtConfig.secret).update(`asistencia-qr:alumno:${instituteId}`).digest();

export function codigoDelAlumno(instituteId: string, studentId: string, ms: number = Date.now()): string {
    const ventana = ventanaDe(ms);
    return `GQA1.${studentId}.${ventana}.${firmar(secretoDeAlumnos(instituteId), `${studentId}.${ventana}`)}`;
}

/** Del identificador del aparato solo se guarda el resumen. */
export const resumenDelAparato = (instituteId: string, aparatoId: string) =>
    createHash('sha256').update(`${instituteId}:${aparatoId}`).digest('hex');

/** Distancia en metros entre dos puntos (fórmula del semiverseno). */
export function distanciaEnMetros(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
    const R = 6371000;
    const rad = (g: number) => (g * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat);
    const dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// ─── Tipos que llegan del teléfono ──────────────────────────────────────────

export interface Ubicacion {
    lat: number;
    lng: number;
    precision?: number;
    /** Android dice que viene de una app de ubicaciones falsas. */
    falsa?: boolean;
}

export function ubicacionValida(u: any): Ubicacion | null {
    if (!u || typeof u !== 'object') return null;
    const lat = Number(u.lat);
    const lng = Number(u.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    const precision = Number(u.precision);
    return {
        lat,
        lng,
        precision: Number.isFinite(precision) && precision >= 0 ? precision : undefined,
        falsa: u.falsa === true,
    };
}

// ─── Lo que se hace ─────────────────────────────────────────────────────────

type Prisma = any;

export interface QuienActua {
    id: string;
    role: string;
}

const fechaDeDia = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const ymdDe = (fecha: Date) => fecha.toISOString().slice(0, 10);
const diasEntre = (a: string, b: string) => Math.round((fechaDeDia(b).getTime() - fechaDeDia(a).getTime()) / 86400000);

export class AsistenciaQrError extends Error {
    constructor(
        public statusCode: number,
        public code: string,
        message: string
    ) {
        super(message);
    }
}

/**
 * Escribe la asistencia de ese alumno ese día, como la escribe el profesor a
 * mano (una fila por alumno y día), y devuelve lo que tenía antes.
 */
async function escribirAsistencia(
    prisma: Prisma,
    pase: { classroomId: string; subjectId: string; fecha: Date; abiertoPorId: string },
    studentId: string,
    status: 'PRESENT' | 'LATE' | 'ABSENT'
): Promise<string | null> {
    const sesion = await prisma.classSession.upsert({
        where: { classroomId_subjectId_date: { classroomId: pase.classroomId, subjectId: pase.subjectId, date: pase.fecha } },
        update: {},
        create: { publicId: randomUUID(), classroomId: pase.classroomId, subjectId: pase.subjectId, date: pase.fecha },
        select: { id: true },
    });
    const antes = await prisma.dailyAttendance.findUnique({
        where: { studentId_date: { studentId, date: pase.fecha } },
        select: { status: true },
    });
    await prisma.dailyAttendance.upsert({
        where: { studentId_date: { studentId, date: pase.fecha } },
        update: { status, classroomId: pase.classroomId, classSessionId: sesion.id },
        create: {
            studentId,
            classroomId: pase.classroomId,
            status,
            date: pase.fecha,
            teacherId: pase.abiertoPorId,
            classSessionId: sesion.id,
        },
    });
    return antes?.status ?? null;
}

async function estaInscrito(prisma: Prisma, studentId: string, classroomId: string): Promise<boolean> {
    return (await prisma.studentClassroom.count({ where: { studentId, classroomId, isActive: true } })) > 0;
}

/** Abre (o devuelve el ya abierto) un pase de lista de esa clase y ese día. */
export async function abrirPase(opciones: {
    prisma: Prisma;
    instituteId: string;
    quien: QuienActua;
    classroomId: string;
    subjectId: string;
    fecha?: string;
    ubicacion?: Ubicacion | null;
}) {
    const { prisma, instituteId, quien, classroomId, subjectId } = opciones;
    const config = await leerConfigQr(instituteId);
    if (!config.activa) throw new AsistenciaQrError(403, 'QR_APAGADO', 'La asistencia por QR está apagada en este liceo.');

    const hoy = todayInTimezone(await instituteTimezone(prisma));
    const fecha = opciones.fecha || hoy;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw AppErrors.BadRequest('La fecha no es válida');
    if (fecha > hoy) throw AppErrors.BadRequest('No se puede pasar lista de un día que todavía no ha llegado.');

    const esCorreccion = fecha < hoy;
    if (esCorreccion) {
        if (diasEntre(fecha, hoy) > config.diasParaCorregir) {
            throw new AsistenciaQrError(
                400,
                'DEMASIADO_ATRAS',
                `Solo se puede corregir hasta ${config.diasParaCorregir} ${config.diasParaCorregir === 1 ? 'día' : 'días'} atrás.`
            );
        }
        // Tope duro: el lapso cerrado. Sus porcentajes ya se leyeron.
        const seccion = await prisma.classroom.findUnique({ where: { id: classroomId }, select: { academicYearId: true } });
        const lapso = seccion
            ? await prisma.period.findFirst({
                  where: { academicYearId: seccion.academicYearId, startDate: { lte: fechaDeDia(fecha) }, endDate: { gte: fechaDeDia(fecha) } },
                  select: { endDate: true, name: true },
              })
            : null;
        if (lapso && ymdDe(lapso.endDate) < hoy) {
            throw new AsistenciaQrError(400, 'LAPSO_CERRADO', `El ${lapso.name} ya se cerró: su asistencia no se corrige por aquí.`);
        }
    }

    const ahora = new Date();
    const fechaDate = fechaDeDia(fecha);
    const abierto = await prisma.paseDeLista.findFirst({
        where: { classroomId, subjectId, fecha: fechaDate, cerradoEn: null, caducaEn: { gt: ahora } },
        orderBy: { abiertoEn: 'desc' },
    });
    if (abierto) return abierto;

    // El tiempo para llegar a tiempo cuenta desde el PRIMER pase de esta clase
    // hoy: si el profesor lo cerró y lo vuelve a abrir, los que escanean ahora
    // llegan tarde si ya pasó; y si lo cerró sin querer al minuto, no pierde nada.
    const primero = esCorreccion
        ? null
        : await prisma.paseDeLista.findFirst({
              where: { classroomId, subjectId, fecha: fechaDate },
              orderBy: { abiertoEn: 'asc' },
              select: { aTiempoHasta: true },
          });
    const aTiempoHasta = esCorreccion
        ? ahora
        : primero
          ? primero.aTiempoHasta
          : new Date(ahora.getTime() + config.minutosATiempo * 60000);
    const ubicacion = opciones.ubicacion ?? null;

    return prisma.paseDeLista.create({
        data: {
            classroomId,
            subjectId,
            fecha: fechaDate,
            abiertoPorId: quien.id,
            aTiempoHasta,
            caducaEn: new Date(ahora.getTime() + HORAS_DE_VIDA_DEL_PASE * 3600000),
            esCorreccion,
            secreto: randomBytes(32).toString('hex'),
            latitud: ubicacion && !ubicacion.falsa ? ubicacion.lat : null,
            longitud: ubicacion && !ubicacion.falsa ? ubicacion.lng : null,
            precision: ubicacion && !ubicacion.falsa ? ubicacion.precision ?? null : null,
        },
    });
}

export const estaAbierto = (pase: { cerradoEn: Date | null; caducaEn: Date }, ahora = new Date()) =>
    !pase.cerradoEn && pase.caducaEn > ahora;

/**
 * El faro llega después. Pedir la ubicación la primera vez saca el aviso de
 * permiso de Android, y el GPS tarda: el QR no espera por eso. Se pone en
 * cuanto llega, y solo si el pase no tenía ya uno —el centro no se mueve a
 * mitad del pase de lista—.
 */
export async function ponerElFaro(prisma: Prisma, pase: any, ubicacion: Ubicacion | null) {
    if (!ubicacion || ubicacion.falsa || !estaAbierto(pase) || (pase.latitud != null && pase.longitud != null)) return pase;
    return prisma.paseDeLista.update({
        where: { id: pase.id },
        data: { latitud: ubicacion.lat, longitud: ubicacion.lng, precision: ubicacion.precision ?? null },
    });
}

/** Lo que ve el profesor mientras el QR está abierto. */
export async function vistaDelPase(prisma: Prisma, pase: any) {
    const [inscritos, registros, clase] = await Promise.all([
        prisma.studentClassroom.findMany({
            where: { classroomId: pase.classroomId, isActive: true },
            select: { student: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
        }),
        prisma.registroDeAsistenciaQr.findMany({
            where: { paseId: pase.id },
            orderBy: { creadoEn: 'desc' },
            select: {
                id: true,
                studentId: true,
                forma: true,
                estado: true,
                motivo: true,
                asistencia: true,
                aparato: true,
                distancia: true,
                precision: true,
                creadoEn: true,
                student: { select: { firstName: true, lastName: true, avatar: true } },
            },
        }),
        prisma.classroom.findUnique({
            where: { id: pase.classroomId },
            select: { name: true, subjects: { where: { subjectId: pase.subjectId }, select: { subject: { select: { name: true } } } } },
        }),
    ]);

    const alumnos = inscritos
        .map((i: any) => i.student)
        .sort((a: any, b: any) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`));
    const registrados = new Set(registros.filter((r: any) => r.estado === 'ACEPTADO').map((r: any) => r.studentId));
    const abierto = estaAbierto(pase);

    return {
        pase: {
            id: pase.id,
            fecha: ymdDe(pase.fecha),
            abiertoEn: pase.abiertoEn,
            aTiempoHasta: pase.aTiempoHasta,
            cerradoEn: pase.cerradoEn,
            esCorreccion: pase.esCorreccion,
            conFaro: pase.latitud != null && pase.longitud != null,
            abierto,
            seccion: clase?.name ?? null,
            materia: clase?.subjects?.[0]?.subject?.name ?? null,
        },
        codigo: abierto ? codigoDelPase(pase) : null,
        cambiaEnMs: abierto ? cambiaEnMs() : null,
        cuenta: { registrados: registrados.size, total: alumnos.length },
        registros: registros.map((r: any) => ({
            id: r.id,
            studentId: r.studentId,
            nombre: `${r.student.firstName} ${r.student.lastName}`,
            foto: r.student.avatar ?? null,
            forma: r.forma,
            estado: r.estado,
            motivo: r.motivo,
            asistencia: r.asistencia,
            aparato: r.aparato,
            distancia: r.distancia != null ? Math.round(r.distancia) : null,
            hora: r.creadoEn,
        })),
        faltan: alumnos
            .filter((a: any) => !registrados.has(a.id))
            .map((a: any) => ({ id: a.id, nombre: `${a.firstName} ${a.lastName}`, foto: a.avatar ?? null })),
    };
}

/** El alumno escanea el QR del profesor. */
export async function escanearComoAlumno(opciones: {
    prisma: Prisma;
    instituteId: string;
    studentId: string;
    codigo: unknown;
    aparato?: { id?: unknown; descripcion?: unknown } | null;
    ubicacion?: Ubicacion | null;
}) {
    const { prisma, instituteId, studentId } = opciones;
    const leido = leerCodigo(opciones.codigo);
    if (!leido || leido.tipo !== 'PASE') {
        throw new AsistenciaQrError(400, 'CODIGO_INVALIDO', 'Ese código no es de un pase de lista.');
    }

    const pase = await prisma.paseDeLista.findUnique({ where: { id: leido.id } });
    if (!pase) throw new AsistenciaQrError(404, 'PASE_NO_EXISTE', 'Ese código no es de ninguna clase.');
    if (!estaAbierto(pase)) throw new AsistenciaQrError(410, 'PASE_CERRADO', 'El pase de lista ya se cerró.');

    const esperada = firmar(pase.secreto, `${pase.id}.${leido.ventana}`);
    if (!mismaFirma(esperada, leido.firma)) throw new AsistenciaQrError(400, 'CODIGO_INVALIDO', 'Ese código no es de un pase de lista.');
    if (!ventanaViva(leido.ventana)) {
        throw new AsistenciaQrError(400, 'CODIGO_CADUCADO', 'Ese código ya cambió. Escanea el que se ve ahora en la pantalla del profesor.');
    }

    if (!(await estaInscrito(prisma, studentId, pase.classroomId))) {
        throw new AsistenciaQrError(403, 'NO_ES_DE_LA_SECCION', 'Este pase de lista es de una sección en la que no estás.');
    }

    const clase = await prisma.classroom.findUnique({
        where: { id: pase.classroomId },
        select: { name: true, subjects: { where: { subjectId: pase.subjectId }, select: { subject: { select: { name: true } } } } },
    });
    const deLaClase = { seccion: clase?.name ?? null, materia: clase?.subjects?.[0]?.subject?.name ?? null };

    const previos = await prisma.registroDeAsistenciaQr.findMany({
        where: { paseId: pase.id, studentId, estado: { in: ['ACEPTADO', 'POR_CONFIRMAR'] } },
        select: { estado: true, asistencia: true },
    });
    if (previos.some((r: any) => r.estado === 'ACEPTADO')) {
        return { estado: 'ACEPTADO', yaEstaba: true, asistencia: previos[0].asistencia, mensaje: 'Ya estabas registrado en esta clase.', ...deLaClase };
    }
    if (previos.length > 0) {
        return { estado: 'POR_CONFIRMAR', yaEstaba: true, mensaje: 'Ya lo enviaste: falta que el profesor lo confirme.', ...deLaClase };
    }

    const aparatoId = typeof opciones.aparato?.id === 'string' ? opciones.aparato.id.trim() : '';
    if (aparatoId.length < 8 || aparatoId.length > 200) {
        throw new AsistenciaQrError(400, 'SIN_APARATO', 'No se pudo reconocer este teléfono. Actualiza la app.');
    }
    const aparatoHash = resumenDelAparato(instituteId, aparatoId);
    const descripcion =
        typeof opciones.aparato?.descripcion === 'string' ? opciones.aparato.descripcion.slice(0, 120) : null;
    const config = await leerConfigQr(instituteId);
    const ubicacion = opciones.ubicacion ?? null;

    const registrar = async (estado: string, motivo: string | null, extra: Record<string, unknown> = {}) =>
        prisma.registroDeAsistenciaQr.create({
            data: {
                paseId: pase.id,
                studentId,
                forma: 'ALUMNO_ESCANEA',
                estado,
                motivo,
                aparatoHash,
                aparato: descripcion,
                latitud: ubicacion?.lat ?? null,
                longitud: ubicacion?.lng ?? null,
                precision: ubicacion?.precision ?? null,
                ubicacionFalsa: ubicacion?.falsa === true,
                ...extra,
            },
        });

    // 1. Un teléfono, un alumno por clase (también en otro pase de la misma clase y día).
    const otroConEsteTelefono = await prisma.registroDeAsistenciaQr.findFirst({
        where: {
            aparatoHash,
            studentId: { not: studentId },
            estado: { in: ['ACEPTADO', 'POR_CONFIRMAR'] },
            pase: { classroomId: pase.classroomId, subjectId: pase.subjectId, fecha: pase.fecha },
        },
        select: { id: true },
    });
    if (otroConEsteTelefono) {
        await registrar('RECHAZADO', 'TELEFONO_YA_USADO');
        throw new AsistenciaQrError(409, 'TELEFONO_YA_USADO', 'Este teléfono ya registró a otro alumno en esta clase. Cada uno, desde su teléfono.');
    }

    // 2. Una cuenta, un teléfono.
    if (config.unTelefonoPorAlumno) {
        const suyo = await prisma.aparatoDelAlumno.findUnique({ where: { studentId } });
        if (suyo && suyo.aparatoHash !== aparatoHash) {
            await registrar('RECHAZADO', 'OTRO_TELEFONO');
            throw new AsistenciaQrError(
                409,
                'OTRO_TELEFONO',
                'Tu cuenta está registrada en otro teléfono. Si lo cambiaste, pide al administrador que lo desbloquee.'
            );
        }
        if (!suyo) {
            const deOtro = await prisma.aparatoDelAlumno.findUnique({ where: { aparatoHash }, select: { studentId: true } });
            if (deOtro && deOtro.studentId !== studentId) {
                await registrar('RECHAZADO', 'TELEFONO_DE_OTRO');
                throw new AsistenciaQrError(409, 'TELEFONO_DE_OTRO', 'Este teléfono está registrado a otro alumno.');
            }
            await prisma.aparatoDelAlumno
                .create({ data: { studentId, aparatoHash, descripcion } })
                .catch(async () => {
                    // Dos escaneos a la vez: el otro ya lo registró. Si es de otro alumno, fuera.
                    const ahora = await prisma.aparatoDelAlumno.findUnique({ where: { aparatoHash }, select: { studentId: true } });
                    if (ahora && ahora.studentId !== studentId) {
                        throw new AsistenciaQrError(409, 'TELEFONO_DE_OTRO', 'Este teléfono está registrado a otro alumno.');
                    }
                });
        } else {
            await prisma.aparatoDelAlumno.update({ where: { studentId }, data: { ultimoUso: new Date() } });
        }
    }

    // 3. El faro.
    let estado = 'ACEPTADO';
    let motivo: string | null = null;
    let distancia: number | null = null;
    if (pase.latitud != null && pase.longitud != null) {
        if (ubicacion?.falsa) {
            await registrar('RECHAZADO', 'UBICACION_FALSA');
            throw new AsistenciaQrError(409, 'UBICACION_FALSA', 'Tu teléfono está usando una ubicación falsa. Apágala para pasar asistencia.');
        }
        if (!ubicacion) {
            estado = 'POR_CONFIRMAR';
            motivo = 'SIN_UBICACION';
        } else {
            distancia = distanciaEnMetros({ lat: pase.latitud, lng: pase.longitud }, ubicacion);
            if (ubicacion.precision != null && ubicacion.precision > config.radioMetros) {
                estado = 'POR_CONFIRMAR';
                motivo = 'UBICACION_IMPRECISA';
            } else if (distancia > config.radioMetros) {
                if (config.fueraDelRadio === 'bloquear') {
                    await registrar('RECHAZADO', 'FUERA_DEL_RADIO', { distancia });
                    throw new AsistenciaQrError(409, 'FUERA_DEL_RADIO', 'Estás demasiado lejos de la clase para pasar asistencia.');
                }
                estado = 'POR_CONFIRMAR';
                motivo = 'FUERA_DEL_RADIO';
            }
        }
    } else {
        motivo = 'SIN_FARO';
    }

    const asistencia = pase.esCorreccion || new Date() <= pase.aTiempoHasta ? 'PRESENT' : 'LATE';
    const asistenciaAnterior = estado === 'ACEPTADO' ? await escribirAsistencia(prisma, pase, studentId, asistencia) : null;
    await registrar(estado, motivo, { asistencia, asistenciaAnterior, distancia });

    return {
        estado,
        asistencia,
        mensaje:
            estado === 'ACEPTADO'
                ? asistencia === 'LATE'
                    ? 'Listo: quedaste registrado, pero como tarde.'
                    : 'Listo: quedaste registrado como presente.'
                : 'Enviado. Tu ubicación no se pudo confirmar: el profesor lo aprobará.',
        ...deLaClase,
    };
}

/** El profesor escanea el QR del alumno (forma 3). */
export async function escanearAlAlumno(opciones: { prisma: Prisma; instituteId: string; pase: any; codigo: unknown }) {
    const { prisma, instituteId, pase } = opciones;
    if (!estaAbierto(pase)) throw new AsistenciaQrError(410, 'PASE_CERRADO', 'El pase de lista ya se cerró.');
    const leido = leerCodigo(opciones.codigo);
    if (!leido || leido.tipo !== 'ALUMNO') throw new AsistenciaQrError(400, 'CODIGO_INVALIDO', 'Ese no es el QR de un alumno.');
    if (!mismaFirma(firmar(secretoDeAlumnos(instituteId), `${leido.id}.${leido.ventana}`), leido.firma)) {
        throw new AsistenciaQrError(400, 'CODIGO_INVALIDO', 'Ese no es el QR de un alumno de este liceo.');
    }
    if (!ventanaViva(leido.ventana)) {
        throw new AsistenciaQrError(400, 'CODIGO_CADUCADO', 'Ese QR ya cambió: es una captura vieja. Que el alumno enseñe el de su app.');
    }

    const alumno = await prisma.user.findUnique({
        where: { id: leido.id },
        select: { id: true, firstName: true, lastName: true, avatar: true, role: true },
    });
    if (!alumno || alumno.role !== 'STUDENT' || !(await estaInscrito(prisma, alumno.id, pase.classroomId))) {
        throw new AsistenciaQrError(403, 'NO_ES_DE_LA_SECCION', 'Ese alumno no está en esta sección.');
    }

    const nombre = `${alumno.firstName} ${alumno.lastName}`;
    const ya = await prisma.registroDeAsistenciaQr.findFirst({
        where: { paseId: pase.id, studentId: alumno.id, estado: 'ACEPTADO' },
        select: { asistencia: true },
    });
    if (ya) return { alumno: { id: alumno.id, nombre, foto: alumno.avatar ?? null }, asistencia: ya.asistencia, yaEstaba: true };

    const asistencia = pase.esCorreccion || new Date() <= pase.aTiempoHasta ? 'PRESENT' : 'LATE';
    const asistenciaAnterior = await escribirAsistencia(prisma, pase, alumno.id, asistencia);
    await prisma.registroDeAsistenciaQr.create({
        data: { paseId: pase.id, studentId: alumno.id, forma: 'PROFESOR_ESCANEA', estado: 'ACEPTADO', asistencia, asistenciaAnterior },
    });
    return { alumno: { id: alumno.id, nombre, foto: alumno.avatar ?? null }, asistencia, yaEstaba: false };
}

/** El profesor aprueba uno «por confirmar». */
export async function aprobarRegistro(prisma: Prisma, pase: any, registroId: string, quien: QuienActua) {
    const r = await prisma.registroDeAsistenciaQr.findFirst({ where: { id: registroId, paseId: pase.id } });
    if (!r) throw AppErrors.NotFound('Ese registro no es de este pase');
    if (r.estado !== 'POR_CONFIRMAR') return r;
    const asistencia = r.asistencia === 'LATE' ? 'LATE' : 'PRESENT';
    const asistenciaAnterior = await escribirAsistencia(prisma, pase, r.studentId, asistencia);
    return prisma.registroDeAsistenciaQr.update({
        where: { id: r.id },
        data: { estado: 'ACEPTADO', asistencia, asistenciaAnterior, resueltoPorId: quien.id, resueltoEn: new Date() },
    });
}

/**
 * El profesor quita a alguien de la lista ("esa no es Sofía"). En una clase
 * de hoy, queda ausente; en una corrección, vuelve a lo que tenía antes.
 */
export async function quitarRegistro(prisma: Prisma, pase: any, registroId: string, quien: QuienActua & QuienBorra) {
    const r = await prisma.registroDeAsistenciaQr.findFirst({ where: { id: registroId, paseId: pase.id } });
    if (!r) throw AppErrors.NotFound('Ese registro no es de este pase');
    if (r.estado === 'QUITADO' || r.estado === 'RECHAZADO') return r;

    if (r.estado === 'ACEPTADO') {
        if (!pase.esCorreccion) {
            await escribirAsistencia(prisma, pase, r.studentId, 'ABSENT');
        } else if (r.asistenciaAnterior) {
            await escribirAsistencia(prisma, pase, r.studentId, r.asistenciaAnterior);
        } else {
            // No tenía nada ese día: se quita la fila, con copia en la papelera.
            await borrarGuardandoCopia(prisma, 'dailyAttendance', { studentId: r.studentId, date: pase.fecha }, quien);
        }
    }
    return prisma.registroDeAsistenciaQr.update({
        where: { id: r.id },
        data: { estado: 'QUITADO', resueltoPorId: quien.id, resueltoEn: new Date() },
    });
}

/**
 * Cerrar el pase. En una clase de hoy, quien no escaneó queda AUSENTE —el
 * profesor ya lo vio en la lista de «faltan» antes de cerrar— salvo los que él
 * marque presentes a mano. En una corrección no se toca a nadie más.
 */
export async function cerrarPase(prisma: Prisma, pase: any, presentesAMano: string[] = []) {
    if (pase.cerradoEn) return { ausentes: 0, presentes: 0, yaCerrado: true };

    let ausentes = 0;
    let presentes = 0;
    if (!pase.esCorreccion) {
        const vista = await vistaDelPase(prisma, pase);
        // Quien quedó aceptado en OTRO pase de esta clase y día tampoco falta.
        const aceptadosAntes = new Set(
            (
                await prisma.registroDeAsistenciaQr.findMany({
                    where: { estado: 'ACEPTADO', pase: { classroomId: pase.classroomId, subjectId: pase.subjectId, fecha: pase.fecha } },
                    select: { studentId: true },
                })
            ).map((r: any) => r.studentId)
        );
        const aMano = new Set(presentesAMano);
        for (const a of vista.faltan) {
            if (aceptadosAntes.has(a.id)) continue;
            if (aMano.has(a.id)) {
                await escribirAsistencia(prisma, pase, a.id, 'PRESENT');
                presentes++;
            } else {
                await escribirAsistencia(prisma, pase, a.id, 'ABSENT');
                ausentes++;
            }
        }
    }

    await prisma.paseDeLista.update({ where: { id: pase.id }, data: { cerradoEn: new Date() } });
    return { ausentes, presentes, yaCerrado: false };
}

/** El QR del alumno (forma 3): cambia cada 10 s, como el del profesor. */
export function miCodigo(instituteId: string, studentId: string) {
    return { codigo: codigoDelAlumno(instituteId, studentId), cambiaEnMs: cambiaEnMs() };
}
