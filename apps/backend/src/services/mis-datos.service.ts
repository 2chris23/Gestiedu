import { randomUUID } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Writable } from 'stream';
import ExcelJS from 'exceljs';
import { platformPrisma } from '../config/database';
import { createError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';

/**
 * «DESCARGAR TODOS MIS DATOS» (19-oct-2026)
 *
 * Cristian: que pase lo que pase con Gestiedu —aunque deje de funcionar para
 * siempre— el liceo se quede con todo lo que hizo, sin tener que pedírselo a
 * nadie. Por eso lo que se baja se abre SIN Gestiedu: Excel y las fotos, en un
 * ZIP con contraseña AES-256 que abre 7-Zip (o cualquier programa de ZIP con
 * AES). No es un respaldo para restaurar: eso lo hacen los respaldos del
 * servidor (DESPLIEGUE.md §8).
 *
 *  - Se arma DE FONDO (regla 0: nada pesado al pedirlo): el pedido responde al
 *    instante y la pantalla pregunta cómo va. Un ZIP a la vez por proceso.
 *  - La contraseña la elige el director y vive solo en la memoria mientras se
 *    arma; no se guarda en ningún sitio. Son datos de menores.
 *  - El archivo caduca a las 24 h (`MIS_DATOS_HORAS`) y se borra del disco.
 *  - Con varios procesos, `MIS_DATOS_DIR` tiene que ser una carpeta que vean
 *    todos (un volumen compartido): quien arma no es siempre quien entrega.
 *
 * Todo en bloque: cada tabla grande se lee de 5.000 en 5.000, cediendo el
 * proceso entre trozos, y nunca una consulta por alumno.
 */

type Prisma_ = any;

const CARPETA = () => process.env.MIS_DATOS_DIR || path.join(os.tmpdir(), 'gestiedu-mis-datos');
const HORAS = () => Math.max(1, Number(process.env.MIS_DATOS_HORAS) || 24);
const TROZO = 5000;
const ceder = () => new Promise<void>((r) => setImmediate(r));

/**
 * La hora, en UTC. Las columnas son `TIMESTAMP` sin zona (como las de Prisma, que
 * escribe en UTC); `now()` a pelo daba la hora de la base (la de Venezuela en
 * esta máquina) y la pantalla leía la caducidad 4 h corrida.
 */
const AHORA_UTC = "timezone('UTC', now())";

export const CONTRASENA_MINIMA = 8;

// ── Qué hay: el estado de los pedidos ──────────────────────────────────────

export interface EstadoDeMisDatos {
    id: string;
    estado: 'ARMANDO' | 'LISTA' | 'FALLO' | 'CADUCADA';
    progreso: number;
    paso: string | null;
    bytes: number | null;
    error: string | null;
    creadaEn: string;
    caducaEn: string | null;
}

const fila = (f: any): EstadoDeMisDatos => ({
    id: f.id,
    estado: f.estado,
    progreso: Number(f.progreso),
    paso: f.paso ?? null,
    bytes: f.bytes == null ? null : Number(f.bytes),
    error: f.error ?? null,
    creadaEn: new Date(f.creadaEn).toISOString(),
    caducaEn: f.caducaEn ? new Date(f.caducaEn).toISOString() : null,
});

/** El último pedido del liceo. De paso tira lo caducado y lo que murió a medias. */
export async function elUltimo(prisma: Prisma_): Promise<EstadoDeMisDatos | null> {
    await limpiar(prisma);
    const [f] = await prisma.$queryRawUnsafe(`SELECT * FROM "exportaciones" ORDER BY "creadaEn" DESC LIMIT 1`);
    return f ? fila(f) : null;
}

async function limpiar(prisma: Prisma_) {
    const viejas: any[] = await prisma.$queryRawUnsafe(
        `UPDATE "exportaciones" SET "estado" = 'CADUCADA', "archivo" = NULL WHERE "estado" = 'LISTA' AND "caducaEn" < ${AHORA_UTC} RETURNING "archivo"`
    );
    // Un proceso que murió armando deja de latir: a los 10 min, se da por fallado.
    await prisma.$executeRawUnsafe(
        `UPDATE "exportaciones" SET "estado" = 'FALLO', "error" = 'Se interrumpió. Vuelve a pedirla.' WHERE "estado" = 'ARMANDO' AND "latidoEn" < ${AHORA_UTC} - interval '10 minutes'`
    );
    // También los de hace un día con archivo de un pedido anterior.
    for (const v of viejas) if (v.archivo) fs.promises.rm(v.archivo, { force: true }).catch(() => undefined);
}

export async function elArchivo(prisma: Prisma_, id: string): Promise<{ ruta: string; bytes: number }> {
    await limpiar(prisma);
    const [f]: any[] = await prisma.$queryRawUnsafe(`SELECT "estado", "archivo", "bytes" FROM "exportaciones" WHERE "id" = $1`, id);
    if (!f) throw createError(404, 'No existe ese pedido', 'NO_EXISTE');
    if (f.estado !== 'LISTA' || !f.archivo) throw createError(409, f.estado === 'CADUCADA' ? 'Ya caducó: pide otra' : 'Aún no está lista', 'NO_ESTA_LISTA');
    if (!fs.existsSync(f.archivo)) throw createError(410, 'El archivo ya no está en el servidor: pide otra', 'YA_NO_ESTA');
    return { ruta: f.archivo, bytes: Number(f.bytes) };
}

// ── Pedir ──────────────────────────────────────────────────────────────────

/** Una a la vez por proceso: armar es pesado y no le puede quitar el proceso a la gente. */
let enCola: Promise<unknown> = Promise.resolve();

export async function pedir(prisma: Prisma_, instituteId: string, quien: string, contrasena: string): Promise<EstadoDeMisDatos> {
    if (typeof contrasena !== 'string' || contrasena.length < CONTRASENA_MINIMA || contrasena.length > 128) {
        throw createError(400, `La contraseña del archivo debe tener al menos ${CONTRASENA_MINIMA} caracteres`, 'CONTRASENA_CORTA');
    }
    await limpiar(prisma);
    const [armando]: any[] = await prisma.$queryRawUnsafe(`SELECT "id" FROM "exportaciones" WHERE "estado" = 'ARMANDO' LIMIT 1`);
    if (armando) throw createError(409, 'Ya se está preparando una descarga: espera a que termine', 'YA_SE_ESTA_ARMANDO');
    const id = randomUUID();
    await prisma.$executeRawUnsafe(`INSERT INTO "exportaciones" ("id", "pedidoPor", "paso", "creadaEn", "latidoEn") VALUES ($1, $2, 'En la cola', ${AHORA_UTC}, ${AHORA_UTC})`, id, quien);
    const tarea = enCola.then(() => armar(prisma, instituteId, id, contrasena));
    enCola = tarea.catch(() => undefined);
    void tarea.catch(async (e) => {
        logger.error('Mis datos: no se pudo armar', { error: e instanceof Error ? e.message : String(e) });
        await prisma.$executeRawUnsafe(`UPDATE "exportaciones" SET "estado" = 'FALLO', "error" = 'No se pudo preparar. Vuelve a intentarlo.' WHERE "id" = $1`, id).catch(() => undefined);
    });
    const [f] = await prisma.$queryRawUnsafe(`SELECT * FROM "exportaciones" WHERE "id" = $1`, id);
    return fila(f);
}

// ── Armar ──────────────────────────────────────────────────────────────────

interface Columna {
    titulo: string;
    ancho?: number;
}

/** Una hoja de Excel: cabecera en negrita, fija arriba, con filtros. */
async function excel(hojas: Array<{ nombre: string; columnas: Columna[]; filas: Array<unknown[]> }>): Promise<Buffer> {
    const libro = new ExcelJS.Workbook();
    libro.creator = 'Gestiedu';
    for (const h of hojas) {
        const hoja = libro.addWorksheet(h.nombre.slice(0, 31), { views: [{ state: 'frozen', ySplit: 1 }] });
        hoja.columns = h.columnas.map((c) => ({ header: c.titulo, width: c.ancho ?? 18 }));
        hoja.getRow(1).font = { bold: true };
        if (h.columnas.length) hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: h.columnas.length } };
        for (let i = 0; i < h.filas.length; i++) {
            hoja.addRow(h.filas[i]);
            if (i % TROZO === TROZO - 1) await ceder();
        }
    }
    return Buffer.from(await libro.xlsx.writeBuffer());
}

/** Lee una tabla grande de 5.000 en 5.000 (por id), cediendo entre trozos. */
async function todo<T>(leer: (cursor: string | undefined) => Promise<T[]>): Promise<T[]> {
    const salida: T[] = [];
    let cursor: string | undefined;
    for (;;) {
        const trozo = await leer(cursor);
        salida.push(...trozo);
        if (trozo.length < TROZO) return salida;
        cursor = (trozo[trozo.length - 1] as any).id;
        await ceder();
    }
}
const paginado = (cursor: string | undefined) => ({ take: TROZO, orderBy: { id: 'asc' as const }, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}) });

const dia = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : '');
const num = (v: unknown) => (v == null ? '' : Number(v));
const nombre = (u: any) => (u ? `${u.lastName ?? ''}, ${u.firstName ?? ''}`.replace(/^, |, $/g, '') : '');
const ESTADO_ASISTENCIA: Record<string, string> = { PRESENT: 'Presente', ABSENT: 'Ausente', LATE: 'Tarde', EXCUSED: 'Justificado' };
const ROL: Record<string, string> = { STUDENT: 'Estudiante', TEACHER: 'Profesor', TUTOR: 'Representante', ADMIN: 'Administrador' };
const limpioParaArchivo = (t: string) => t.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'sin-nombre';

async function armar(prisma: Prisma_, instituteId: string, id: string, contrasena: string): Promise<void> {
    const { ZipWriter, Uint8ArrayReader, TextReader, configure } = await import('@zip.js/zip.js');
    configure({ useWebWorkers: false });

    const latir = (progreso: number, paso: string) =>
        prisma.$executeRawUnsafe(`UPDATE "exportaciones" SET "progreso" = $2, "paso" = $3, "latidoEn" = ${AHORA_UTC} WHERE "id" = $1`, id, Math.min(99, Math.round(progreso)), paso);

    fs.mkdirSync(CARPETA(), { recursive: true });
    const ruta = path.join(CARPETA(), `${id}.zip`);
    const salida = fs.createWriteStream(ruta);
    const zip = new ZipWriter(Writable.toWeb(salida) as any, { password: contrasena, encryptionStrength: 3, level: 6 });
    const meter = (nombreDelArchivo: string, datos: Uint8Array | string) =>
        zip.add(nombreDelArchivo, typeof datos === 'string' ? new TextReader(datos) : new Uint8ArrayReader(datos));

    const liceo = await platformPrisma.institute.findUnique({ where: { id: instituteId }, select: { name: true, code: true } });
    const ciclos: any[] = await prisma.academicYear.findMany({ orderBy: { startDate: 'asc' } });
    const pasos = 3 + ciclos.length;
    let hecho = 0;
    const avance = (paso: string) => latir((++hecho / pasos) * 100, paso);

    // Las personas, una vez: todos los ciclos las nombran.
    await latir(1, 'Las personas');
    const usuarios: any[] = await todo((c) =>
        prisma.user.findMany({
            ...paginado(c),
            select: { id: true, firstName: true, lastName: true, email: true, phone: true, role: true, gender: true, birthDate: true, address: true, nacionalidad: true, isActive: true, status: true, specialization: true },
        })
    );
    const quien = new Map(usuarios.map((u) => [u.id, u]));
    const reps: any[] = await prisma.studentTutor.findMany({ select: { studentId: true, tutorId: true, relationship: true } });
    const repsDe = new Map<string, string[]>();
    for (const r of reps) {
        const t = quien.get(r.tutorId);
        if (!t) continue;
        repsDe.set(r.studentId, [...(repsDe.get(r.studentId) ?? []), `${nombre(t)} (${r.relationship}, ${t.phone ?? 'sin teléfono'})`]);
    }
    await meter(
        'Personas.xlsx',
        await excel([
            {
                nombre: 'Personas',
                columnas: [{ titulo: 'Cédula' }, { titulo: 'Apellidos, nombres', ancho: 32 }, { titulo: 'Rol' }, { titulo: 'Correo', ancho: 30 }, { titulo: 'Teléfono' }, { titulo: 'Sexo' }, { titulo: 'Nacimiento' }, { titulo: 'Dirección', ancho: 30 }, { titulo: 'Activo' }, { titulo: 'Representantes', ancho: 50 }],
                filas: usuarios.map((u) => [u.id, nombre(u), ROL[u.role] ?? u.role, u.email, u.phone ?? '', u.gender ?? '', dia(u.birthDate), u.address ?? '', u.isActive ? 'Sí' : 'No', (repsDe.get(u.id) ?? []).join('; ')]),
            },
        ])
    );
    await avance('Las personas');

    for (const ciclo of ciclos) {
        const carpeta = `${limpioParaArchivo(ciclo.name)}/`;
        const secciones: any[] = await prisma.classroom.findMany({ where: { academicYearId: ciclo.id }, select: { id: true, name: true } });
        const seccion = new Map(secciones.map((s) => [s.id, s.name]));
        const ids = secciones.map((s) => s.id);
        const materias = new Map((await prisma.subject.findMany({ select: { id: true, name: true } })).map((m: any) => [m.id, m.name]));
        const lapsos = new Map((await prisma.period.findMany({ where: { academicYearId: ciclo.id }, select: { id: true, name: true } })).map((p: any) => [p.id, p.name]));

        await latir((hecho / pasos) * 100, `${ciclo.name}: estudiantes`);
        const inscritos: any[] = await prisma.studentClassroom.findMany({ where: { academicYearId: ciclo.id }, select: { studentId: true, classroomId: true, isActive: true, enrollmentDate: true } });
        const expedientes: any[] = await prisma.academicRecord.findMany({ where: { academicYearId: ciclo.id } });

        await latir((hecho / pasos) * 100, `${ciclo.name}: notas`);
        const notas: any[] = ids.length
            ? await todo((c) =>
                  prisma.grade.findMany({
                      ...paginado(c),
                      where: { period: { academicYearId: ciclo.id } },
                      select: { id: true, studentId: true, subjectId: true, periodId: true, score: true, comments: true, createdAt: true, activity: { select: { title: true, classroomId: true } } },
                  })
              )
            : [];
        const actividades: any[] = ids.length
            ? await todo((c) =>
                  prisma.classActivity.findMany({ ...paginado(c), where: { classroomId: { in: ids } }, select: { id: true, title: true, classroomId: true, subjectId: true, dueDate: true, maxScore: true, scores: true, createdAt: true } })
              )
            : [];
        const filasDeActividades: unknown[][] = [];
        for (const a of actividades) {
            for (const [alumno, nota] of Object.entries((a.scores ?? {}) as Record<string, unknown>)) {
                if (nota === null || nota === undefined || nota === '') continue;
                filasDeActividades.push([alumno, nombre(quien.get(alumno)), seccion.get(a.classroomId) ?? '', materias.get(a.subjectId) ?? '', a.title, dia(a.dueDate ?? a.createdAt), typeof nota === 'object' ? JSON.stringify(nota) : nota, num(a.maxScore)]);
            }
        }

        await latir((hecho / pasos) * 100, `${ciclo.name}: asistencia`);
        const asistencia: any[] = ids.length
            ? await todo((c) => prisma.dailyAttendance.findMany({ ...paginado(c), where: { classroomId: { in: ids } }, select: { id: true, studentId: true, classroomId: true, date: true, status: true, excuseNote: true } }))
            : [];
        const observaciones: any[] = await prisma.observation.findMany({
            where: { OR: [{ classroomId: { in: ids } }, { date: { gte: ciclo.startDate, lte: ciclo.endDate } }] },
            select: { studentId: true, title: true, description: true, type: true, date: true, createdById: true, classroomId: true },
        });

        await meter(
            `${carpeta}Estudiantes y notas.xlsx`,
            await excel([
                {
                    nombre: 'Estudiantes',
                    columnas: [{ titulo: 'Cédula' }, { titulo: 'Apellidos, nombres', ancho: 32 }, { titulo: 'Sección' }, { titulo: 'Inscrito el' }, { titulo: 'Activo' }, { titulo: 'Representantes', ancho: 50 }],
                    filas: inscritos.map((i) => [i.studentId, nombre(quien.get(i.studentId)), seccion.get(i.classroomId) ?? '', dia(i.enrollmentDate), i.isActive ? 'Sí' : 'No', (repsDe.get(i.studentId) ?? []).join('; ')]),
                },
                {
                    nombre: 'Notas de actividades',
                    columnas: [{ titulo: 'Cédula' }, { titulo: 'Alumno', ancho: 32 }, { titulo: 'Sección' }, { titulo: 'Materia', ancho: 24 }, { titulo: 'Actividad', ancho: 30 }, { titulo: 'Fecha' }, { titulo: 'Nota' }, { titulo: 'Sobre' }],
                    filas: filasDeActividades,
                },
                {
                    nombre: 'Notas del plan',
                    columnas: [{ titulo: 'Cédula' }, { titulo: 'Alumno', ancho: 32 }, { titulo: 'Sección' }, { titulo: 'Materia', ancho: 24 }, { titulo: 'Lapso' }, { titulo: 'Evaluación', ancho: 30 }, { titulo: 'Nota' }, { titulo: 'Comentario', ancho: 30 }],
                    filas: notas.map((n) => [n.studentId, nombre(quien.get(n.studentId)), seccion.get(n.activity?.classroomId) ?? '', materias.get(n.subjectId) ?? '', lapsos.get(n.periodId) ?? '', n.activity?.title ?? '', num(n.score), n.comments ?? '']),
                },
                {
                    nombre: 'Resumen final',
                    columnas: [{ titulo: 'Cédula' }, { titulo: 'Alumno', ancho: 32 }, { titulo: 'Sección' }, { titulo: 'Promedio' }, { titulo: 'Condición' }, { titulo: 'Egreso' }, { titulo: 'Materias (definitivas)', ancho: 60 }],
                    filas: expedientes.map((e) => [e.studentId, nombre(quien.get(e.studentId)), e.sectionSnapshot ?? '', num(e.finalAverage), e.finalResult ?? e.status ?? '', e.egreso ?? '', e.subjectGrades ? JSON.stringify(e.subjectGrades) : '']),
                },
            ])
        );
        await meter(
            `${carpeta}Asistencia y observaciones.xlsx`,
            await excel([
                {
                    nombre: 'Asistencia',
                    columnas: [{ titulo: 'Cédula' }, { titulo: 'Alumno', ancho: 32 }, { titulo: 'Sección' }, { titulo: 'Fecha' }, { titulo: 'Estado' }, { titulo: 'Justificación', ancho: 30 }],
                    filas: asistencia.map((a) => [a.studentId, nombre(quien.get(a.studentId)), seccion.get(a.classroomId) ?? '', dia(a.date), ESTADO_ASISTENCIA[a.status] ?? a.status, a.excuseNote ?? '']),
                },
                {
                    nombre: 'Observaciones',
                    columnas: [{ titulo: 'Cédula' }, { titulo: 'Alumno', ancho: 32 }, { titulo: 'Sección' }, { titulo: 'Fecha' }, { titulo: 'Tipo' }, { titulo: 'Título', ancho: 30 }, { titulo: 'Descripción', ancho: 60 }, { titulo: 'La puso' , ancho: 28 }],
                    filas: observaciones.map((o) => [o.studentId, nombre(quien.get(o.studentId)), seccion.get(o.classroomId) ?? '', dia(o.date), o.type, o.title, o.description ?? '', nombre(quien.get(o.createdById))]),
                },
            ])
        );

        // Las finanzas del ciclo (si el liceo las usa).
        const [cobros, pagosAlPersonal, fondos, gastos]: any[][] = await Promise.all([
            prisma.payment.findMany({ where: { academicYearId: ciclo.id }, orderBy: { paidAt: 'asc' } }),
            prisma.pagoAlPersonal.findMany({ where: { academicYearId: ciclo.id }, include: { personal: { select: { nombre: true, cedula: true, cargo: true, userId: true } } }, orderBy: { fecha: 'asc' } }),
            prisma.fondoDelLiceo.findMany({ where: { fecha: { gte: ciclo.startDate, lte: ciclo.endDate } }, orderBy: { fecha: 'asc' } }),
            prisma.gasto.findMany({ where: { fecha: { gte: ciclo.startDate, lte: ciclo.endDate } }, orderBy: { fecha: 'asc' } }),
        ]);
        if (cobros.length + pagosAlPersonal.length + fondos.length + gastos.length > 0) {
            const anulado = (x: any) => (x.annulledAt || x.anuladoEn ? 'Anulado' : '');
            await meter(
                `${carpeta}Finanzas.xlsx`,
                await excel([
                    {
                        nombre: 'Cobros',
                        columnas: [{ titulo: 'Recibo' }, { titulo: 'Fecha' }, { titulo: 'Cédula' }, { titulo: 'Alumno', ancho: 32 }, { titulo: 'Método' }, { titulo: 'Referencia' }, { titulo: 'Moneda' }, { titulo: 'Monto' }, { titulo: 'Tasa' }, { titulo: 'En moneda base' }, { titulo: 'Estado' }],
                        filas: cobros.map((p) => [p.receiptNumber, dia(p.paidAt), p.studentId, nombre(quien.get(p.studentId)), p.method, p.reference ?? '', p.currency, num(p.amount), num(p.exchangeRate), num(p.amountBase), anulado(p)]),
                    },
                    {
                        nombre: 'Pagos al personal',
                        columnas: [{ titulo: 'Número' }, { titulo: 'Fecha' }, { titulo: 'Persona', ancho: 32 }, { titulo: 'Cargo' }, { titulo: 'Método' }, { titulo: 'Moneda' }, { titulo: 'Monto' }, { titulo: 'En moneda base' }, { titulo: 'Estado' }],
                        filas: pagosAlPersonal.map((p) => [p.numero, dia(p.fecha), p.personal?.userId ? nombre(quien.get(p.personal.userId)) : p.personal?.nombre ?? '', p.personal?.cargo ?? '', p.metodo, p.moneda, num(p.monto), num(p.montoBase), anulado(p)]),
                    },
                    {
                        nombre: 'Fondos',
                        columnas: [{ titulo: 'Fecha' }, { titulo: 'Concepto' }, { titulo: 'Descripción', ancho: 30 }, { titulo: 'Moneda' }, { titulo: 'Monto' }, { titulo: 'En moneda base' }, { titulo: 'Estado' }],
                        filas: fondos.map((f) => [dia(f.fecha), f.concepto, f.descripcion ?? '', f.moneda, num(f.monto), num(f.montoBase), anulado(f)]),
                    },
                    {
                        nombre: 'Gastos',
                        columnas: [{ titulo: 'Fecha' }, { titulo: 'Concepto', ancho: 28 }, { titulo: 'Categoría' }, { titulo: 'Proveedor' }, { titulo: 'Moneda' }, { titulo: 'Monto' }, { titulo: 'En moneda base' }, { titulo: 'Factura (en facturas/)' }, { titulo: 'Estado' }],
                        filas: gastos.map((g) => [dia(g.fecha), g.concepto, g.categoria, g.proveedor ?? '', g.moneda, num(g.monto), num(g.montoBase), g.comprobanteId ? `${g.comprobanteId}.webp` : '', anulado(g)]),
                    },
                ])
            );
        }
        await avance(`${ciclo.name}: listo`);
    }

    // Las fotos y las facturas, de 200 en 200 (son lo que más pesa).
    await latir((hecho / pasos) * 100, 'Fotos y facturas');
    for (let cursor: string | undefined; ; ) {
        const fotos: any[] = await prisma.userPhoto.findMany({ take: 200, orderBy: { userId: 'asc' }, ...(cursor ? { skip: 1, cursor: { userId: cursor } } : {}), select: { userId: true, data: true } });
        for (const f of fotos) await meter(`fotos/${limpioParaArchivo(f.userId)}.webp`, new Uint8Array(f.data));
        if (fotos.length < 200) break;
        cursor = fotos[fotos.length - 1].userId;
        await ceder();
    }
    for (let cursor: string | undefined; ; ) {
        const facturas: any[] = await prisma.comprobante.findMany({ ...{ take: 200, orderBy: { id: 'asc' } }, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}), select: { id: true, data: true } });
        for (const f of facturas) await meter(`facturas/${f.id}.webp`, new Uint8Array(f.data));
        if (facturas.length < 200) break;
        cursor = facturas[facturas.length - 1].id;
        await ceder();
    }
    await avance('Fotos y facturas');

    await meter(
        'LEEME.txt',
        [
            `Datos de ${liceo?.name ?? 'el liceo'}${liceo?.code ? ` (${liceo.code})` : ''}, sacados de Gestiedu el ${new Date().toLocaleString('es-VE')}.`,
            '',
            'Esto es de su liceo. Se abre sin Gestiedu:',
            '  - Personas.xlsx: estudiantes, profesores, representantes y administradores.',
            '  - Una carpeta por ciclo escolar: estudiantes y notas, asistencia y observaciones, y finanzas.',
            '  - fotos/: la foto de perfil de cada persona (su cédula es el nombre del archivo).',
            '  - facturas/: la foto de cada factura de gastos.',
            '',
            'Los .xlsx se abren con Excel, LibreOffice (gratis) o Google Hojas de cálculo.',
            'Las fotos .webp se abren con cualquier navegador.',
            '',
            'Contienen datos de menores de edad: guárdelos en un sitio seguro y no los comparta.',
        ].join('\r\n')
    );

    await zip.close();
    await new Promise<void>((ok, mal) => (salida.closed ? ok() : salida.once('close', ok).once('error', mal)));
    const bytes = fs.statSync(ruta).size;
    await prisma.$executeRawUnsafe(
        `UPDATE "exportaciones" SET "estado" = 'LISTA', "progreso" = 100, "paso" = 'Lista', "archivo" = $2, "bytes" = $3, "listaEn" = ${AHORA_UTC}, "caducaEn" = ${AHORA_UTC} + ($4 || ' hours')::interval, "latidoEn" = ${AHORA_UTC} WHERE "id" = $1`,
        id,
        ruta,
        bytes,
        String(HORAS())
    );
}
