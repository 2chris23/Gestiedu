import { FastifyInstance } from 'fastify';
import { createHash, randomUUID } from 'crypto';
import * as zlib from 'zlib';
import { promisify } from 'util';
import { monitorEventLoopDelay } from 'perf_hooks';
import { getTenantPrisma, platformPrisma } from '../config/database';
import { generateTokenPair } from '../config/jwt';
import { conLiceo } from '../config/ambito-del-liceo';
import { logger } from '../utils/logger';
import { instituteTimezone, todayInTimezone } from '../utils/school-time';
import { lasPantallasDe, elPlanDeLasPantallas, esUnaLecturaValida, losIdsDe, laUltimaMarca, apuntarLoQuePesa, CABECERA_INTERNA, MARCA_INTERNA, RESTAURADO } from './precarga.service';
import { elMenuDelRol, laHuella } from './paquete-de-precarga.service';
import { lasSeccionesDelProfesor, precalentarLosPromedios } from './precalentar-promedios.service';

const gzipAsync = promisify(zlib.gzip);

/**
 * LA DESCARGA EN CUBOS (18-oct-2026)
 *
 * La regla de Cristian: «lo único que puede frenar a una persona es su teléfono
 * o su internet, nunca el sistema». Medido antes: el servidor armaba la
 * descarga de cada persona AL ENTRAR, de uno en uno por proceso; 300 alumnos en
 * frío esperaban hasta 83 s para bajar 27 KB cada uno (con 15.000, horas).
 *
 * Ahora, la lógica de los motores de sincronización que aguantan millones
 * (los «buckets» de PowerSync, los «shapes» de ElectricSQL, el arranque de
 * Linear), sobre el árbol del liceo que pensó Cristian:
 *
 *   - La descarga de una persona son unos pocos CUBOS ya comprimidos:
 *       · `liceo:ROL`          — lo del liceo, igual para todos los de ese rol;
 *       · `seccion:ROL:<id>`   — lo de la sección, igual para sus alumnos;
 *       · `persona:<id>:<n>`   — lo suyo, partido en trozos para que un cambio
 *                                rehaga solo el trozo que toca.
 *     Solo se comparte lo que está COMPROBADO que sale idéntico para todos
 *     (PRECARGA-AMBITO). Lo demás es de cada persona: ver no es lo mismo para
 *     todos (el profesor solo ve sus observaciones).
 *   - Su ÍNDICE (qué cubos son suyos) también está armado de antemano.
 *   - TODO se arma ANTES: de noche para todo el liceo (también para quien
 *     nunca ha entrado), al crear una cuenta y, cada vez que algo cambia,
 *     solo los cubos que ese cambio toca. Al entrar no se arma nada: se lee
 *     el índice y se bajan archivos.
 *   - El trabajo se reparte entre procesos con la cola en la base
 *     (`FOR UPDATE SKIP LOCKED`): sin Redis también, y nadie arma dos veces lo
 *     mismo. Y cede ante la gente: si el proceso va retrasado, espera.
 */

// ── Qué se comparte (comprobado en PRECARGA-AMBITO) ─────────────────────────

/** Iguales para todas las personas de un rol. */
const DEL_LICEO: RegExp[] = [
    /^\/institutes\/current\/(config|academic-config|membrete)$/,
    /^\/asistencia-qr\/configuracion$/,
    /^\/payments\/settings$/,
];

/** Iguales para todos los alumnos (o representantes) de una sección. */
const DE_LA_SECCION: RegExp[] = [
    /^\/schedules\/classroom\/([^/?]+)$/,
    /^\/sessions\/live-overview\?classroomId=([^&]+)&date=\d{4}-\d{2}-\d{2}$/,
    /^\/class-replacements\?classroomId=([^&]+)&from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}$/,
];
const ROLES_CON_SECCION_COMPARTIDA = new Set(['STUDENT', 'TUTOR']);

/** En cuántos trozos va lo de cada persona (más lecturas, más trozos). */
const TROZOS_POR_ROL: Record<string, number> = { ADMIN: 64, TEACHER: 16, STUDENT: 2, TUTOR: 4 };

export interface Grupo {
    clave: string;
    lecturas: Set<string>;
    ids: Set<string>;
    sinIds: boolean;
    dueno: string | null;
}

const trozoDe = (texto: string, n: number) => parseInt(createHash('sha1').update(texto).digest('hex').slice(0, 8), 16) % n;

export function laClaveDelCubo(lectura: string, yo: { id: string; role: string }, deTodos: Set<string>): { clave: string; dueno: string | null; ids: string[] } {
    const ids = losIdsDe(lectura, deTodos).filter((i) => i !== yo.id);
    if (DEL_LICEO.some((re) => re.test(lectura))) return { clave: `liceo:${yo.role}`, dueno: null, ids };
    if (ROLES_CON_SECCION_COMPARTIDA.has(yo.role)) {
        for (const re of DE_LA_SECCION) {
            const m = re.exec(lectura);
            if (m) return { clave: `seccion:${yo.role}:${decodeURIComponent(m[1])}`, dueno: null, ids };
        }
    }
    const grupo = ids[0] ?? 'yo';
    return { clave: `persona:${yo.id}:${trozoDe(grupo, TROZOS_POR_ROL[yo.role] ?? 4)}`, dueno: yo.id, ids };
}

export function agruparEnCubos(lecturas: string[], yo: { id: string; role: string }, deTodos: Set<string>): Map<string, Grupo> {
    const grupos = new Map<string, Grupo>();
    for (const l of lecturas) {
        const { clave, dueno, ids } = laClaveDelCubo(l, yo, deTodos);
        let g = grupos.get(clave);
        if (!g) grupos.set(clave, (g = { clave, lecturas: new Set(), ids: new Set(), sinIds: false, dueno }));
        g.lecturas.add(l);
        for (const i of ids) g.ids.add(i);
        if (!ids.length) g.sinIds = true;
    }
    return grupos;
}

function losDeTodos(ctx: Record<string, unknown> | undefined): Set<string> {
    const c = ctx ?? {};
    const s = new Set<string>(['anio', 'ciclo', 'hoy', 'lunes', 'viernes', 'domingo'].map((k) => c[k]).filter((v): v is string => typeof v === 'string'));
    for (const l of Array.isArray(c.lapsos) ? (c.lapsos as string[]) : []) s.add(l);
    return s;
}

// ── Leer como una persona (sin red, sin cupo) ───────────────────────────────

async function credencialDe(prisma: any, liceo: string, usuarioId: string) {
    const u = await prisma.user.findUnique({ where: { id: usuarioId }, select: { id: true, email: true, role: true, isActive: true } });
    if (!u || !u.isActive) return null;
    const inst = await platformPrisma.institute.findFirst({ where: { OR: [{ id: liceo }, { slug: liceo }] }, select: { id: true, slug: true } });
    const instituteId = inst?.id ?? liceo;
    const { accessToken } = generateTokenPair({ id: u.id, userId: u.id, email: u.email, role: u.role, instituteId }, randomUUID());
    return {
        usuario: u,
        cabeceras: {
            authorization: `Bearer ${accessToken}`,
            [CABECERA_INTERNA]: MARCA_INTERNA,
            'x-institute-id': instituteId,
            'x-institute-slug': inst?.slug ?? liceo,
            accept: 'application/json',
        } as Record<string, string>,
    };
}

async function leerLasLecturas(fastify: FastifyInstance, liceo: string, cabeceras: Record<string, string>, lecturas: string[]): Promise<string[]> {
    const lineas: string[] = new Array(lecturas.length);
    let i = 0;
    const trabajador = async () => {
        while (i < lecturas.length) {
            const k = i++;
            const clave = lecturas[k];
            try {
                const r = await fastify.inject({ method: 'GET', url: `/api${clave}`, headers: cabeceras });
                if (r.statusCode === 200 && String(r.headers['content-type'] ?? '').includes('json')) {
                    lineas[k] = '{"c":' + JSON.stringify(clave) + ',"d":' + r.payload + '}';
                    apuntarLoQuePesa(liceo, clave, r.payload.length);
                } else lineas[k] = JSON.stringify({ c: clave, f: r.statusCode });
            } catch {
                lineas[k] = JSON.stringify({ c: clave, f: 500 });
            }
        }
    };
    await Promise.all(Array.from({ length: Math.min(6, lecturas.length) }, trabajador));
    return lineas;
}

async function guardarElCubo(prisma: any, g: { clave: string; lecturas: string[]; ids: string[]; sinIds: boolean; dueno: string | null; armadoComo: string }, lineas: string[], marca: number) {
    const contenido = await gzipAsync(Buffer.from(lineas.join('\n'), 'utf-8'));
    const huella = createHash('sha256').update(contenido).digest('hex').slice(0, 32);
    await prisma.$executeRawUnsafe(
        `INSERT INTO "cubos_de_precarga" AS t ("clave","lecturas","ids","sinIds","dueno","armadoComo","contenido","huella","bytes","marca","firma","sucio","armadoEn")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,false,now())
         ON CONFLICT ("clave") DO UPDATE SET
           "lecturas" = EXCLUDED."lecturas", "firma" = EXCLUDED."firma", "ids" = EXCLUDED."ids", "sinIds" = EXCLUDED."sinIds", "dueno" = EXCLUDED."dueno",
           "armadoComo" = EXCLUDED."armadoComo", "contenido" = EXCLUDED."contenido", "huella" = EXCLUDED."huella",
           "bytes" = EXCLUDED."bytes", "marca" = EXCLUDED."marca", "armadoEn" = now(),
           -- Si alguien lo ensució MIENTRAS se armaba (otro cambio), sigue sucio.
           "sucio" = CASE WHEN t."marca" > EXCLUDED."marca" THEN t."sucio" ELSE false END
         WHERE t."marca" <= EXCLUDED."marca" OR t."contenido" IS NULL`,
        g.clave,
        g.lecturas,
        g.ids,
        g.sinIds,
        g.dueno,
        g.armadoComo,
        contenido,
        huella,
        contenido.length,
        marca,
        firmaDe(g.lecturas)
    );
    return { huella, bytes: contenido.length };
}

const firmaDe = (lecturas: Iterable<string>) => createHash('sha1').update([...lecturas].sort().join('\n')).digest('hex');

// ── Armar el índice de una persona (y los cubos que le falten) ──────────────

export async function prepararAUnaPersona(fastify: FastifyInstance, liceo: string, usuarioId: string): Promise<{ cubos: number; armados: number } | null> {
    const prisma = await getTenantPrisma(liceo);
    const cred = await credencialDe(prisma, liceo, usuarioId);
    if (!cred) {
        await prisma.$executeRawUnsafe(`DELETE FROM "indices_de_precarga" WHERE "usuarioId" = $1`, usuarioId);
        return null;
    }
    const yo = { id: cred.usuario.id, role: cred.usuario.role as string };
    const marca = await laUltimaMarca(prisma);
    const [pagos, pae, guia] = await Promise.all([
        prisma.paymentSettings.findUnique({ where: { id: 'liceo' }, select: { enabled: true } }).catch(() => null),
        prisma.paeConfig.findUnique({ where: { id: 'liceo' }, select: { enabled: true } }).catch(() => null),
        yo.role === 'TEACHER' ? prisma.classroom.count({ where: { teacherId: yo.id, isActive: true } }) : Promise.resolve(0),
    ]);
    const menu = elMenuDelRol(yo.role, Boolean(pagos?.enabled), Boolean(pae?.enabled), guia > 0);
    if (yo.role === 'ADMIN' || yo.role === 'TEACHER') {
        const alcance = yo.role === 'TEACHER' ? { secciones: await lasSeccionesDelProfesor(prisma, yo.id) } : {};
        await precalentarLosPromedios(prisma, liceo, alcance).catch(() => undefined);
    }
    const pantallas = await lasPantallasDe(prisma, yo, menu);
    const plan = elPlanDeLasPantallas(pantallas, yo.role);
    const grupos = agruparEnCubos(plan.lecturas.filter(esUnaLecturaValida), yo, losDeTodos(pantallas[0]?.ctx as any));

    const claves = [...grupos.keys()];
    const existentes: Array<{ clave: string; firma: string; sucio: boolean; vacio: boolean }> = await prisma.$queryRawUnsafe(
        `SELECT "clave", "firma", "sucio", ("contenido" IS NULL) AS vacio FROM "cubos_de_precarga" WHERE "clave" = ANY($1)`,
        claves
    );
    const porClave = new Map(existentes.map((e) => [e.clave, e]));
    let armados = 0;
    for (const g of grupos.values()) {
        const e = porClave.get(g.clave);
        const lecturas = [...g.lecturas];
        if (e && !e.sucio && !e.vacio && e.firma === firmaDe(lecturas)) continue;
        // Un cubo compartido que otro ya armó hoy con OTRAS lecturas (la
        // sección de otro día): se rehace con las de ahora.
        const lineas = await leerLasLecturas(fastify, liceo, cred.cabeceras, lecturas);
        await guardarElCubo(prisma, { clave: g.clave, lecturas, ids: [...g.ids], sinIds: g.sinIds, dueno: g.dueno, armadoComo: yo.id }, lineas, marca);
        armados++;
    }
    const tz = await instituteTimezone(prisma);
    const huellaDeLaPersona = await laHuella(prisma, { id: yo.id, role: yo.role, isActive: true });
    await prisma.$executeRawUnsafe(
        `INSERT INTO "indices_de_precarga" ("usuarioId","claves","paginas","version","huellaDeLaPersona","dia","pendiente","armadoEn")
         VALUES ($1,$2,$3,$4,$5,$6,false,now())
         ON CONFLICT ("usuarioId") DO UPDATE SET "claves" = EXCLUDED."claves", "paginas" = EXCLUDED."paginas", "version" = EXCLUDED."version",
           "huellaDeLaPersona" = EXCLUDED."huellaDeLaPersona", "dia" = EXCLUDED."dia", "armadoEn" = now()`,
        yo.id,
        claves,
        plan.paginas,
        plan.version,
        huellaDeLaPersona,
        todayInTimezone(tz)
    );
    return { cubos: claves.length, armados };
}

/** Rehace un cubo sucio, como quien lo armó (o como otra persona de su ámbito). */
export async function rehacerUnCubo(fastify: FastifyInstance, liceo: string, clave: string): Promise<boolean> {
    const prisma = await getTenantPrisma(liceo);
    const [c]: Array<{ lecturas: string[]; ids: string[]; sinIds: boolean; dueno: string | null; armadoComo: string | null }> = await prisma.$queryRawUnsafe(
        `SELECT "lecturas","ids","sinIds","dueno","armadoComo" FROM "cubos_de_precarga" WHERE "clave" = $1`,
        clave
    );
    if (!c) return false;
    const marca = await laUltimaMarca(prisma);
    let cred = c.armadoComo ? await credencialDe(prisma, liceo, c.armadoComo) : null;
    if (!cred && !c.dueno) {
        // Quien lo armó ya no está: otra persona del mismo ámbito.
        const [, rol, seccion] = clave.split(':');
        const otro: Array<{ id: string }> = seccion
            ? await prisma.$queryRawUnsafe(
                  rol === 'TUTOR'
                      ? `SELECT st."tutorId" id FROM student_tutors st JOIN student_classrooms sc ON sc."studentId" = st."studentId" AND sc."isActive" JOIN users u ON u.id = st."tutorId" AND u."isActive" WHERE sc."classroomId" = $1 LIMIT 1`
                      : `SELECT u.id FROM student_classrooms sc JOIN users u ON u.id = sc."studentId" AND u."isActive" WHERE sc."classroomId" = $1 AND sc."isActive" LIMIT 1`,
                  seccion
              )
            : await prisma.$queryRawUnsafe(`SELECT id FROM users WHERE role = $1::"UserRole" AND "isActive" LIMIT 1`, rol);
        if (otro[0]) cred = await credencialDe(prisma, liceo, otro[0].id);
    }
    if (!cred) {
        await prisma.$executeRawUnsafe(`DELETE FROM "cubos_de_precarga" WHERE "clave" = $1`, clave);
        return false;
    }
    const lineas = await leerLasLecturas(fastify, liceo, cred.cabeceras, c.lecturas);
    await guardarElCubo(prisma, { clave, lecturas: c.lecturas, ids: c.ids, sinIds: c.sinIds, dueno: c.dueno, armadoComo: cred.usuario.id }, lineas, marca);
    return true;
}

// ── Pedir que se prepare a alguien (no espera) ──────────────────────────────

export const PRIORIDAD = { ENTRANDO: 100, CAMBIO: 50, CUENTA_NUEVA: 30, DIA_NUEVO: 10, NOCHE: 0 } as const;

export async function pedirQueSePrepare(liceo: string, usuarioIds: string[], prioridad: number): Promise<void> {
    if (!usuarioIds.length) return;
    const prisma = await getTenantPrisma(liceo);
    await prisma.$executeRawUnsafe(
        `INSERT INTO "indices_de_precarga" ("usuarioId","pendiente","prioridad","pedidoEn")
         SELECT unnest($1::text[]), true, $2, now()
         ON CONFLICT ("usuarioId") DO UPDATE SET "pendiente" = true,
           "prioridad" = GREATEST(CASE WHEN "indices_de_precarga"."pendiente" THEN "indices_de_precarga"."prioridad" ELSE 0 END, EXCLUDED."prioridad"),
           "pedidoEn" = CASE WHEN "indices_de_precarga"."pendiente" THEN "indices_de_precarga"."pedidoEn" ELSE now() END`,
        usuarioIds,
        prioridad
    );
    hayTrabajoEn(liceo);
}

// ── Ensuciar los cubos que toca cada cambio ─────────────────────────────────

export async function ensuciarPorLosCambios(liceo: string): Promise<number> {
    const prisma = await getTenantPrisma(liceo);
    const [cur]: Array<{ hasta: bigint }> = await prisma.$queryRawUnsafe(`SELECT "hasta" FROM "cursor_de_los_cubos" WHERE "id" = 'liceo'`);
    const desde = Number(cur?.hasta ?? 0);
    if (!cur) {
        // Primera vez: se empieza desde el último (los cubos se arman con lo de ahora).
        await prisma.$executeRawUnsafe(`INSERT INTO "cursor_de_los_cubos" ("id","hasta") VALUES ('liceo', $1) ON CONFLICT DO NOTHING`, await laUltimaMarca(prisma));
        return 0;
    }
    const cambios: Array<{ id: number; ids: string[]; destinatarios: string[]; todos: boolean; recurso: string; accion: string }> = await prisma.cambioDelLiceo.findMany({
        where: { id: { gt: desde } },
        select: { id: true, ids: true, destinatarios: true, todos: true, recurso: true, accion: true },
        orderBy: { id: 'asc' },
        take: 500,
    });
    if (!cambios.length) return 0;
    let n = 0;
    for (const c of cambios) {
        if (c.recurso === RESTAURADO.recurso && c.accion === RESTAURADO.accion) {
            n += await prisma.$executeRawUnsafe(`UPDATE "cubos_de_precarga" SET "sucio" = true, "prioridad" = $1 WHERE NOT "sucio"`, PRIORIDAD.CAMBIO);
            continue;
        }
        // Lo que nombra ids que cambiaron (si es de una persona, solo si le toca).
        if (c.ids.length) {
            n += await prisma.$executeRawUnsafe(
                `UPDATE "cubos_de_precarga" SET "sucio" = true, "prioridad" = $4 WHERE NOT "sucio" AND "ids" && $1::text[]
                   AND ("dueno" IS NULL OR $2 OR "dueno" = ANY($3::text[]))`,
                c.ids,
                c.todos,
                c.destinatarios,
                PRIORIDAD.CAMBIO
            );
        }
        // Lo que no nombra a nadie (listas, resúmenes): si el cambio le toca.
        n += await prisma.$executeRawUnsafe(
            `UPDATE "cubos_de_precarga" SET "sucio" = true, "prioridad" = $3 WHERE NOT "sucio" AND "sinIds"
               AND (("dueno" IS NULL AND $1) OR ("dueno" IS NOT NULL AND ($1 OR "dueno" = ANY($2::text[]))))`,
            c.todos,
            c.destinatarios,
            PRIORIDAD.CAMBIO
        );
        // Algo nuevo o quitado (un alumno, una sección): las listas de qué
        // leer cambian. Se rehace el índice de quien le toca (y de los admin).
        if (c.accion === 'creado' || c.accion === 'borrado') {
            const admins: Array<{ id: string }> = await prisma.$queryRawUnsafe(`SELECT id FROM users WHERE role = 'ADMIN' AND "isActive"`);
            await pedirQueSePrepare(liceo, [...new Set([...c.destinatarios, ...admins.map((a) => a.id)])], PRIORIDAD.CAMBIO);
        }
    }
    await prisma.$executeRawUnsafe(`UPDATE "cursor_de_los_cubos" SET "hasta" = GREATEST("hasta", $1) WHERE "id" = 'liceo'`, cambios[cambios.length - 1].id);
    return n;
}

// ── Los trabajadores ────────────────────────────────────────────────────────

const conTrabajo = new Set<string>();
export function hayTrabajoEn(liceo: string): void {
    conTrabajo.add(liceo);
    despertar?.();
}

const retraso = monitorEventLoopDelay({ resolution: 20 });
retraso.enable();
/** Si el proceso va retrasado atendiendo a la gente, el trabajo de fondo espera. */
async function cederAnteLaGente(): Promise<void> {
    for (let i = 0; i < 20; i++) {
        const p99 = retraso.percentile(99) / 1e6;
        retraso.reset();
        if (p99 < 150) return;
        await new Promise((r) => setTimeout(r, 500));
    }
}

/** Un trabajo de la cola del liceo, o null si no hay. */
async function tomarUnTrabajo(liceo: string): Promise<{ tipo: 'persona' | 'cubo'; id: string } | null> {
    const prisma = await getTenantPrisma(liceo);
    const [p]: Array<{ usuarioId: string }> = await prisma.$queryRawUnsafe(
        `UPDATE "indices_de_precarga" SET "pendiente" = false
          WHERE "usuarioId" = (SELECT "usuarioId" FROM "indices_de_precarga" WHERE "pendiente" ORDER BY "prioridad" DESC, "pedidoEn" LIMIT 1 FOR UPDATE SKIP LOCKED)
          RETURNING "usuarioId"`
    );
    if (p) return { tipo: 'persona', id: p.usuarioId };
    const [c]: Array<{ clave: string }> = await prisma.$queryRawUnsafe(
        `UPDATE "cubos_de_precarga" SET "sucio" = false, "prioridad" = 0
          WHERE "clave" = (SELECT "clave" FROM "cubos_de_precarga" WHERE "sucio" ORDER BY "prioridad" DESC LIMIT 1 FOR UPDATE SKIP LOCKED)
          RETURNING "clave"`
    );
    if (c) return { tipo: 'cubo', id: c.clave };
    return null;
}

export async function hacerElTrabajoDe(fastify: FastifyInstance, liceo: string, tope = Infinity): Promise<number> {
    let hechos = 0;
    await conLiceo(liceo, async () => {
        // Un liceo sin ningún índice (recién creado, o el primer día de los
        // cubos) se pone entero en la cola, sin esperar a la noche.
        const prisma = await getTenantPrisma(liceo);
        const [h]: Array<{ hay: boolean }> = await prisma.$queryRawUnsafe(`SELECT EXISTS (SELECT 1 FROM "indices_de_precarga") AS hay`);
        if (!h?.hay) await laNocheDeLosCubos(liceo);
        else await elDiaNuevo(liceo);
        await ensuciarPorLosCambios(liceo);
        while (hechos < tope) {
            await cederAnteLaGente();
            const t = await tomarUnTrabajo(liceo);
            if (!t) break;
            try {
                if (t.tipo === 'persona') await prepararAUnaPersona(fastify, liceo, t.id);
                else await rehacerUnCubo(fastify, liceo, t.id);
            } catch (e) {
                logger.warn('cubos: un trabajo falló (se vuelve a intentar luego)', { liceo, tipo: t.tipo, error: e instanceof Error ? e.message : String(e) });
                const prisma = await getTenantPrisma(liceo);
                if (t.tipo === 'persona') await prisma.$executeRawUnsafe(`UPDATE "indices_de_precarga" SET "pendiente" = true, "prioridad" = 0 WHERE "usuarioId" = $1`, t.id);
                else await prisma.$executeRawUnsafe(`UPDATE "cubos_de_precarga" SET "sucio" = true WHERE "clave" = $1`, t.id);
                break;
            }
            hechos++;
        }
    });
    return hechos;
}

let despertar: (() => void) | null = null;
let parado = false;

/**
 * Los trabajadores de este proceso (`PRECARGA_TRABAJADORES`, 2 por defecto).
 * Cada uno toma un liceo con trabajo y lo hace; sin trabajo, duerme hasta que
 * alguien avise o pase un rato (y entonces mira todos los liceos, por si otro
 * proceso apuntó algo).
 */
/** Cada cuánto se miran TODOS los liceos (lo de cada momento llega por aviso). */
const REPASO_MS = 10 * 60_000;
const ultimoAviso = new Map<string, number>();

export function empezarLosTrabajadores(fastify: FastifyInstance): void {
    if (process.env.NODE_ENV === 'test') return;
    const n = Math.max(1, Number(process.env.PRECARGA_TRABAJADORES) || 2);
    let ultimaRonda = 0;
    const enCurso = new Set<string>();
    const trabajador = async () => {
        while (!parado) {
            if (Date.now() - ultimaRonda > REPASO_MS) {
                ultimaRonda = Date.now();
                const liceos = await platformPrisma.institute.findMany({ where: { status: 'ACTIVE' }, select: { id: true } }).catch(() => []);
                for (const l of liceos) conTrabajo.add(l.id);
            }
            const liceo = [...conTrabajo].find((l) => !enCurso.has(l));
            if (!liceo) {
                await new Promise<void>((r) => {
                    const t = setTimeout(r, 15_000);
                    t.unref?.();
                    despertar = () => {
                        clearTimeout(t);
                        r();
                    };
                });
                continue;
            }
            conTrabajo.delete(liceo);
            enCurso.add(liceo);
            try {
                const hechos = await hacerElTrabajoDe(fastify, liceo, 50);
                if (hechos >= 50) conTrabajo.add(liceo); // queda más: luego sigue, sin acaparar
            } catch (e) {
                // Una vez por hora y liceo: un liceo sin base no puede llenar el registro.
                if (Date.now() - (ultimoAviso.get(liceo) ?? 0) > 3600_000) {
                    ultimoAviso.set(liceo, Date.now());
                    logger.warn('cubos: el liceo no se pudo trabajar', { liceo, error: e instanceof Error ? e.message : String(e) });
                }
            } finally {
                enCurso.delete(liceo);
            }
        }
    };
    for (let i = 0; i < n; i++) void trabajador();
}

export function pararLosTrabajadores(): void {
    parado = true;
    despertar?.();
}

// ── De noche: todo el liceo al día, también quien nunca entró ───────────────

export async function laNocheDeLosCubos(liceo: string): Promise<{ personas: number; cubosViejos: number }> {
    const prisma = await getTenantPrisma(liceo);
    const activos: Array<{ id: string }> = await prisma.$queryRawUnsafe(`SELECT id FROM users WHERE "isActive"`);
    await prisma.$executeRawUnsafe(`DELETE FROM "indices_de_precarga" WHERE "usuarioId" <> ALL($1::text[])`, activos.map((a) => a.id));
    await pedirQueSePrepare(liceo, activos.map((a) => a.id), PRIORIDAD.NOCHE);
    // Cubos que ya no están en ningún índice (de alguien que se fue, de una
    // sección que se cerró): fuera. Se repasan de noche, cuando no molesta.
    const cubosViejos = await prisma.$executeRawUnsafe(
        `DELETE FROM "cubos_de_precarga" c WHERE NOT EXISTS (SELECT 1 FROM "indices_de_precarga" i WHERE c."clave" = ANY(i."claves"))
           AND c."armadoEn" < now() - interval '2 days'`
    );
    return { personas: activos.length, cubosViejos };
}

/**
 * El día cambió en el liceo: quien tenga el índice de otro día va a la cola.
 *
 * Lo de «hoy» (la clase en vivo, los reemplazos del día) lleva la fecha en
 * la lectura. La noche de los cubos corre cada 24 h desde que arrancó el
 * servidor, no a la medianoche del liceo: un servidor encendido a las 7 de
 * la mañana dejaba a todos con lo de ayer (PRECARGA-01 lo vio). Esto va en
 * cada barrido (cada 10 min) y es UNA consulta: no cuesta nada si ya están.
 */
export async function elDiaNuevo(liceo: string): Promise<number> {
    const prisma = await getTenantPrisma(liceo);
    const hoy = todayInTimezone(await instituteTimezone(prisma));
    const n = await prisma.$executeRawUnsafe(
        `UPDATE "indices_de_precarga" SET "pendiente" = true, "prioridad" = $2, "pedidoEn" = now()
          WHERE NOT "pendiente" AND "dia" IS DISTINCT FROM $1`,
        hoy,
        PRIORIDAD.DIA_NUEVO
    );
    return Number(n);
}

// ── Leer (para las rutas) ───────────────────────────────────────────────────

export interface IndiceListo {
    marca: number;
    paginas: string[];
    cubos: Array<{ clave: string; huella: string; bytes: number }>;
    bytes: number;
}

/**
 * El índice de una persona, tal como está. Nunca arma nada: si está viejo
 * (otro día, otras secciones) se pide que se rehaga y se entrega el que hay;
 * si no hay ninguno, se pide con prioridad y se dice el puesto en la cola.
 */
export async function elIndiceDe(prisma: any, liceo: string, yo: { id: string; role: string }): Promise<{ listo: IndiceListo } | { preparando: { delante: number } }> {
    const [i]: Array<{ claves: string[]; paginas: string[]; dia: string; huellaDeLaPersona: string; pendiente: boolean; prioridad: number; pedidoEn: Date }> = await prisma.$queryRawUnsafe(
        `SELECT "claves","paginas","dia","huellaDeLaPersona","pendiente","prioridad","pedidoEn" FROM "indices_de_precarga" WHERE "usuarioId" = $1`,
        yo.id
    );
    const cubos: Array<{ clave: string; huella: string | null; bytes: number; marca: bigint }> = i?.claves?.length
        ? await prisma.$queryRawUnsafe(`SELECT "clave","huella","bytes","marca" FROM "cubos_de_precarga" WHERE "clave" = ANY($1)`, i.claves)
        : [];
    const completo = i && i.claves.length > 0 && cubos.length === i.claves.length && cubos.every((c) => c.huella);
    if (!completo) {
        if (!i || !i.pendiente || i.prioridad < PRIORIDAD.ENTRANDO) await pedirQueSePrepare(liceo, [yo.id], PRIORIDAD.ENTRANDO);
        const [d]: Array<{ n: bigint }> = await prisma.$queryRawUnsafe(
            `SELECT count(*) n FROM "indices_de_precarga" WHERE "pendiente" AND ("prioridad" > $1 OR ("prioridad" = $1 AND "pedidoEn" < $2))`,
            PRIORIDAD.ENTRANDO,
            i?.pedidoEn ?? new Date()
        );
        return { preparando: { delante: Number(d?.n ?? 0) } };
    }
    // ¿Viejo? Se entrega igual (no se hace esperar a nadie) y se pide otro.
    const tz = await instituteTimezone(prisma);
    if (!i.pendiente && (i.dia !== todayInTimezone(tz) || i.huellaDeLaPersona !== (await laHuella(prisma, { id: yo.id, role: yo.role, isActive: true })))) {
        await pedirQueSePrepare(liceo, [yo.id], PRIORIDAD.CAMBIO);
    }
    const lista = cubos.map((c) => ({ clave: c.clave, huella: c.huella as string, bytes: c.bytes }));
    return {
        listo: {
            marca: Math.max(0, ...cubos.map((c) => Number(c.marca))),
            paginas: i.paginas,
            cubos: lista,
            bytes: lista.reduce((a, c) => a + c.bytes, 0),
        },
    };
}

export async function elCubo(prisma: any, yo: { id: string }, clave: string): Promise<{ contenido: Buffer; huella: string } | null | 'ajeno'> {
    const [i]: Array<{ claves: string[] }> = await prisma.$queryRawUnsafe(`SELECT "claves" FROM "indices_de_precarga" WHERE "usuarioId" = $1`, yo.id);
    if (!i || !i.claves.includes(clave)) return 'ajeno';
    const [c]: Array<{ contenido: Buffer | null; huella: string | null }> = await prisma.$queryRawUnsafe(`SELECT "contenido","huella" FROM "cubos_de_precarga" WHERE "clave" = $1`, clave);
    if (!c?.contenido || !c.huella) return null;
    return { contenido: Buffer.from(c.contenido), huella: c.huella };
}

/** Para las pruebas: la firma de un conjunto de lecturas. */
export const _firma = firmaDe;
