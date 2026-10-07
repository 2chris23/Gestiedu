import { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import * as zlib from 'zlib';
import { promisify } from 'util';

const gzipAsync = promisify(zlib.gzip);
const gunzipAsync = promisify(zlib.gunzip);
import { getTenantPrisma, platformPrisma } from '../config/database';
import { generateTokenPair } from '../config/jwt';
import { redis } from '../config/redis';
import { logger } from '../utils/logger';
import { avisarSiFalla } from '../utils/sin-callar';
import {
    lasPantallasDe,
    elPlanDeLasPantallas,
    laUltimaMarca,
    esUnaLecturaValida,
    apuntarLoQuePesa,
    CABECERA_INTERNA,
    MARCA_INTERNA,
    loQueCambioDesde,
} from './precarga.service';
import { lasSeccionesDelProfesor, precalentarLosPromedios } from './precalentar-promedios.service';

/**
 * EL MENÚ, EN UN SOLO SITIO (COPIADO DEL CLIENTE)
 *
 * NOTA DE SINCRONIZACIÓN (Fase B):
 * Esta lista está COPIADA de `apps/web/src/lib/el-menu.ts` (`elMenuDe`).
 * Ambos archivos deben mantenerse idénticos para que el paquete preparado de
 * antemano contenga exactamente las pantallas que el menú ofrece.
 *
 * Los roles coinciden con el enum `UserRole` del servidor:
 * ADMIN | TEACHER | STUDENT | TUTOR.
 */

export interface DestinoDelMenuServidor {
    name: string;
    href: string;
    roles: string[];
    pista?: string;
}

export function elMenuDe(rol: string | undefined, conPagos: boolean, conPae = false): DestinoDelMenuServidor[] {
    const todos: DestinoDelMenuServidor[] = [
        {
            name: 'Inicio',
            href: '/dashboard',
            roles: ['ADMIN', 'TEACHER', 'STUDENT', 'TUTOR'],
        },
        {
            name: 'Académico',
            href: '/dashboard/academico',
            roles: ['ADMIN', 'TEACHER'],
            pista: 'Ciclos, secciones y alumnos',
        },
        {
            name: 'Materias',
            href: '/dashboard/materias',
            roles: ['ADMIN', 'TEACHER'],
            pista: 'Las materias del liceo',
        },
        {
            name: 'Pendientes',
            href: '/dashboard/materias-pendientes',
            roles: ['ADMIN', 'TEACHER'],
            pista: 'Materias pendientes, momento a momento',
        },
        {
            name: 'Observaciones',
            href: '/dashboard/observaciones',
            roles: ['ADMIN', 'TEACHER'],
            pista: 'Observaciones y citaciones a representantes',
        },
        {
            name: 'Labor social',
            href: '/dashboard/labor-social',
            roles: ['ADMIN', 'TEACHER'],
            pista: 'Las horas comunitarias de cada alumno',
        },
        {
            name: 'Horarios',
            href: '/dashboard/horarios',
            roles: ['ADMIN', 'TEACHER'],
            pista: 'Por sección y por profesor',
        },
        {
            name: 'Eventos',
            href: '/dashboard/eventos',
            roles: ['ADMIN'],
            pista: 'Actos, feriados y suspensiones',
        },
        ...(conPagos
            ? [
                  {
                      name: 'Finanzas',
                      href: '/dashboard/pagos',
                      roles: ['ADMIN'],
                      pista: 'Cuotas, personal, gastos y fondos',
                  },
              ]
            : []),
        ...(conPagos
            ? [
                  {
                      name: 'Mis pagos',
                      href: '/dashboard/mis-pagos',
                      roles: ['TEACHER'],
                      pista: 'Lo que el liceo te paga y tus recibos',
                  },
              ]
            : []),
        ...(conPae
            ? [
                  {
                      name: 'Comedor',
                      href: '/dashboard/comedor',
                      roles: ['ADMIN'],
                      pista: 'Raciones del PAE, día a día',
                  },
              ]
            : []),
        {
            name: 'Usuarios',
            href: '/dashboard/usuarios',
            roles: ['ADMIN'],
            pista: 'Alumnos, profesores y representantes',
        },
        {
            name: 'Mi boleta',
            href: '/dashboard/boleta/mia',
            roles: ['STUDENT'],
            pista: 'Notas por lapso e inasistencias',
        },
        {
            name: 'Configuración',
            href: '/dashboard/configuracion',
            roles: ['ADMIN'],
            pista: 'Reglas, lapsos y pagos',
        },
    ];
    return todos.filter((d) => !rol || d.roles.includes(rol));
}

export function elMenuDelRol(rol: string | undefined, conPagos = false, conPae = false): string[] {
    return elMenuDe(rol, conPagos, conPae).map((d) => d.href);
}

// ── La huella de lo que puede ver un usuario ─────────────────────────────────

/**
 * LA HUELLA: resumen determinista corto de lo que la persona puede ver.
 * Máximo 2–3 consultas: ciclo activo, rol, isActive, secciones del profesor
 * (ordenadas) o representados (ordenados).
 */
export async function laHuella(prisma: any, usuario: { id: string; role?: string; isActive?: boolean }): Promise<string> {
    let rol = usuario.role;
    let activo = usuario.isActive;

    if (!rol || activo === undefined) {
        const u = await prisma.user.findUnique({
            where: { id: usuario.id },
            select: { id: true, role: true, isActive: true },
        });
        if (!u) return '';
        rol = u.role;
        activo = u.isActive;
    }

    const [ciclo, seccionesProfe, representados] = await Promise.all([
        prisma.academicYear.findFirst({
            where: { OR: [{ isActive: true }, { status: 'ACTIVE' }] },
            select: { id: true },
            orderBy: { startDate: 'desc' },
        }),
        rol === 'TEACHER' ? lasSeccionesDelProfesor(prisma, usuario.id) : Promise.resolve([]),
        rol === 'TUTOR'
            ? prisma.studentTutor
                  .findMany({ where: { tutorId: usuario.id }, select: { studentId: true }, orderBy: { studentId: 'asc' } })
                  .then((r: Array<{ studentId: string }>) => r.map((x) => x.studentId))
            : Promise.resolve([]),
    ]);

    const partes = [
        rol,
        activo ? '1' : '0',
        ciclo?.id ?? '',
        [...seccionesProfe].sort().join(','),
        [...representados].sort().join(','),
    ];

    return createHash('sha256').update(partes.join('|')).digest('hex').slice(0, 16);
}

// ── Control de concurrencia y progreso ───────────────────────────────────────

const CANDADO_PREFIJO = 'paquete-precarga:candado:';
const DURA_CANDADO_MS = 180_000; // 3 minutos

const candadosEnMemoria = new Set<string>();
const progresoEnMemoria = new Map<string, { hechas: number; total: number }>();

function claveDelCandado(liceo: string, usuarioId: string): string {
    return `${liceo}|${usuarioId}`;
}

async function adquirirCandado(liceo: string, usuarioId: string, ficha: string): Promise<boolean> {
    const k = claveDelCandado(liceo, usuarioId);
    if (candadosEnMemoria.has(k)) return false;
    candadosEnMemoria.add(k);

    if (redis && redis.status === 'ready') {
        try {
            const ok = await redis.set(CANDADO_PREFIJO + k, ficha, 'PX', DURA_CANDADO_MS, 'NX');
            if (!ok) {
                candadosEnMemoria.delete(k);
                return false;
            }
        } catch {
            // Si Redis falla, el candado en memoria protege este proceso
        }
    }
    return true;
}

const QUITAR_SI_ES_MIA_LUA = `
  if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
  return 0
`;

async function liberarCandado(liceo: string, usuarioId: string, ficha: string): Promise<void> {
    const k = claveDelCandado(liceo, usuarioId);
    candadosEnMemoria.delete(k);
    progresoEnMemoria.delete(k);

    if (redis && redis.status === 'ready') {
        try {
            await (redis as any).eval(QUITAR_SI_ES_MIA_LUA, 1, CANDADO_PREFIJO + k, ficha);
        } catch {
            // Sin Redis, caduca o ya salió de memoria
        }
    }
}

export function obtenerProgreso(liceo: string, usuarioId: string): { hechas: number; total: number } | null {
    return progresoEnMemoria.get(claveDelCandado(liceo, usuarioId)) ?? null;
}

export function estaArmandose(liceo: string, usuarioId: string): boolean {
    return candadosEnMemoria.has(claveDelCandado(liceo, usuarioId));
}

/** Cola de proceso: como mucho 1 paquete a la vez por proceso de Node. */
class ColaDePaquetesPorProceso {
    private corriendo = false;
    private cola: Array<{ ejecutar: () => Promise<void> }> = [];

    encolar(ejecutar: () => Promise<void>) {
        this.cola.push({ ejecutar });
        void this.procesar();
    }

    private async procesar() {
        if (this.corriendo || this.cola.length === 0) return;
        this.corriendo = true;
        const siguiente = this.cola.shift()!;
        try {
            await siguiente.ejecutar();
        } catch (error) {
            logger.warn('paquete-de-precarga: error al ejecutar tarea de la cola', {
                error: error instanceof Error ? error.message : String(error),
            });
        } finally {
            this.corriendo = false;
            void this.procesar();
        }
    }
}

const colaDelProceso = new ColaDePaquetesPorProceso();

// ── Instancia global de Fastify para encargos asíncronos ────────────────────

let servidorFastifyGlobal: FastifyInstance | null = null;

export function fijarServidorParaPaquetes(f: FastifyInstance): void {
    servidorFastifyGlobal = f;
}

export function obtenerServidorParaPaquetes(): FastifyInstance | null {
    return servidorFastifyGlobal;
}

// ── Armar el paquete ────────────────────────────────────────────────────────

const MAX_A_LA_VEZ = 6;

export interface ResultadoPaquete {
    bytes: number;
    lecturas: number;
    version: string;
    marca: number;
}

export async function armarElPaquete(
    fastify: FastifyInstance,
    liceo: string,
    usuarioId: string
): Promise<ResultadoPaquete | null> {
    const prisma = await getTenantPrisma(liceo);
    const usuario = await prisma.user.findUnique({
        where: { id: usuarioId },
        select: { id: true, email: true, role: true, isActive: true },
    });
    if (!usuario || !usuario.isActive) return null;

    const inst = await platformPrisma.institute.findFirst({
        where: { OR: [{ id: liceo }, { slug: liceo }] },
        select: { id: true, slug: true },
    });
    const slug = inst?.slug ?? liceo;
    const instituteId = inst?.id ?? liceo;

    // 1. Marca antes de leer nada
    const marca = await laUltimaMarca(prisma);
    const huellaActual = await laHuella(prisma, usuario);

    // 2. Módulos y menú
    const [pagosConfig, paeConfig] = await Promise.all([
        prisma.paymentSettings.findUnique({ where: { id: 'liceo' }, select: { enabled: true } }).catch(() => null),
        prisma.paeConfig.findUnique({ where: { id: 'liceo' }, select: { enabled: true } }).catch(() => null),
    ]);
    const conPagos = Boolean(pagosConfig?.enabled);
    const conPae = Boolean(paeConfig?.enabled);
    const menu = elMenuDelRol(usuario.role, conPagos, conPae);

    // 3. Precalentar promedios si es admin o profesor
    if (usuario.role === 'ADMIN' || usuario.role === 'TEACHER') {
        const alcance = usuario.role === 'TEACHER' ? { secciones: await lasSeccionesDelProfesor(prisma, usuario.id) } : {};
        await precalentarLosPromedios(prisma, liceo, alcance).catch(avisarSiFalla('precalentar-promedios-paquete'));
    }

    // 4. Pantallas y plan
    const pantallas = await lasPantallasDe(prisma, usuario, menu);
    const plan = elPlanDeLasPantallas(pantallas, usuario.role);
    const lecturas = plan.lecturas.filter(esUnaLecturaValida);

    if (redis && redis.status === 'ready') {
        redis.setex(`paquete:paginas:${usuario.id}`, 30 * 86400, JSON.stringify(plan.paginas)).catch(avisarSiFalla('cache-paginas-paquete'));
    }

    // 5. Credencial corta en memoria para fastify.inject
    const tokens = generateTokenPair(
        {
            id: usuario.id,
            userId: usuario.id,
            email: usuario.email,
            role: usuario.role as any,
            instituteId,
        },
        randomUUID()
    );

    const cabeceras: Record<string, string> = {
        authorization: `Bearer ${tokens.accessToken}`,
        [CABECERA_INTERNA]: MARCA_INTERNA,
        'x-institute-id': instituteId,
        'x-institute-slug': slug,
        accept: 'application/json',
    };

    const k = claveDelCandado(liceo, usuarioId);
    progresoEnMemoria.set(k, { hechas: 0, total: lecturas.length });

    const lineas: string[] = [];
    let indice = 0;
    let hechas = 0;

    const trabajador = async () => {
        while (indice < lecturas.length) {
            const clave = lecturas[indice++];
            try {
                const r = await fastify.inject({ method: 'GET', url: `/api${clave}`, headers: cabeceras });
                if (r.statusCode === 200 && String(r.headers['content-type'] ?? '').includes('json')) {
                    lineas.push('{"c":' + JSON.stringify(clave) + ',"d":' + r.payload + '}');
                    apuntarLoQuePesa(liceo, clave, r.payload.length);
                } else {
                    lineas.push(JSON.stringify({ c: clave, f: r.statusCode }));
                }
            } catch {
                lineas.push(JSON.stringify({ c: clave, f: 500 }));
            }
            hechas++;
            progresoEnMemoria.set(k, { hechas, total: lecturas.length });
        }
    };

    const aLaVez = Math.min(MAX_A_LA_VEZ, Math.max(1, lecturas.length));
    await Promise.all(Array.from({ length: aLaVez }, trabajador));

    // 6. Gzip asíncrono y guardado
    const textoPlano = lineas.join('\n');
    const bufferGzip = await gzipAsync(Buffer.from(textoPlano, 'utf-8'));

    await prisma.paqueteDePrecarga.upsert({
        where: { usuarioId },
        create: {
            usuarioId,
            contenido: bufferGzip,
            marca: BigInt(marca),
            version: plan.version,
            huella: huellaActual,
            bytes: bufferGzip.length,
            lecturas: lineas.length,
            armadoEn: new Date(),
        },
        update: {
            contenido: bufferGzip,
            marca: BigInt(marca),
            version: plan.version,
            huella: huellaActual,
            bytes: bufferGzip.length,
            lecturas: lineas.length,
            armadoEn: new Date(),
        },
    });

    return {
        bytes: bufferGzip.length,
        lecturas: lineas.length,
        version: plan.version,
        marca,
    };
}

// ── Encargar el paquete (cola y vigencia) ───────────────────────────────────

export async function encargarElPaquete(
    liceo: string,
    usuarioId: string,
    fastifyInst?: FastifyInstance
): Promise<void> {
    const f = fastifyInst ?? servidorFastifyGlobal;
    if (!f) {
        logger.warn('paquete-de-precarga: no hay instancia de Fastify para encargar el paquete');
        return;
    }

    if (estaArmandose(liceo, usuarioId)) return;

    try {
        const prisma = await getTenantPrisma(liceo);
        const paquete = await prisma.paqueteDePrecarga.findUnique({
            where: { usuarioId },
            select: { id: true, huella: true, armadoEn: true },
        });

        if (paquete) {
            const hace30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            if (paquete.armadoEn > hace30d) {
                const huellaActual = await laHuella(prisma, { id: usuarioId });
                if (paquete.huella === huellaActual) {
                    // Vigente dentro de la ventana de cambios y con la misma huella: no hace falta armar de nuevo
                    return;
                }
            }
        }
    } catch (err) {
        logger.warn('paquete-de-precarga: error al comprobar paquete existente', { error: err });
    }

    colaDelProceso.encolar(async () => {
        const ficha = randomUUID();
        const candado = await adquirirCandado(liceo, usuarioId, ficha);
        if (!candado) return;

        try {
            await armarElPaquete(f, liceo, usuarioId);
        } finally {
            await liberarCandado(liceo, usuarioId, ficha);
        }
    });
}

// ── Puesta al día nocturna ──────────────────────────────────────────────────

export async function actualizarPaquetesDeNoche(
    fastify: FastifyInstance,
    liceo: string,
    prisma: PrismaClient
): Promise<{ revisados: number; actualizados: number; rehechos: number; borrados: number }> {
    const p = prisma as any;
    const ahora = new Date();
    const hace7Dias = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);

    // 1. Borrar paquetes de quien no usó la app en 7 días
    const resBorrados = await p.paqueteDePrecarga.deleteMany({
        where: {
            OR: [
                { usadoEn: { lt: hace7Dias } },
                { usadoEn: null, armadoEn: { lt: hace7Dias } },
            ],
        },
    });
    const borrados = resBorrados?.count ?? 0;

    // 2. Traer paquetes que sí se usaron en los últimos 7 días
    const paquetes = await p.paqueteDePrecarga.findMany({
        where: {
            OR: [
                { usadoEn: { gte: hace7Dias } },
                { usadoEn: null, armadoEn: { gte: hace7Dias } },
            ],
        },
    });

    let revisados = 0;
    let actualizados = 0;
    let rehechos = 0;

    const inst = await platformPrisma.institute.findUnique({
        where: { id: liceo },
        select: { id: true, slug: true },
    });
    const slug = inst?.slug ?? liceo;

    const [pagosConfig, paeConfig] = await Promise.all([
        p.paymentSettings.findUnique({ where: { id: 'liceo' }, select: { enabled: true } }).catch(() => null),
        p.paeConfig.findUnique({ where: { id: 'liceo' }, select: { enabled: true } }).catch(() => null),
    ]);
    const conPagos = Boolean(pagosConfig?.enabled);
    const conPae = Boolean(paeConfig?.enabled);

    // Evitar N+1: traer todos los usuarios de los paquetes en una sola consulta (Punto 7)
    const usuarioIds = paquetes.map((paq: any) => paq.usuarioId);
    const usuarios = await p.user.findMany({
        where: { id: { in: usuarioIds } },
        select: { id: true, email: true, role: true, isActive: true },
    });
    const mapaUsuarios = new Map<string, any>(usuarios.map((u: any) => [u.id, u]));

    for (const paq of paquetes) {
        revisados++;
        const usuario = mapaUsuarios.get(paq.usuarioId);

        if (!usuario || !usuario.isActive) {
            await p.paqueteDePrecarga.delete({ where: { id: paq.id } }).catch(() => {});
            continue;
        }

        const huellaAhora = await laHuella(p, usuario);
        const menu = elMenuDelRol(usuario.role, conPagos, conPae);

        // Si cambió la huella: rehacer entero
        if (huellaAhora !== paq.huella) {
            await armarElPaquete(fastify, liceo, usuario.id);
            rehechos++;
            continue;
        }

        // Consultar qué cambió desde la marca del paquete
        const cambio = await loQueCambioDesde(p, usuario, menu, Number(paq.marca));

        if (cambio.todo || cambio.lecturas.length > paq.lecturas / 2) {
            await armarElPaquete(fastify, liceo, usuario.id);
            rehechos++;
            continue;
        }

        if (cambio.lecturas.length === 0) {
            if (cambio.marca > Number(paq.marca)) {
                await p.paqueteDePrecarga.update({
                    where: { id: paq.id },
                    data: { marca: BigInt(cambio.marca) },
                });
            }
            continue;
        }

        // Rehacer SOLO las lecturas cambiadas y mezclarlas con las existentes
        try {
            const bufferGunzip = await gunzipAsync(paq.contenido);
            const contenidoTexto = bufferGunzip.toString('utf-8');
            const mapaLecturas = new Map<string, string>();
            for (const linea of contenidoTexto.split('\n')) {
                if (!linea.trim()) continue;
                try {
                    const parsed = JSON.parse(linea);
                    if (parsed.c) mapaLecturas.set(parsed.c, linea);
                } catch {
                    // Ignorar línea corrupta si la hubiera
                }
            }

            const tokens = generateTokenPair(
                {
                    id: usuario.id,
                    userId: usuario.id,
                    email: usuario.email,
                    role: usuario.role as any,
                    instituteId: liceo,
                },
                randomUUID()
            );

            const cabeceras: Record<string, string> = {
                authorization: `Bearer ${tokens.accessToken}`,
                [CABECERA_INTERNA]: MARCA_INTERNA,
                'x-institute-id': liceo,
                'x-institute-slug': slug,
                accept: 'application/json',
            };

            for (const clave of cambio.lecturas.filter(esUnaLecturaValida)) {
                try {
                    const r = await fastify.inject({ method: 'GET', url: `/api${clave}`, headers: cabeceras });
                    if (r.statusCode === 200 && String(r.headers['content-type'] ?? '').includes('json')) {
                        mapaLecturas.set(clave, '{"c":' + JSON.stringify(clave) + ',"d":' + r.payload + '}');
                        apuntarLoQuePesa(liceo, clave, r.payload.length);
                    } else {
                        mapaLecturas.set(clave, JSON.stringify({ c: clave, f: r.statusCode }));
                    }
                } catch {
                    mapaLecturas.set(clave, JSON.stringify({ c: clave, f: 500 }));
                }
            }

            const nuevoTexto = [...mapaLecturas.values()].join('\n');
            const nuevoGzip = await gzipAsync(Buffer.from(nuevoTexto, 'utf-8'));

            await p.paqueteDePrecarga.update({
                where: { id: paq.id },
                data: {
                    contenido: nuevoGzip,
                    marca: BigInt(cambio.marca),
                    bytes: nuevoGzip.length,
                    lecturas: mapaLecturas.size,
                    armadoEn: new Date(),
                },
            });

            actualizados++;
        } catch (err) {
            logger.warn('paquete-de-precarga: error al poner al día paquete de noche, rehaciendo entero', {
                usuarioId: usuario.id,
                error: err,
            });
            await armarElPaquete(fastify, liceo, usuario.id);
            rehechos++;
        }
    }

    // 3. Armar también el de los ADMIN y TEACHER activos que no tengan paquete (Punto 4)
    try {
        const paquetesAlDia = await p.paqueteDePrecarga.findMany({ select: { usuarioId: true } });
        const idsConPaquete = new Set(paquetesAlDia.map((x: any) => x.usuarioId));
        const personalSinPaquete = await p.user.findMany({
            where: {
                role: { in: ['ADMIN', 'TEACHER'] },
                isActive: true,
                id: { notIn: Array.from(idsConPaquete) },
            },
            select: { id: true },
        });

        for (const u of personalSinPaquete) {
            try {
                await armarElPaquete(fastify, liceo, u.id);
                rehechos++;
            } catch (err) {
                logger.warn('paquete-de-precarga: error al armar paquete de noche para personal sin paquete', {
                    usuarioId: u.id,
                    error: err,
                });
            }
        }
    } catch (err) {
        logger.warn('paquete-de-precarga: error al buscar personal sin paquete de noche', { error: err });
    }

    return { revisados, actualizados, rehechos, borrados };
}
