import { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { platformPrisma, getTenantPrisma } from '../config/database';
import { redis } from '../config/redis';
import { generateTokenPair } from '../config/jwt';
import { conLiceo } from '../config/ambito-del-liceo';
import { lasPantallasDe, elPlanDeLasPantallas, CABECERA_INTERNA, MARCA_INTERNA } from '../services/precarga.service';
import { elMenuDelRol } from '../services/paquete-de-precarga.service';
import { latido } from '../utils/latido-de-tareas';
import { logger } from '../utils/logger';
import { avisarSiFalla } from '../utils/sin-callar';

/**
 * EL ROBOT QUE PRUEBA SIN ENTRAR A UN LICEO (salud, 18-oct-2026)
 *
 * Cristian: «saber sin siquiera entrar a un instituto que algo esté fallando».
 *
 * Cada 5 minutos entra a un LICEO DE MUESTRA (nunca al de un cliente:
 * `SALUD_LICEO_DE_MUESTRA`, el slug; en desarrollo, `instituto-testing`) como
 * su admin, un profesor, un alumno y un representante, y abre las pantallas de
 * todos los días —Inicio, Académico, Horarios— pidiendo EXACTAMENTE lo que pide
 * cada pantalla (el mapa grabado de la precarga), de 6 en 6 como el navegador.
 * Apunta cuánto tardó cada pantalla y si algo falló. Solo lee: no toca nada.
 *
 * Una sola vez aunque haya varios procesos (candado en Redis). Lo que NO mide:
 * entrar con contraseña (el robot no la tiene; el login de verdad sale en las
 * rutas) ni la red entre el teléfono y el servidor.
 */

const CADA = 5 * 60_000;
const PANTALLAS = ['/dashboard', '/dashboard/academico', '/dashboard/horarios'];
const NOMBRE_ROL: Record<string, string> = { ADMIN: 'admin', TEACHER: 'profesor', STUDENT: 'alumno', TUTOR: 'representante' };
const NOMBRE_PANTALLA: Record<string, string> = { '/dashboard': 'Inicio', '/dashboard/academico': 'Académico', '/dashboard/horarios': 'Horarios' };
const LENTA_MS = 1500;

export function elLiceoDeMuestra(): string | null {
    if (process.env.SALUD_LICEO_DE_MUESTRA) return process.env.SALUD_LICEO_DE_MUESTRA;
    return process.env.NODE_ENV === 'production' ? null : 'instituto-testing';
}

interface Paso {
    paso: string;
    ms: number;
    ok: boolean;
    estado: number | null;
    detalle: string | null;
}

async function unaPersonaDe(prisma: any, rol: string): Promise<{ id: string; email: string; role: string } | null> {
    if (rol === 'TEACHER') {
        const [f] = await prisma.$queryRawUnsafe(
            `SELECT u.id, u.email, u.role FROM classroom_subjects cs JOIN users u ON u.id = cs."teacherId" WHERE u."isActive" GROUP BY u.id, u.email, u.role ORDER BY count(*) DESC LIMIT 1`
        );
        return f ?? null;
    }
    if (rol === 'STUDENT') {
        const [f] = await prisma.$queryRawUnsafe(
            `SELECT u.id, u.email, u.role FROM users u JOIN student_classrooms sc ON sc."studentId" = u.id AND sc."isActive" WHERE u."isActive" AND u.role = 'STUDENT' ORDER BY u.email LIMIT 1`
        );
        return f ?? null;
    }
    return prisma.user.findFirst({ where: { role: rol, isActive: true }, select: { id: true, email: true, role: true }, orderBy: { email: 'asc' } });
}

export async function unaVueltaDelRobot(server: FastifyInstance): Promise<Paso[]> {
    const slug = elLiceoDeMuestra();
    if (!slug) return [];
    const inst = await platformPrisma.institute.findFirst({ where: { slug }, select: { id: true, slug: true } });
    if (!inst) return [{ paso: `Liceo de muestra «${slug}»`, ms: 0, ok: false, estado: null, detalle: 'No existe' }];
    const prisma = await getTenantPrisma(inst.id);
    const pasos: Paso[] = [];

    await conLiceo(inst.id, async () => {
        for (const rol of ['ADMIN', 'TEACHER', 'STUDENT', 'TUTOR']) {
            const yo = await unaPersonaDe(prisma, rol);
            if (!yo) {
                pasos.push({ paso: `${NOMBRE_ROL[rol]}: no hay nadie`, ms: 0, ok: false, estado: null, detalle: 'El liceo de muestra no tiene a nadie con este rol' });
                continue;
            }
            const { accessToken } = generateTokenPair({ id: yo.id, userId: yo.id, email: yo.email, role: yo.role as any, instituteId: inst.id }, randomUUID());
            const cabeceras = {
                authorization: `Bearer ${accessToken}`,
                'x-institute-id': inst.id,
                'x-institute-slug': inst.slug,
                accept: 'application/json',
                // Que no gaste cupo ni cuente como una persona en las métricas.
                [CABECERA_INTERNA]: MARCA_INTERNA,
            };
            const menu = elMenuDelRol(rol).filter((m) => PANTALLAS.includes(m));
            let pantallas;
            try {
                pantallas = await lasPantallasDe(prisma, { id: yo.id, role: rol }, menu);
            } catch (e) {
                pasos.push({ paso: `${NOMBRE_ROL[rol]}: preparar`, ms: 0, ok: false, estado: null, detalle: e instanceof Error ? e.message.slice(0, 200) : String(e) });
                continue;
            }
            for (const molde of PANTALLAS) {
                const p = pantallas.filter((x) => x.molde === molde);
                if (!p.length) continue;
                const lecturas = elPlanDeLasPantallas(p, rol).lecturas;
                const t0 = performance.now();
                let fallo: { estado: number; lectura: string } | null = null;
                let lenta = { ms: 0, lectura: '' };
                let i = 0;
                const trabajador = async () => {
                    while (i < lecturas.length) {
                        const l = lecturas[i++];
                        const t = performance.now();
                        const r = await server.inject({ method: 'GET', url: `/api${l}`, headers: cabeceras });
                        const ms = performance.now() - t;
                        if (ms > lenta.ms) lenta = { ms, lectura: l };
                        if (r.statusCode >= 500 && !fallo) fallo = { estado: r.statusCode, lectura: l };
                    }
                };
                await Promise.all(Array.from({ length: Math.min(6, lecturas.length) }, trabajador));
                const ms = Math.round(performance.now() - t0);
                const f = fallo as { estado: number; lectura: string } | null;
                pasos.push({
                    paso: `${NOMBRE_ROL[rol]}: ${NOMBRE_PANTALLA[molde]}`,
                    ms,
                    ok: !f && ms < LENTA_MS * 2,
                    estado: f ? f.estado : 200,
                    detalle: f
                        ? `Falló ${f.lectura.replace(/[0-9a-f-]{20,}/g, ':id')} (${f.estado})`
                        : `${lecturas.length} lecturas; la más lenta ${Math.round(lenta.ms)} ms (${lenta.lectura.split('?')[0].replace(/[0-9a-f-]{20,}/g, ':id')})`,
                });
            }
        }
    });
    return pasos;
}

async function guardar(pasos: Paso[]) {
    if (!pasos.length) return;
    const vuelta = randomUUID();
    for (const p of pasos) {
        await platformPrisma.$executeRawUnsafe(
            `INSERT INTO "pasos_del_robot" ("id","vuelta","paso","ms","ok","estado","detalle") VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            randomUUID(),
            vuelta,
            p.paso,
            p.ms,
            p.ok,
            p.estado,
            p.detalle
        );
    }
    // Se guardan 7 días.
    await platformPrisma.$executeRawUnsafe(`DELETE FROM "pasos_del_robot" WHERE "en" < now() - interval '7 days'`);
}

export async function lasVueltasDelRobot() {
    const liceo = elLiceoDeMuestra();
    const filas = await platformPrisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT "vuelta", "en", "paso", "ms", "ok", "estado", "detalle" FROM "pasos_del_robot"
          WHERE "en" > now() - interval '24 hours' ORDER BY "en" DESC LIMIT 2000`
    );
    const porVuelta = new Map<string, { en: unknown; pasos: Array<Record<string, unknown>> }>();
    for (const f of filas) {
        const k = String(f.vuelta);
        if (!porVuelta.has(k)) porVuelta.set(k, { en: f.en, pasos: [] });
        porVuelta.get(k)!.pasos.push(f);
    }
    const vueltas = [...porVuelta.values()];
    // La tendencia de cada paso: la última vuelta contra la mediana del día.
    const porPaso = new Map<string, number[]>();
    for (const f of filas) {
        const k = String(f.paso);
        if (!porPaso.has(k)) porPaso.set(k, []);
        porPaso.get(k)!.push(Number(f.ms));
    }
    const mediana = (a: number[]) => {
        const s = [...a].sort((x, y) => x - y);
        return s.length ? s[Math.floor(s.length / 2)] : null;
    };
    return {
        liceo,
        configurado: !!liceo,
        ultima: vueltas[0] ?? null,
        medianas: Object.fromEntries([...porPaso.entries()].map(([k, v]) => [k, mediana(v)])),
        vueltas: vueltas.length,
    };
}

export async function setupRobotDeSalud(server: FastifyInstance) {
    if (process.env.NODE_ENV === 'test' || !elLiceoDeMuestra()) return;
    const correr = async () => {
        let fallo: unknown = null;
        try {
            if (redis && redis.status === 'ready') {
                const mia = await (redis as any).set('salud:robot', String(process.pid), 'PX', CADA - 10_000, 'NX');
                if (!mia) return;
            }
            const pasos = await unaVueltaDelRobot(server);
            await guardar(pasos);
            const mal = pasos.filter((p) => !p.ok);
            if (mal.length) logger.warn('Robot de salud: algo va mal en el liceo de muestra', { pasos: mal.map((p) => `${p.paso}: ${p.detalle}`) });
        } catch (e) {
            fallo = e;
        } finally {
            await latido('robot-de-salud', CADA, fallo ?? undefined);
        }
    };
    setTimeout(() => void correr().catch(avisarSiFalla('robot-de-salud')), 60_000).unref?.();
    setInterval(() => void correr().catch(avisarSiFalla('robot-de-salud')), CADA).unref?.();
}
