import { createPrivateKey, createPublicKey, sign, verify } from 'crypto';
import bcrypt from 'bcrypt';
import { AppErrors, createError } from '../middleware/error.middleware';
import { RedisCache } from '../config/redis';
import { boletaDelAlumno } from './boleta.service';
import { certificacionDelAlumno } from './certificacion.service';
import { datosDelPlantel, valoresDelAlumno, fechaLarga } from './constancias.service';
import { plantillaDe, parrafosDe } from './plantillas-de-documentos.service';
import { abreviaturaDe } from './resumen-final.service';
import { borrarGuardandoCopia } from '../utils/papelera';
import { avisarSiFalla } from '../utils/sin-callar';

/**
 * EL TRASLADO Y EL RETIRO
 *
 * Cuando un alumno se va a otro liceo a mitad de año:
 *
 *   1. **Retirar** (`retirar`): la fecha y el motivo quedan en su inscripción
 *      (`retiradoEl`, `motivoDeRetiro`: los cuenta la estadística de
 *      matrícula), deja la sección y su cuenta se archiva, como al archivar.
 *   2. **La hoja de notas parciales** (`notasParciales`): cada lapso del año
 *      en curso y las definitivas de los años anteriores, con membrete, para
 *      imprimir. Las mismas cuentas de la boleta y la certificación.
 *   3. **El archivo de traslado** (`archivoDeTraslado`): lo mismo, más sus
 *      datos y los de sus representantes, FIRMADO por la plataforma (Ed25519,
 *      `TRASLADO_LLAVE_PRIVADA`). Si el otro liceo usa Gestiedu, lo importa y
 *      el alumno llega con todo. Firmado = se sabe de qué liceo viene y que
 *      nadie lo tocó. No va cifrado, igual que la hoja impresa: lo lleva el
 *      liceo, no se publica.
 *
 * Y en el liceo que lo recibe, **importar** (`revisarArchivo` + `importar`):
 * se comprueba la firma, se ve antes de guardar, se crea el alumno en la
 * sección elegida; los años anteriores entran como «de otro plantel» en su
 * certificación y los lapsos ya cursados este año cuentan en sus promedios
 * (`NotaDeOtroPlantel`; MAPA_DE_CALCULOS.md §1). Todo es del admin.
 *
 * Pruebas: `tests/integration/traslado.test.ts` (TRAS-*).
 */

const VERSION = 1;

// ─── La firma ────────────────────────────────────────────────────────────────

function llavePrivada() {
    const v = process.env.TRASLADO_LLAVE_PRIVADA;
    if (!v) throw createError(503, 'El servidor no tiene la llave de los traslados (TRASLADO_LLAVE_PRIVADA)', 'SIN_LLAVE_DE_TRASLADO');
    return createPrivateKey({ key: Buffer.from(v, 'base64'), format: 'der', type: 'pkcs8' });
}

/** El texto que se firma: el JSON de los datos con las claves en orden (no depende de cómo se escribió). */
export function textoCanonico(v: unknown): string {
    if (Array.isArray(v)) return `[${v.map(textoCanonico).join(',')}]`;
    if (v && typeof v === 'object') {
        return `{${Object.keys(v as object)
            .sort()
            .filter((k) => (v as any)[k] !== undefined)
            .map((k) => `${JSON.stringify(k)}:${textoCanonico((v as any)[k])}`)
            .join(',')}}`;
    }
    return JSON.stringify(v);
}

function firmar(datos: unknown): string {
    return sign(null, Buffer.from(textoCanonico(datos)), llavePrivada()).toString('base64');
}

function firmaValida(datos: unknown, firma: unknown): boolean {
    if (typeof firma !== 'string' || !firma) return false;
    try {
        return verify(null, Buffer.from(textoCanonico(datos)), createPublicKey(llavePrivada()), Buffer.from(firma, 'base64'));
    } catch (e: any) {
        if (e?.code === 'SIN_LLAVE_DE_TRASLADO') throw e;
        return false;
    }
}

// ─── Retirar ─────────────────────────────────────────────────────────────────

export interface DatosDelRetiro {
    fecha: string;
    motivo: 'TRASLADO' | 'OTRO';
    /** A qué plantel se va (traslado) o por qué (otro). */
    detalle?: string | null;
}

export async function retirar(prisma: any, actor: string, studentId: string, d: DatosDelRetiro, hoy: string) {
    const a = await prisma.user.findUnique({ where: { id: studentId }, select: { id: true, role: true, status: true } });
    if (!a || a.role !== 'STUDENT') throw AppErrors.NotFound('Estudiante');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha) || d.fecha > hoy) throw createError(400, 'La fecha del retiro no puede ser futura', 'RETIRO_INVALIDO');
    if (d.motivo !== 'TRASLADO' && d.motivo !== 'OTRO') throw createError(400, 'Motivo: traslado u otro', 'RETIRO_INVALIDO');
    const detalle = (d.detalle ?? '').trim().slice(0, 160);
    const inscripcion = await prisma.studentClassroom.findFirst({
        where: { studentId, isActive: true, academicYear: { status: { not: 'COMPLETED' } } },
        orderBy: { enrollmentDate: 'desc' },
    });
    if (!inscripcion) throw createError(409, 'El alumno no está inscrito en ninguna sección: no hay de dónde retirarlo', 'NO_INSCRITO');
    const motivo = d.motivo === 'TRASLADO' ? `Traslado${detalle ? ` a ${detalle}` : ''}` : detalle || 'Retiro';

    await prisma.$transaction([
        prisma.studentClassroom.updateMany({
            where: { studentId, isActive: true, academicYear: { status: { not: 'COMPLETED' } } },
            data: { isActive: false },
        }),
        prisma.studentClassroom.update({
            where: { id: inscripcion.id },
            data: { isActive: false, retiradoEl: new Date(`${d.fecha}T00:00:00.000Z`), motivoDeRetiro: motivo },
        }),
        prisma.user.update({
            where: { id: studentId },
            data: { status: 'ARCHIVED', isActive: false, archivedAt: new Date(`${d.fecha}T12:00:00.000Z`) },
        }),
        prisma.refreshToken.deleteMany({ where: { userId: studentId } }),
        prisma.auditLog.create({
            data: { action: 'UPDATE', entity: 'USER', entityType: 'USER', entityId: studentId, userId: actor, metadata: { action: 'RETIRO', fecha: d.fecha, motivo } },
        }),
    ]);
    return { retiradoEl: d.fecha, motivo };
}

// ─── La hoja de notas parciales ──────────────────────────────────────────────

export async function notasParciales(prisma: any, instituteId: string, studentId: string, hoy: string) {
    const [boleta, certificacion, plantel, plantilla, alumno, inscripcion] = await Promise.all([
        boletaDelAlumno(prisma, instituteId, studentId, { hoy }),
        certificacionDelAlumno(prisma, instituteId, studentId, hoy),
        datosDelPlantel(instituteId, hoy),
        plantillaDe(instituteId, 'NOTAS_PARCIALES'),
        prisma.user.findUnique({
            where: { id: studentId },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                tipoDeCedula: true,
                nacionalidad: true,
                birthDate: true,
                gender: true,
                lugarDeNacimiento: true,
                entidadDeNacimiento: true,
                cedulaEscolar: true,
                email: true,
                phone: true,
                address: true,
                studentTutorings: {
                    orderBy: { createdAt: 'asc' },
                    select: { relationship: true, tutor: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } } },
                },
            },
        }),
        prisma.studentClassroom.findFirst({
            where: { studentId },
            orderBy: [{ isActive: 'desc' }, { enrollmentDate: 'desc' }],
            select: { retiradoEl: true, motivoDeRetiro: true, academicYearId: true },
        }),
    ]);
    const seccion = { grade: boleta.seccion.grado, section: boleta.seccion.seccion, shift: boleta.seccion.turno };
    const retiro = inscripcion?.retiradoEl ? { fecha: inscripcion.retiradoEl.toISOString().slice(0, 10), motivo: inscripcion.motivoDeRetiro } : null;
    const valores = {
        ...plantel.valores,
        ...valoresDelAlumno(alumno, seccion, boleta.ciclo.nombre, plantel.nivel),
        cursa: retiro ? 'cursó' : 'cursa',
        fechaDeRetiro: retiro ? fechaLarga(retiro.fecha) : '',
    };
    const lapsosConNotas = boleta.lapsos.map((l, i) => ({ numero: i + 1, id: l.id, nombre: l.nombre }));
    return {
        titulo: plantilla.titulo,
        parrafos: parrafosDe(plantilla.texto, valores),
        liceo: plantel.liceo,
        firmante: plantel.firmante,
        alumno,
        ciclo: boleta.ciclo,
        seccion: boleta.seccion,
        lapsos: lapsosConNotas,
        materias: boleta.materias.map((m) => ({
            nombre: m.nombre,
            abreviatura: abreviaturaDe({ name: m.nombre, code: null }),
            cualitativa: m.cualitativa,
            notas: Object.fromEntries(lapsosConNotas.map((l) => [String(l.numero), m.cualitativa ? null : m.notas[l.id] ?? null])),
            apreciaciones: Object.fromEntries(lapsosConNotas.map((l) => [String(l.numero), m.apreciaciones[l.id] ?? null])),
        })),
        // Los años ya terminados (de aquí o de otro plantel), menos el que cursa.
        anosAnteriores: certificacion.anos.filter((a: any) => a.fuente !== 'SIN_DATOS' && a.grado < boleta.seccion.grado),
        retiro,
        emitidaEl: hoy,
    };
}

// ─── El archivo de traslado ──────────────────────────────────────────────────

export async function archivoDeTraslado(prisma: any, instituteId: string, studentId: string, hoy: string) {
    const h = await notasParciales(prisma, instituteId, studentId, hoy);
    const a = h.alumno;
    const datos = {
        version: VERSION,
        emitidoEl: hoy,
        origen: { liceo: h.liceo.nombre, codigoDea: h.liceo.codigoDea, ciudad: h.liceo.ciudad },
        alumno: {
            cedula: a.id,
            tipoDeCedula: a.tipoDeCedula ?? null,
            cedulaEscolar: a.cedulaEscolar ?? null,
            nombres: a.firstName,
            apellidos: a.lastName,
            sexo: a.gender ?? null,
            fechaDeNacimiento: a.birthDate ? a.birthDate.toISOString().slice(0, 10) : null,
            nacionalidad: a.nacionalidad ?? null,
            lugarDeNacimiento: a.lugarDeNacimiento ?? null,
            entidadDeNacimiento: a.entidadDeNacimiento ?? null,
            correo: a.email ?? null,
            telefono: a.phone ?? null,
            direccion: a.address ?? null,
        },
        representantes: a.studentTutorings.map((t: any) => ({
            cedula: t.tutor.id,
            nombres: t.tutor.firstName,
            apellidos: t.tutor.lastName,
            parentesco: t.relationship,
            correo: t.tutor.email ?? null,
            telefono: t.tutor.phone ?? null,
        })),
        anoEnCurso: {
            anoEscolar: h.ciclo.nombre,
            grado: h.seccion.grado,
            lapsos: h.lapsos.map((l) => ({ numero: l.numero, nombre: l.nombre })),
            materias: h.materias.map((m) => ({ nombre: m.nombre, cualitativa: m.cualitativa, notas: m.notas, apreciaciones: m.apreciaciones })),
            retiro: h.retiro,
        },
        anosAnteriores: h.anosAnteriores.map((x: any) => ({
            grado: x.grado,
            anoEscolar: x.anoEscolar,
            plantel: x.plantel,
            codigoDelPlantel: x.codigoDelPlantel,
            entidad: x.entidad,
            materias: x.materias,
        })),
    };
    return { formato: 'gestiedu-traslado', datos, firma: firmar(datos) };
}

// ─── Importar en el liceo que lo recibe ──────────────────────────────────────

type Archivo = { formato?: unknown; datos?: any; firma?: unknown };

function leerArchivo(archivo: Archivo) {
    if (!archivo || archivo.formato !== 'gestiedu-traslado' || !archivo.datos || typeof archivo.datos !== 'object') {
        throw createError(400, 'Eso no es un archivo de traslado de Gestiedu', 'ARCHIVO_INVALIDO');
    }
    if (!firmaValida(archivo.datos, archivo.firma)) {
        throw createError(400, 'La firma del archivo no cuadra: o no viene de Gestiedu, o alguien lo cambió. No se importa.', 'FIRMA_INVALIDA');
    }
    if (archivo.datos.version !== VERSION) throw createError(400, 'Versión de archivo desconocida', 'ARCHIVO_INVALIDO');
    return archivo.datos;
}

const normal = (t: string) =>
    t
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

/** Qué materia de ESTA sección corresponde a cada una del archivo (por nombre o por abreviatura del MPPE). */
function emparejar(deOrigen: Array<{ nombre: string }>, deAqui: Array<{ id: string; name: string; code: string | null }>) {
    const porNombre = new Map(deAqui.map((m) => [normal(m.name), m.id]));
    const porAbreviatura = new Map(deAqui.map((m) => [abreviaturaDe({ name: m.name, code: null }), m.id]));
    return Object.fromEntries(
        deOrigen.map((m) => [m.nombre, porNombre.get(normal(m.nombre)) ?? porAbreviatura.get(abreviaturaDe({ name: m.nombre, code: null })) ?? null])
    ) as Record<string, string | null>;
}

async function materiasDeLaSeccion(prisma: any, classroomId: string) {
    const aula = await prisma.classroom.findUnique({
        where: { id: classroomId },
        select: {
            id: true,
            name: true,
            grade: true,
            academicYearId: true,
            academicYear: { select: { status: true } },
            subjects: { select: { subject: { select: { id: true, name: true, code: true, evaluacion: true } } } },
        },
    });
    if (!aula) throw AppErrors.NotFound('Sección');
    return aula;
}

/** Lo que trae el archivo, y cómo entraría en esa sección (sin guardar nada). */
export async function revisarArchivo(prisma: any, archivo: Archivo, classroomId?: string) {
    const d = leerArchivo(archivo);
    const [yaExiste, correoEnUso] = await Promise.all([
        prisma.user.count({ where: { id: d.alumno.cedula } }),
        d.alumno.correo ? prisma.user.count({ where: { email: String(d.alumno.correo).toLowerCase() } }) : 0,
    ]);
    let emparejamiento: Record<string, string | null> | null = null;
    let materias: Array<{ id: string; nombre: string }> = [];
    if (classroomId) {
        const aula = await materiasDeLaSeccion(prisma, classroomId);
        const numericas = aula.subjects.map((s: any) => s.subject).filter((s: any) => s.evaluacion !== 'CUALITATIVA');
        materias = numericas.map((s: any) => ({ id: s.id, nombre: s.name }));
        emparejamiento = emparejar(d.anoEnCurso.materias.filter((m: any) => !m.cualitativa), numericas);
    }
    return { valido: true, datos: d, yaExiste: yaExiste > 0, correoEnUso: correoEnUso > 0, materiasDeLaSeccion: materias, emparejamiento };
}

export interface Importacion {
    archivo: Archivo;
    classroomId: string;
    password: string;
    /** Si el correo del archivo ya lo usa alguien aquí, otro. */
    email?: string | null;
    /** Materia del archivo → materia de aquí (o null: no se trae). Sin decir nada, la sugerida. */
    emparejamiento?: Record<string, string | null>;
}

export async function importar(prisma: any, instituteId: string, actor: string, imp: Importacion) {
    const revisado = await revisarArchivo(prisma, imp.archivo, imp.classroomId);
    const d = revisado.datos;
    if (revisado.yaExiste) {
        throw createError(409, `Ya hay alguien con la cédula ${d.alumno.cedula} en este liceo: búscalo en Usuarios`, 'CEDULA_EN_USO');
    }
    const correo = String(imp.email || d.alumno.correo || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw createError(400, 'Hace falta un correo para su cuenta', 'CORREO_REQUERIDO');
    if (await prisma.user.count({ where: { email: correo } })) throw createError(409, 'Ese correo ya lo usa otra cuenta de este liceo: pon otro', 'CORREO_EN_USO');
    if (!imp.password || imp.password.length < 8) throw createError(400, 'La contraseña va de 8 letras o más', 'CONTRASENA_REQUERIDA');

    const aula = await materiasDeLaSeccion(prisma, imp.classroomId);
    if (aula.academicYear.status === 'COMPLETED') throw createError(409, 'Esa sección es de un año ya cerrado', 'ANO_CERRADO');
    const idsDeAqui = new Set(aula.subjects.map((s: any) => s.subject.id));
    const emparejamiento = { ...(revisado.emparejamiento ?? {}), ...(imp.emparejamiento ?? {}) };
    for (const id of Object.values(emparejamiento)) {
        if (id && !idsDeAqui.has(id)) throw createError(400, 'Una materia elegida no es de esa sección', 'EMPAREJAMIENTO_INVALIDO');
    }
    const lapsos = await prisma.period.findMany({ where: { academicYearId: aula.academicYearId }, orderBy: { startDate: 'asc' }, select: { id: true } });
    const plantel = String(d.origen?.liceo ?? 'Otro plantel').slice(0, 160);
    const codigo = d.origen?.codigoDea ? String(d.origen.codigoDea).slice(0, 20) : null;
    const nacimiento = d.alumno.fechaDeNacimiento && /^\d{4}-\d{2}-\d{2}$/.test(d.alumno.fechaDeNacimiento) ? new Date(`${d.alumno.fechaDeNacimiento}T00:00:00.000Z`) : null;
    const texto = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);

    const notasDelAno: Array<{ periodId: string; subjectId: string; nota: number; materiaDeOrigen: string }> = [];
    for (const m of d.anoEnCurso.materias as any[]) {
        const subjectId = emparejamiento[m.nombre];
        if (!subjectId || m.cualitativa) continue;
        for (const [numero, nota] of Object.entries(m.notas ?? {})) {
            const periodo = lapsos[Number(numero) - 1];
            if (periodo && typeof nota === 'number' && nota >= 0 && nota <= 20) {
                notasDelAno.push({ periodId: periodo.id, subjectId, nota, materiaDeOrigen: String(m.nombre).slice(0, 80) });
            }
        }
    }

    await prisma.$transaction(async (tx: any) => {
        await tx.user.create({
            data: {
                id: String(d.alumno.cedula).slice(0, 64),
                email: correo,
                password: await bcrypt.hash(imp.password, 12),
                firstName: String(d.alumno.nombres).slice(0, 50),
                lastName: String(d.alumno.apellidos).slice(0, 50),
                role: 'STUDENT',
                instituteId,
                gender: ['MASCULINO', 'FEMENINO', 'OTRO'].includes(d.alumno.sexo) ? d.alumno.sexo : null,
                birthDate: nacimiento,
                phone: texto(d.alumno.telefono, 20),
                address: texto(d.alumno.direccion, 255),
                nacionalidad: d.alumno.nacionalidad === 'V' || d.alumno.nacionalidad === 'E' ? d.alumno.nacionalidad : null,
                tipoDeCedula: d.alumno.tipoDeCedula === 'ESCOLAR' || d.alumno.tipoDeCedula === 'IDENTIDAD' ? d.alumno.tipoDeCedula : null,
                cedulaEscolar: texto(d.alumno.cedulaEscolar, 20),
                lugarDeNacimiento: texto(d.alumno.lugarDeNacimiento, 120),
                entidadDeNacimiento: texto(d.alumno.entidadDeNacimiento, 40),
                isActive: true,
            },
        });
        await tx.studentClassroom.create({
            data: { studentId: d.alumno.cedula, classroomId: aula.id, academicYearId: aula.academicYearId, plantelDeOrigen: plantel },
        });
        // Los años anteriores, para su certificación.
        for (const ano of d.anosAnteriores as any[]) {
            for (const m of ano.materias ?? []) {
                await tx.calificacionExterna.create({
                    data: {
                        studentId: d.alumno.cedula,
                        grado: Number(ano.grado),
                        anoEscolar: String(ano.anoEscolar ?? '').slice(0, 9),
                        materia: String(m.nombre).slice(0, 80),
                        nota: typeof m.nota === 'number' ? m.nota : null,
                        apreciacion: texto(m.apreciacion, 40),
                        tipo: ['F', 'R', 'MP'].includes(m.tipo) ? m.tipo : 'F',
                        fecha: texto(m.fecha, 7),
                        plantel: String(ano.plantel ?? plantel).slice(0, 160),
                        codigoDelPlantel: texto(ano.codigoDelPlantel, 20),
                        entidad: texto(ano.entidad, 60),
                        registradaPor: actor,
                    },
                });
            }
        }
        for (const n of notasDelAno) {
            await tx.notaDeOtroPlantel.create({ data: { studentId: d.alumno.cedula, ...n, plantel, codigoDelPlantel: codigo } });
        }
        await tx.auditLog.create({
            data: { action: 'CREATE', entity: 'USER', entityType: 'USER', entityId: d.alumno.cedula, userId: actor, metadata: { action: 'IMPORTAR_TRASLADO', desde: plantel } },
        });
    });
    await RedisCache.clearPattern(`grade:avg:student:${d.alumno.cedula}:*`).catch(avisarSiFalla('traslado.service'));

    return {
        alumno: { cedula: d.alumno.cedula, nombre: `${d.alumno.nombres} ${d.alumno.apellidos}`, correo },
        seccion: { id: aula.id, nombre: aula.name },
        notasTraidas: notasDelAno.length,
        anosAnteriores: (d.anosAnteriores as any[]).length,
        // Sus representantes: para crearles la cuenta (o enlazarlos) desde su ficha.
        representantes: d.representantes,
    };
}

/** Las notas traídas de otro plantel de un alumno (para su ficha), y quitarlas. */
export async function notasTraidas(prisma: any, studentId: string) {
    return prisma.notaDeOtroPlantel.findMany({
        where: { studentId },
        select: { id: true, nota: true, materiaDeOrigen: true, plantel: true, subject: { select: { name: true } }, period: { select: { name: true } } },
        orderBy: [{ period: { startDate: 'asc' } }],
    });
}

export async function quitarNotaTraida(prisma: any, actor: string, studentId: string, id: string) {
    const n = await borrarGuardandoCopia(prisma, 'notaDeOtroPlantel', { id, studentId }, { usuarioId: actor, motivo: 'nota traída quitada' });
    if (n === 0) throw AppErrors.NotFound('Nota traída');
    await RedisCache.clearPattern(`grade:avg:student:${studentId}:*`).catch(avisarSiFalla('traslado.service'));
    return { quitadas: n };
}
