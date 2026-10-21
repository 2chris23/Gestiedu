import { Prisma } from '@prisma/client';
import { platformPrisma } from '../config/database';
import { createError } from '../middleware/error.middleware';
import { nombresDe } from './cambios-sin-conexion.service';

/**
 * LA PAPELERA DEL ADMIN: RESTAURAR Y BORRAR PARA SIEMPRE (19-oct-2026)
 *
 * Cristian: «imagina que eres el admin y borraste sin querer un estudiante y
 * lo quieres recuperar… claro, esto tendría un límite». Y a la vez: lo que el
 * admin borra no puede quedarse guardado para siempre.
 *
 *  - Cada borrado es una OPERACIÓN: la fila que se nombró y todo lo que se
 *    llevó la cascada (`utils/papelera.ts`). Se lista de 20 en 20 y se
 *    restaura entera, o no se restaura nada.
 *  - Restaurar mete las filas de padres a hijos (el alumno antes que sus
 *    notas), con el orden que sale del propio esquema, en UNA transacción.
 *    Si algo ya existe (se volvió a crear el alumno con esa cédula) o falta lo
 *    de arriba (se borró después su sección), 409 y no se toca nada.
 *  - El plazo es del liceo (`papelera.dias`, de 7 a 90; 30 si no dice nada):
 *    pasado, la tarea diaria lo borra de la base para siempre.
 *    «Borrar para siempre» lo hace al instante.
 *
 * Las filas de antes del 19-oct-2026 no tienen operación: se juntan por quién
 * borró, desde dónde y el mismo segundo.
 */

type Prisma_ = any;

export const POR_PAGINA = 20;
export const DIAS_POR_DEFECTO = 30;
export const DIAS_MINIMO = 7;
export const DIAS_MAXIMO = 90;

/** La clave de la operación de cada fila, también para las de antes (sin `operacion`). */
const CLAVE = `COALESCE("operacion", 'v:' || COALESCE("borradoPor", '') || '|' || COALESCE("motivo", '') || '|' || to_char(date_trunc('second', "createdAt"), 'YYYY-MM-DD"T"HH24:MI:SS'))`;

// ── El orden de padres a hijos, sacado del esquema ─────────────────────────

interface CampoDelEsquema {
    name: string;
    kind: string;
    type: string;
    relationFromFields?: string[];
}
const MODELOS = new Map<string, CampoDelEsquema[]>(
    Prisma.dmmf.datamodel.models.map((m) => [m.name.charAt(0).toLowerCase() + m.name.slice(1), m.fields as unknown as CampoDelEsquema[]])
);
const delegado = (modelo: string) => modelo.charAt(0).toLowerCase() + modelo.slice(1);

/** De quién depende cada tabla (las que tienen la llave hacia ella). */
const PADRES = new Map<string, string[]>(
    [...MODELOS].map(([nombre, campos]) => [
        nombre,
        campos.filter((c) => c.kind === 'object' && c.relationFromFields?.length).map((c) => delegado(c.type)).filter((p) => p !== nombre),
    ])
);

const profundidad = new Map<string, number>();
function hondo(tabla: string, camino = new Set<string>()): number {
    const ya = profundidad.get(tabla);
    if (ya !== undefined) return ya;
    if (camino.has(tabla)) return 0; // un ciclo (raro): se corta aquí
    camino.add(tabla);
    const padres = PADRES.get(tabla) ?? [];
    const d = padres.length ? 1 + Math.max(...padres.map((p) => hondo(p, camino))) : 0;
    camino.delete(tabla);
    profundidad.set(tabla, d);
    return d;
}

/** La fila tal como la guardó la papelera (JSON) → lo que Prisma acepta otra vez. */
function revivir(tabla: string, contenido: Record<string, unknown>): Record<string, unknown> {
    const campos = MODELOS.get(tabla) ?? [];
    const fila: Record<string, unknown> = {};
    for (const c of campos) {
        if (c.kind === 'object' || !(c.name in contenido)) continue;
        const v = contenido[c.name];
        if (v === null || v === undefined) {
            fila[c.name] = v;
        } else if (c.type === 'DateTime') {
            fila[c.name] = new Date(v as string);
        } else if (c.type === 'BigInt') {
            fila[c.name] = BigInt(v as string | number);
        } else if (c.type === 'Bytes') {
            // Un Buffer en JSON es {type:'Buffer',data:[…]}; un Uint8Array, {0:…,1:…}.
            const b = v as any;
            fila[c.name] = Buffer.from(Array.isArray(b?.data) ? b.data : Object.values(b));
        } else if (c.type === 'Json') {
            fila[c.name] = v;
        } else {
            fila[c.name] = v;
        }
    }
    return fila;
}

// ── Qué es cada cosa, dicho como lo diría el admin ─────────────────────────

const ROL: Record<string, string> = { STUDENT: 'Estudiante', TEACHER: 'Profesor', TUTOR: 'Representante', ADMIN: 'Administrador' };
const NOMBRE_DE_TABLA: Record<string, string> = {
    user: 'Usuario',
    classroom: 'Sección',
    subject: 'Materia',
    classroomSubject: 'Materia de una sección',
    academicYear: 'Ciclo escolar',
    period: 'Lapso',
    classActivity: 'Actividad',
    activity: 'Actividad',
    grade: 'Nota',
    dailyAttendance: 'Asistencia',
    observation: 'Observación',
    schoolEvent: 'Evento',
    scheduleBlock: 'Bloque del horario',
    evaluationPlanRow: 'Evaluación del plan',
    studentClassroom: 'Inscripción',
    studentTutor: 'Representante de un alumno',
    grupoEstable: 'Grupo estable',
    gasto: 'Gasto',
    fondoDelLiceo: 'Fondo',
    personal: 'Personal',
};

/**
 * `nombreDe`: el nombre de una persona por su cédula (las que siguen en el
 * liceo). Así «Representante de un alumno» dice de cuál, y una nota, de quién.
 */
export function queEs(tabla: string, c: Record<string, any>, nombreDe: (id: unknown) => string | null = () => null): string {
    const nombre = [c.firstName, c.lastName].filter(Boolean).join(' ');
    if (tabla === 'user') return `${ROL[c.role] ?? 'Usuario'} ${nombre}`.trim();
    if (tabla === 'studentTutor') {
        const alumno = nombreDe(c.studentId);
        const rep = nombreDe(c.tutorId);
        return rep && alumno ? `${rep}, representante de ${alumno}` : alumno ? `Representante de ${alumno}` : 'Representante de un alumno';
    }
    const titulo = c.name ?? c.title ?? c.nombre ?? c.concepto ?? c.topic ?? null;
    const base = NOMBRE_DE_TABLA[tabla] ?? tabla.replace(/([A-Z])/g, ' $1').toLowerCase().replace(/^./, (x) => x.toUpperCase());
    const deQuien = nombreDe(c.studentId);
    if (titulo) return `${base} «${String(titulo).slice(0, 80)}»${deQuien ? ` de ${deQuien}` : ''}`;
    return deQuien ? `${base} de ${deQuien}` : base;
}

// ── El plazo del liceo ─────────────────────────────────────────────────────

export async function diasDeLaPapelera(instituteId: string): Promise<number> {
    const inst = await platformPrisma.institute.findUnique({ where: { id: instituteId }, select: { academicConfig: true } });
    const d = Number((inst?.academicConfig as any)?.papelera?.dias);
    return Number.isFinite(d) ? Math.min(DIAS_MAXIMO, Math.max(DIAS_MINIMO, Math.round(d))) : DIAS_POR_DEFECTO;
}

export async function ponerDiasDeLaPapelera(instituteId: string, dias: number): Promise<number> {
    if (!Number.isInteger(dias) || dias < DIAS_MINIMO || dias > DIAS_MAXIMO) {
        throw createError(400, `El plazo va de ${DIAS_MINIMO} a ${DIAS_MAXIMO} días`, 'PLAZO_INVALIDO');
    }
    const inst = await platformPrisma.institute.findUnique({ where: { id: instituteId }, select: { academicConfig: true } });
    // Se mezcla con lo que había: guardar esto no puede borrar el resto de la configuración.
    const cfg = { ...((inst?.academicConfig as Record<string, unknown>) ?? {}), papelera: { dias } };
    await platformPrisma.institute.update({ where: { id: instituteId }, data: { academicConfig: cfg as any } });
    return dias;
}

// ── Listar ─────────────────────────────────────────────────────────────────

export async function laPapelera(prisma: Prisma_, instituteId: string, pagina = 1) {
    const dias = await diasDeLaPapelera(instituteId);
    const desde = (Math.max(1, Math.floor(pagina)) - 1) * POR_PAGINA;
    const [grupos, [total]]: [any[], any[]] = await Promise.all([
        prisma.$queryRawUnsafe(
            `SELECT ${CLAVE} AS clave, min("createdAt") AS cuando, count(*)::int AS filas, max("borradoPor") AS "borradoPor", array_agg(DISTINCT "tabla") AS tablas
               FROM "registros_borrados" GROUP BY 1 ORDER BY 2 DESC LIMIT ${POR_PAGINA} OFFSET $1`,
            desde
        ),
        prisma.$queryRawUnsafe(`SELECT count(DISTINCT ${CLAVE})::int AS n FROM "registros_borrados"`),
    ]);
    // Qué es cada borrado: la fila de más arriba (el alumno, no sus notas). Una consulta para las 20.
    const raiz = grupos.map((g) => [...(g.tablas as string[])].sort((a, b) => hondo(a) - hondo(b))[0]);
    const filas: any[] = grupos.length
        ? await prisma.$queryRawUnsafe(
              `SELECT DISTINCT ON (k) k, "tabla", "contenido" FROM (
                 SELECT ${CLAVE} AS k, "tabla", "contenido", "orden" FROM "registros_borrados") x
                WHERE (k, "tabla") IN (SELECT * FROM unnest($1::text[], $2::text[]))
                ORDER BY k, "orden"`,
              grupos.map((g) => g.clave),
              raiz
          )
        : [];
    const deCada = new Map(filas.map((f) => [f.k, f]));
    // Quién borró y de quién era, en UNA consulta para las 20.
    const nombres = await nombresDe(prisma, [
        ...grupos.map((g) => g.borradoPor),
        ...filas.flatMap((f) => [f.contenido?.studentId, f.contenido?.tutorId]),
    ]);
    const nombreDe = (id: unknown) => (typeof id === 'string' ? nombres.get(id) ?? null : null);
    return {
        dias,
        total: Number(total?.n ?? 0),
        pagina: Math.max(1, Math.floor(pagina)),
        porPagina: POR_PAGINA,
        borrados: grupos.map((g) => {
            const f = deCada.get(g.clave);
            const cuando = new Date(g.cuando);
            return {
                operacion: g.clave as string,
                que: f ? queEs(f.tabla, f.contenido ?? {}, nombreDe) : 'Algo borrado',
                tipo: f?.tabla ?? null,
                // Lo que arrastró (sus notas, su asistencia…), además de lo que se nombró.
                masCosas: Math.max(0, Number(g.filas) - 1),
                borradoPor: g.borradoPor ? nombres.get(g.borradoPor) ?? 'alguien' : null,
                cuando: cuando.toISOString(),
                seBorraEl: new Date(cuando.getTime() + dias * 86_400_000).toISOString(),
            };
        }),
    };
}

// ── Restaurar ──────────────────────────────────────────────────────────────

const TROZO = 1000;

export async function restaurar(prisma: Prisma_, operacion: string): Promise<{ restauradas: number; que: string }> {
    const filas: Array<{ id: string; tabla: string; registroId: string; contenido: Record<string, unknown> }> = await prisma.$queryRawUnsafe(
        `SELECT "id", "tabla", "registroId", "contenido" FROM "registros_borrados" WHERE ${CLAVE} = $1 ORDER BY "orden"`,
        operacion
    );
    if (!filas.length) throw createError(404, 'Eso ya no está en la papelera', 'NO_ESTA_EN_LA_PAPELERA');

    // Una fila, una vez (dos borrados en la misma petición pudieron copiar la misma).
    const porTabla = new Map<string, Map<string, Record<string, unknown>>>();
    for (const f of filas) {
        if (!MODELOS.has(f.tabla)) throw createError(409, `No se sabe restaurar «${f.tabla}»`, 'NO_SE_PUEDE_RESTAURAR');
        if (!porTabla.has(f.tabla)) porTabla.set(f.tabla, new Map());
        porTabla.get(f.tabla)!.set(f.registroId || f.id, f.contenido);
    }
    const orden = [...porTabla.keys()].sort((a, b) => hondo(a) - hondo(b));
    const raiz = orden[0];
    const que = queEs(raiz, [...porTabla.get(raiz)!.values()][0] ?? {});

    try {
        await prisma.$transaction(
            async (tx: Prisma_) => {
                for (const tabla of orden) {
                    const datos = [...porTabla.get(tabla)!.values()].map((c) => revivir(tabla, c));
                    for (let i = 0; i < datos.length; i += TROZO) await tx[tabla].createMany({ data: datos.slice(i, i + TROZO) });
                }
                await tx.$executeRawUnsafe(`DELETE FROM "registros_borrados" WHERE ${CLAVE} = $1`, operacion);
            },
            { timeout: 120_000, maxWait: 10_000 }
        );
    } catch (e: any) {
        if (e?.code === 'P2002') {
            throw createError(409, `No se puede restaurar ${que}: ya existe otra vez (se volvió a crear con los mismos datos).`, 'YA_EXISTE');
        }
        if (e?.code === 'P2003') {
            throw createError(
                409,
                `No se puede restaurar ${que}: lo que lo contenía también se borró. Restaura primero eso (está más abajo en la papelera).`,
                'FALTA_LO_DE_ARRIBA'
            );
        }
        throw e;
    }
    return { restauradas: filas.length, que };
}

// ── Borrar para siempre ────────────────────────────────────────────────────

export async function borrarParaSiempre(prisma: Prisma_, operacion: string): Promise<number> {
    const n = await prisma.$executeRawUnsafe(`DELETE FROM "registros_borrados" WHERE ${CLAVE} = $1`, operacion);
    if (!n) throw createError(404, 'Eso ya no está en la papelera', 'NO_ESTA_EN_LA_PAPELERA');
    return Number(n);
}
