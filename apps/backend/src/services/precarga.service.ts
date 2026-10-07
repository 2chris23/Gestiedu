import { randomBytes } from 'crypto';
import { readFileSync, statSync } from 'fs';
import { join } from 'path';
// Importado (y no solo leído) para que la compilación lo copie a `dist`.
import moldesGrabados from '../precarga/lecturas-por-pantalla.json';
import { instituteTimezone, todayInTimezone } from '../utils/school-time';
import { RedisCache } from '../config/redis';

/**
 * LA PRECARGA EN UN PAQUETE (octubre 2026, pedido por Cristian)
 *
 * La primera vez que alguien entra en un teléfono, la app baja TODO lo suyo
 * para usarlo sin conexión. Antes lo hacía abriendo cada pantalla en un marco
 * invisible: 1,6 h el admin, sin saber cuántos MB. Ahora el servidor dice qué
 * hay que bajar (`plan`) y lo entrega por bloques (`bloque`), y el teléfono
 * cuenta los MB de verdad.
 *
 * QUÉ SE BAJA
 *
 * Cada pantalla tiene su «molde»: `/dashboard/usuarios/{id}`. Y cada molde,
 * las lecturas que hace esa pantalla, también en molde
 * (`/students/{id}/recaudos`, `/sessions/live-overview?classroomId={seccion}&date={hoy}`).
 * Las lecturas NO se escriben a mano: las graba `tests/e2e/grabar-lecturas.spec.ts`
 * abriendo cada pantalla de verdad, y el contexto de esa pantalla (`ctx`) dice
 * qué trozo es qué. Lo que no se sabe explicar (un id o una fecha que no sale
 * del contexto) pone la grabación en rojo: así una pantalla nueva no se queda
 * fuera callada. Resultado: `precarga/lecturas-por-pantalla.json`.
 *
 * AQUÍ se sacan de los datos las pantallas de esa persona —cada ciclo,
 * sección, materia y ficha que ESA persona puede ver— con su contexto, y se
 * rellenan los moldes.
 *
 * Y NADA SE ESCAPA DE LOS PERMISOS: cada lectura del bloque se hace como una
 * petición más de esa persona (`server.inject` con SU credencial), así que
 * pasa por los mismos guardianes (`canSeeStudent`, `assertCanSeeClassroom`…).
 * Lo que daría 403 a mano no va en el paquete.
 */

/**
 * Lo que es cada trozo de una pantalla. Un valor lista (`materiasDeLaSeccion`)
 * es para lecturas que la pantalla hace UNA VEZ POR CADA
 * (`{materiasDeLaSeccion[]}`): la sección pide el plan de cada materia.
 */
export type Contexto = Record<string, string | string[]>;

export interface Pantalla {
    /** El molde: `/dashboard/usuarios/{id}`. */
    molde: string;
    ctx: Contexto;
    /**
     * La misma pantalla que pide cosas distintas según de quién sea: la ficha
     * de un alumno no lee lo mismo que la de un profesor. Se graba una de cada.
     */
    variante?: string;
}

/** La llave de las lecturas grabadas: `ADMIN:/dashboard/usuarios/{id}#STUDENT`. */
export function llaveDelMolde(rol: string, p: Pick<Pantalla, 'molde' | 'variante'>): string {
    return `${rol}:${p.molde}${p.variante ? `#${p.variante}` : ''}`;
}

interface Moldes {
    version: number;
    pantallas: Record<string, string[]>;
}

let moldesEnMemoria: Moldes | null = null;

/** Las lecturas grabadas de cada molde (`precarga/lecturas-por-pantalla.json`). */
const ARCHIVO_DE_MOLDES = join(__dirname, '..', 'precarga', 'lecturas-por-pantalla.json');
let leidos: { cuando: number; moldes: Moldes } | null = null;

/**
 * Lo importado se queda con lo que había al arrancar, y la grabadora reescribe
 * el archivo con el servidor en marcha: se relee si cambió (una mirada a la
 * fecha del archivo; en producción no cambia nunca).
 */
function losDelArchivo(): Moldes {
    try {
        const cuando = statSync(ARCHIVO_DE_MOLDES).mtimeMs;
        if (!leidos || leidos.cuando !== cuando) leidos = { cuando, moldes: JSON.parse(readFileSync(ARCHIVO_DE_MOLDES, 'utf-8')) as Moldes };
        return leidos.moldes;
    } catch {
        return moldesGrabados as Moldes;
    }
}

export function losMoldes(): Moldes {
    return moldesEnMemoria ?? losDelArchivo();
}

/** Para las pruebas. */
export function cambiarLosMoldes(m: Moldes | null): void {
    moldesEnMemoria = m;
}

// ── Rellenar un molde ───────────────────────────────────────────────────────

/** `{id}` → el valor (codificado como va en una dirección). */
export function rellenar(molde: string, ctx: Contexto): string | null {
    let falta = false;
    const salida = molde.replace(/\{([a-zA-Z]+)\}/g, (_, k: string) => {
        const v = ctx[k];
        if (typeof v !== 'string' || v === '') {
            falta = true;
            return '';
        }
        return encodeURIComponent(v);
    });
    return falta ? null : salida;
}

/** Igual, con los `{lista[]}`: una dirección por cada valor (y por cada combinación). */
export function rellenarTodas(molde: string, ctx: Contexto): string[] {
    const listas = [...new Set([...molde.matchAll(/\{([a-zA-Z]+)\[\]\}/g)].map((m) => m[1]))];
    let moldes = [molde];
    for (const k of listas) {
        const valores = ctx[k];
        if (!Array.isArray(valores) || valores.length === 0) return [];
        const marca = `{${k}[]}`;
        moldes = moldes.flatMap((m) => valores.map((v) => m.split(marca).join(encodeURIComponent(v))));
    }
    return moldes.map((m) => rellenar(m, ctx)).filter((u): u is string => Boolean(u));
}

/**
 * La llave con que el teléfono guarda una lectura: la misma cuenta que
 * `claveDeLaPeticion` en `apps/web/src/lib/respuestas-guardadas.ts` (la
 * dirección con los parámetros ordenados).
 */
export function claveDeLaLectura(url: string): string {
    const [camino, query = ''] = url.split('?');
    const todos = new URLSearchParams(query);
    const orden = [...todos.entries()].sort(([a, x], [b, y]) => (a === b ? x.localeCompare(y) : a.localeCompare(b)));
    const limpia = camino.replace(/^\/+/, '/').replace(/\/+$/, '') || '/';
    return orden.length ? `${limpia}?${new URLSearchParams(orden).toString()}` : limpia;
}

// ── Las pantallas de cada persona ───────────────────────────────────────────

const UN_DIA = 864e5;

/** Lunes a viernes de la semana de `hoy`. */
export function laSemanaDe(hoy: string): string[] {
    const dia = new Date(`${hoy}T12:00:00Z`);
    const lunes = dia.getTime() - ((dia.getUTCDay() + 6) % 7) * UN_DIA;
    return [0, 1, 2, 3, 4].map((i) => new Date(lunes + i * UN_DIA).toISOString().slice(0, 10));
}

/** Lo que vale para todas las pantallas de esa persona. */
async function elContextoComun(prisma: any, yoId: string): Promise<Contexto> {
    const hoy = todayInTimezone(await instituteTimezone(prisma));
    const semana = laSemanaDe(hoy);
    // El ciclo en curso: marcado activo, o en estado ACTIVE (así lo deja el alta).
    const activo =
        (await prisma.academicYear.findFirst({
            where: { OR: [{ isActive: true }, { status: 'ACTIVE' }] },
            select: { id: true, name: true },
            orderBy: { startDate: 'desc' },
        })) ?? (await prisma.academicYear.findFirst({ select: { id: true, name: true }, orderBy: { startDate: 'desc' } }));
    const lapsos: string[] = activo
        ? (await prisma.period.findMany({ where: { academicYearId: activo.id }, select: { id: true }, orderBy: { startDate: 'asc' } })).map(
              (x: { id: string }) => x.id
          )
        : [];
    const [anio, mes] = hoy.split('-').map(Number);
    const primeroDelMes = `${hoy.slice(0, 7)}-01`;
    const ultimoDelMes = new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10);
    // La rejilla del calendario del mes: de lunes a domingo, semanas enteras.
    const diaDe = (f: string) => new Date(`${f}T12:00:00Z`);
    const inicioDeLaRejilla = new Date(diaDe(primeroDelMes).getTime() - ((diaDe(primeroDelMes).getUTCDay() + 6) % 7) * UN_DIA)
        .toISOString()
        .slice(0, 10);
    const finDeLaRejilla = new Date(diaDe(ultimoDelMes).getTime() + ((7 - diaDe(ultimoDelMes).getUTCDay()) % 7) * UN_DIA)
        .toISOString()
        .slice(0, 10);
    return {
        yo: yoId,
        hoy,
        lunes: semana[0],
        viernes: semana[4],
        domingo: new Date(Date.parse(`${semana[0]}T12:00:00Z`) + 6 * UN_DIA).toISOString().slice(0, 10),
        mes: hoy.slice(0, 7),
        primeroDelMes,
        ultimoDelMes,
        inicioDeLaRejilla,
        finDeLaRejilla,
        lapsos,
        ...(activo ? { anio: activo.id, ciclo: activo.name } : {}),
    };
}

// Las del menú son fijas: sin números (un id —la boleta de alguien— no es del menú).
const ES_DEL_PANEL = /^\/dashboard(\/[a-z-]+)*$/;

/** Las del menú que manda la app (su menú lo decide la web: módulos encendidos…). */
/**
 * Lo del menú de cada rol que no depende de ningún módulo, aunque la app no
 * lo mande.
 */
const SIEMPRE_EN_EL_MENU: Record<string, string[]> = {
    // Pagos y comedor no: dependen del módulo, y la app espera a saberlo
    // antes de mandar su menú (`PrecargaAlEntrar`).
    ADMIN: ['/dashboard/eventos', '/dashboard/usuarios', '/dashboard/configuracion'],
    TEACHER: [],
    STUDENT: ['/dashboard/boleta/mia'],
    TUTOR: [],
};

function lasDelMenu(menu: unknown, rol = ''): string[] {
    const salida = new Set<string>(['/dashboard', ...(SIEMPRE_EN_EL_MENU[rol] ?? [])]);
    if (Array.isArray(menu)) for (const h of menu) if (typeof h === 'string' && ES_DEL_PANEL.test(h)) salida.add(h);
    return [...salida];
}

interface SeccionConMaterias {
    id: string;
    slug: string;
    teacherId: string | null;
    academicYear: { id: string; name: string } | null;
    subjects: Array<{ subjectId: string; teacherId: string | null; subject: { slug: string } }>;
}

async function lasSecciones(prisma: any, where: Record<string, unknown>): Promise<SeccionConMaterias[]> {
    return prisma.classroom.findMany({
        where: { isActive: true, ...where },
        select: {
            id: true,
            slug: true,
            teacherId: true,
            academicYear: { select: { id: true, name: true } },
            subjects: { select: { subjectId: true, teacherId: true, subject: { select: { slug: true } } } },
        },
        orderBy: [{ grade: 'asc' }, { section: 'asc' }],
    });
}

function deLaSeccion(s: SeccionConMaterias): Contexto {
    return {
        seccion: s.id,
        seccionSlug: s.slug,
        materiasDeLaSeccion: s.subjects.map((m) => m.subjectId),
        ...(s.academicYear ? { ciclo: s.academicYear.name, anio: s.academicYear.id } : {}),
    };
}

/**
 * `variante`: el profesor ve los promedios solo de sus secciones GUÍA, así
 * que esa pantalla pide más en la guía que en las demás (se graba cada una).
 */
function laSeccionEntera(s: SeccionConMaterias, comun: Contexto, conTodo: boolean, variante?: string): Pantalla[] {
    const ctx = { ...comun, ...deLaSeccion(s) };
    const salida: Pantalla[] = [
        { molde: '/dashboard/academico/{ciclo}/{seccionSlug}', ctx, ...(variante ? { variante } : {}) },
        { molde: '/dashboard/horario/{ciclo}/{seccionSlug}', ctx },
        { molde: '/dashboard/horarios/seccion/{seccion}', ctx },
    ];
    if (conTodo) salida.push({ molde: '/dashboard/consejo/{seccion}', ctx });
    return salida;
}

function laMateria(s: SeccionConMaterias, m: SeccionConMaterias['subjects'][number], comun: Contexto): Pantalla[] {
    const ctx = { ...comun, ...deLaSeccion(s), materia: m.subjectId, materiaSlug: m.subject.slug };
    return [
        { molde: '/dashboard/academico/{ciclo}/{seccionSlug}/{materia}', ctx },
        { molde: '/dashboard/plan-de-evaluacion/{seccion}/{materia}', ctx },
        { molde: '/dashboard/instrumentos-de-evaluacion/{seccion}/{materia}', ctx },
    ];
}

/** La sección activa de un alumno (para su ficha: horario, clase de hoy…). */
async function lasSeccionesDeLosAlumnos(prisma: any, ids: string[]): Promise<Map<string, string>> {
    const filas = await prisma.studentClassroom.findMany({
        where: { studentId: { in: ids }, isActive: true },
        select: { studentId: true, classroomId: true },
        orderBy: { enrollmentDate: 'desc' },
    });
    const m = new Map<string, string>();
    for (const f of filas) if (!m.has(f.studentId)) m.set(f.studentId, f.classroomId);
    return m;
}

async function lasFichas(prisma: any, ids: string[], comun: Contexto): Promise<Pantalla[]> {
    const secciones = await lasSeccionesDeLosAlumnos(prisma, ids);
    const roles = new Map<string, string>(
        (await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, role: true } })).map((u: { id: string; role: string }) => [u.id, u.role])
    );
    // La ficha de un profesor lee lo de hoy de cada una de sus secciones.
    const profes = ids.filter((id) => roles.get(id) === 'TEACHER');
    const delProfe = new Map<string, Set<string>>();
    if (profes.length) {
        const guias = await prisma.classroom.findMany({ where: { teacherId: { in: profes }, isActive: true }, select: { id: true, teacherId: true } });
        const imparte = await prisma.classroomSubject.findMany({ where: { teacherId: { in: profes } }, select: { classroomId: true, teacherId: true } });
        for (const g of guias) (delProfe.get(g.teacherId) ?? delProfe.set(g.teacherId, new Set()).get(g.teacherId)!).add(g.id);
        for (const m of imparte) (delProfe.get(m.teacherId) ?? delProfe.set(m.teacherId, new Set()).get(m.teacherId)!).add(m.classroomId);
    }
    return ids.map((id) => {
        const seccion = secciones.get(id);
        const suyas = delProfe.get(id);
        return {
            molde: '/dashboard/usuarios/{id}',
            variante: roles.get(id) ?? 'OTRO',
            ctx: { ...comun, id, ...(seccion ? { seccionDelAlumno: seccion } : {}), ...(suyas ? { seccionesDelProfe: [...suyas] } : {}) },
        };
    });
}

async function delAdmin(prisma: any, comun: Contexto, menu: string[]): Promise<Pantalla[]> {
    const salida: Pantalla[] = menu.map((m) => ({ molde: m, ctx: comun }));
    const ciclos = await prisma.academicYear.findMany({ select: { id: true, name: true }, orderBy: { startDate: 'desc' } });
    for (const c of ciclos) {
        const ctx = { ...comun, ciclo: c.name, anio: c.id };
        for (const sub of ['', '/cierre', '/graduandos', '/matricula', '/promocion']) salida.push({ molde: `/dashboard/academico/{ciclo}${sub}`, ctx });
    }
    const secciones = await lasSecciones(prisma, {});
    const materiasDelCiclo = new Map<string, Contexto>();
    for (const s of secciones) {
        salida.push(...laSeccionEntera(s, comun, true));
        for (const m of s.subjects) {
            salida.push(...laMateria(s, m, comun).filter((p) => !p.molde.startsWith('/dashboard/instrumentos')));
            if (s.academicYear) materiasDelCiclo.set(`${s.academicYear.id}|${m.subjectId}`, { ...comun, ciclo: s.academicYear.name, anio: s.academicYear.id, materia: m.subjectId, materiaSlug: m.subject.slug });
        }
    }
    for (const ctx of materiasDelCiclo.values()) salida.push({ molde: '/dashboard/materias/{ciclo}/{materiaSlug}', ctx });
    const profes = await prisma.user.findMany({ where: { role: 'TEACHER', isActive: true }, select: { id: true }, orderBy: { id: 'asc' } });
    for (const p of profes) salida.push({ molde: '/dashboard/horarios/profesor/{profe}', ctx: { ...comun, profe: p.id } });
    const todos = await prisma.user.findMany({ where: { isActive: true, role: { in: ['STUDENT', 'TEACHER', 'TUTOR', 'ADMIN'] } }, select: { id: true }, orderBy: { id: 'asc' } });
    salida.push(...(await lasFichas(prisma, todos.map((u: { id: string }) => u.id), comun)));
    // La boleta de cada alumno (la hoja para imprimir que más se pide): una
    // sola página para todas, y sus datos.
    const alumnos = await prisma.studentClassroom.findMany({ where: { isActive: true }, select: { studentId: true }, distinct: ['studentId'] });
    for (const a of alumnos) salida.push({ molde: '/dashboard/boleta/{alumno}', ctx: { ...comun, alumno: a.studentId } });
    return salida;
}

async function delProfesor(prisma: any, comun: Contexto, menu: string[], yoId: string): Promise<Pantalla[]> {
    const salida: Pantalla[] = menu.map((m) => ({ molde: m, ctx: comun }));
    const secciones = await lasSecciones(prisma, { OR: [{ teacherId: yoId }, { subjects: { some: { teacherId: yoId } } }] });
    for (const s of secciones) {
        const esGuia = s.teacherId === yoId;
        salida.push(...laSeccionEntera(s, comun, esGuia, esGuia ? 'GUIA' : 'IMPARTE'));
        for (const m of s.subjects) if (m.teacherId === yoId) salida.push(...laMateria(s, m, comun));
    }
    // Su semana de clases: la clase en vivo de cada bloque, con su fecha.
    const semana = laSemanaDe(String(comun.hoy));
    const bloques = await prisma.scheduleBlock.findMany({
        where: { blockType: 'CLASS', classroomSubject: { teacherId: yoId } },
        select: { dayOfWeek: true, startTime: true, endTime: true, classroomId: true, classroomSubject: { select: { subjectId: true } } },
    });
    for (const b of bloques) {
        const fecha = b.dayOfWeek >= 1 && b.dayOfWeek <= 5 ? semana[b.dayOfWeek - 1] : null;
        if (!fecha || !b.classroomId || !b.classroomSubject) continue;
        salida.push({
            molde: '/dashboard/clase-en-vivo/{seccion}/{materia}?date={fecha}&start={inicio}&end={fin}',
            ctx: { ...comun, seccion: b.classroomId, materia: b.classroomSubject.subjectId, fecha, inicio: b.startTime, fin: b.endTime },
        });
    }
    // Las fichas no: el profesor no las abre (`proxy.ts`, solo el admin).
    return salida;
}

async function lasMateriasDelAlumno(prisma: any, alumnoId: string): Promise<{ seccion: string | null; materias: string[] }> {
    const ins = await prisma.studentClassroom.findFirst({
        where: { studentId: alumnoId, isActive: true },
        select: { classroomId: true, classroom: { select: { subjects: { select: { subjectId: true } } } } },
        orderBy: { enrollmentDate: 'desc' },
    });
    return { seccion: ins?.classroomId ?? null, materias: (ins?.classroom?.subjects ?? []).map((s: { subjectId: string }) => s.subjectId) };
}

async function delAlumno(prisma: any, comun: Contexto, menu: string[], yoId: string): Promise<Pantalla[]> {
    const { seccion, materias } = await lasMateriasDelAlumno(prisma, yoId);
    const ctx = { ...comun, ...(seccion ? { seccionDelAlumno: seccion } : {}) };
    const salida: Pantalla[] = [...menu, '/dashboard/mi-clase'].map((m) => ({ molde: m, ctx }));
    for (const materia of materias) salida.push({ molde: '/dashboard/mi-clase/{materia}', ctx: { ...ctx, materia } });
    return salida;
}

async function delRepresentante(prisma: any, comun: Contexto, menu: string[], yoId: string): Promise<Pantalla[]> {
    const hijos = await prisma.studentTutor.findMany({ where: { tutorId: yoId }, select: { studentId: true }, orderBy: { studentId: 'asc' } });
    // Su inicio lee lo de cada representado (y de la sección de cada uno).
    const seccionesDeLosHijos = await lasSeccionesDeLosAlumnos(
        prisma,
        hijos.map((h: { studentId: string }) => h.studentId)
    );
    const delInicio: Contexto = {
        ...comun,
        hijos: hijos.map((h: { studentId: string }) => h.studentId),
        seccionesDeLosHijos: [...new Set(seccionesDeLosHijos.values())],
    };
    const salida: Pantalla[] = menu.map((m) => ({ molde: m, ctx: delInicio }));
    for (const { studentId } of hijos) {
        const { seccion, materias } = await lasMateriasDelAlumno(prisma, studentId);
        const ctx = { ...comun, alumno: studentId, ...(seccion ? { seccionDelAlumno: seccion } : {}) };
        salida.push({ molde: '/dashboard/mi-clase?alumno={alumno}', ctx });
        // Su boleta, que se abre desde el inicio (la misma página para todas).
        salida.push({ molde: '/dashboard/boleta/{alumno}', ctx });
        for (const materia of materias) salida.push({ molde: '/dashboard/mi-clase/{materia}?alumno={alumno}', ctx: { ...ctx, materia } });
    }
    return salida;
}

/** Todas las pantallas de esta persona, con su contexto (lo principal primero). */
export async function lasPantallasDe(prisma: any, yo: { id: string; role: string }, menu: unknown): Promise<Pantalla[]> {
    const comun = await elContextoComun(prisma, yo.id);
    const delMenu = lasDelMenu(menu, yo.role);
    if (yo.role === 'ADMIN') return delAdmin(prisma, comun, delMenu);
    if (yo.role === 'TEACHER') return delProfesor(prisma, comun, delMenu, yo.id);
    if (yo.role === 'STUDENT') return delAlumno(prisma, comun, delMenu, yo.id);
    if (yo.role === 'TUTOR') return delRepresentante(prisma, comun, delMenu, yo.id);
    return delMenu.map((m) => ({ molde: m, ctx: comun }));
}

// ── El plan ─────────────────────────────────────────────────────────────────

export const LECTURAS_POR_BLOQUE = 150;

export interface Plan {
    /** Cambia si cambian los moldes o lo que hay que bajar. */
    version: string;
    /** Una página por molde (el ayudante sirve las demás como plantilla). */
    paginas: string[];
    lecturas: string[];
    /** Moldes sin lecturas grabadas: la grabación está vieja. */
    sinGrabar: string[];
}

function huellaNumero(texto: string): number {
    let h = 2166136261;
    for (let i = 0; i < texto.length; i++) {
        h ^= texto.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function huella(texto: string): string {
    return huellaNumero(texto).toString(36);
}

/**
 * LAS LECTURAS, BARAJADAS (siempre igual)
 *
 * Iban en el orden de las pantallas: primero lo grande (secciones, listas) y
 * al final lo pequeño (600 fichas). El teléfono calcula lo que falta con lo
 * que lleva, así que el total empezaba muy alto y bajaba solo: el amigo de
 * Cristian vio 104,9 → 89,7 → 51,0 → 33,2 MB. Barajadas por su huella, cada
 * bloque se parece a todos —el cálculo acierta desde el primero— y el orden
 * es el mismo cada vez (la versión del plan y el reanudar no cambian).
 */
function barajar(lecturas: string[]): string[] {
    return lecturas
        .map((l) => [huellaNumero(l), l] as const)
        .sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
        .map(([, l]) => l);
}

// ── Lo que pesa cada tipo de lectura (para el «X de Y MB») ──────────────────

/**
 * Un trozo de la dirección que cambia de una lectura a otra (un id, un slug
 * con números, una fecha): se cambia por `:x` para agrupar por tipo.
 */
const TROZO_VARIABLE = /^(?=[A-Za-z0-9_.-]*\d)[A-Za-z0-9_.-]{4,}$|^\d+$/;

/** `/students/est0575/boleta?lapso=2` → `/students/:x/boleta?lapso` */
export function formaDeLaLectura(lectura: string): string {
    const [camino, query = ''] = lectura.split('?');
    const trozos = camino.split('/').map((t) => {
        let limpio = t;
        try {
            limpio = decodeURIComponent(t);
        } catch {
            /* tal cual */
        }
        return t && TROZO_VARIABLE.test(limpio) ? ':x' : t;
    });
    const claves = [...new Set(new URLSearchParams(query).keys())].sort();
    return trozos.join('/') + (claves.length ? `?${claves.join('&')}` : '');
}

/**
 * LO APRENDIDO: liceo → tipo de lectura → cuánto pesa de media.
 *
 * Cada bloque que se entrega enseña cuánto pesó cada lectura; con eso el plan
 * siguiente dice cuánto pesará cada bloque antes de bajar nada, y el total
 * que ve la persona no baila. Es solo un cálculo: si el proceso se reinicia,
 * se vuelve a aprender con la primera descarga. La llave es el liceo
 * (MEZCLA-08): lo de un liceo no estima lo de otro.
 */
const PESOS = new Map<string, Map<string, { n: number; media: number }>>();
const MAX_LICEOS_CON_PESOS = 300;
const MAX_TIPOS_POR_LICEO = 3000;

export function apuntarLoQuePesa(liceo: string, lectura: string, bytes: number): void {
    if (!liceo || !Number.isFinite(bytes)) return;
    let delLiceo = PESOS.get(liceo);
    if (!delLiceo) {
        if (PESOS.size >= MAX_LICEOS_CON_PESOS) PESOS.delete(PESOS.keys().next().value as string);
        delLiceo = new Map();
        PESOS.set(liceo, delLiceo);
    }
    const forma = formaDeLaLectura(lectura);
    const antes = delLiceo.get(forma);
    if (!antes) {
        if (delLiceo.size >= MAX_TIPOS_POR_LICEO) return;
        delLiceo.set(forma, { n: 1, media: bytes });
        return;
    }
    // Media que sigue a los datos (pesa lo último), sin olvidar de golpe.
    const n = Math.min(antes.n + 1, 200);
    antes.media += (bytes - antes.media) / n;
    antes.n = n;
}

/**
 * Cuánto pesará cada bloque del plan, con lo aprendido; `null` si este liceo
 * aún no ha bajado nada. Un tipo nunca visto vale la media del liceo.
 */
export function loQuePesaraCadaBloque(liceo: string, lecturas: string[], porBloque: number): { porBloque: number[]; conocidas: number } | null {
    const delLiceo = PESOS.get(liceo);
    if (!delLiceo || delLiceo.size === 0) return null;
    let suma = 0;
    let cuantas = 0;
    for (const { n, media } of delLiceo.values()) {
        suma += n * media;
        cuantas += n;
    }
    const mediaDelLiceo = cuantas ? suma / cuantas : 0;
    const salida: number[] = [];
    let conocidas = 0;
    for (let i = 0; i < lecturas.length; i += porBloque) {
        let bloque = 0;
        for (const l of lecturas.slice(i, i + porBloque)) {
            const peso = delLiceo.get(formaDeLaLectura(l));
            if (peso) conocidas++;
            bloque += peso ? peso.media : mediaDelLiceo;
        }
        salida.push(Math.round(bloque));
    }
    return { porBloque: salida, conocidas };
}

/** Para las pruebas. */
export function olvidarLoQuePesa(): void {
    PESOS.clear();
}

/**
 * Las lecturas se graban POR ROL: el Inicio del admin no pide lo mismo que
 * el del alumno, aunque los dos sean `/dashboard`. Llave: `ADMIN:/dashboard`.
 */
export function elPlanDeLasPantallas(pantallas: Pantalla[], rol: string): Plan {
    const moldes = losMoldes();
    const paginas: string[] = [];
    const yaHayPagina = new Set<string>();
    const lecturas: string[] = [];
    const vistas = new Set<string>();
    const sinGrabar = new Set<string>();

    for (const p of pantallas) {
        const url = rellenar(p.molde, p.ctx);
        if (!url) continue;
        if (!yaHayPagina.has(p.molde)) {
            yaHayPagina.add(p.molde);
            paginas.push(url);
        }
        const suyas = moldes.pantallas[llaveDelMolde(rol, p)] ?? (p.variante ? moldes.pantallas[`${rol}:${p.molde}`] : undefined);
        if (!suyas) {
            sinGrabar.add(p.molde);
            continue;
        }
        for (const m of suyas) {
            for (const lectura of rellenarTodas(m, p.ctx)) {
                const clave = claveDeLaLectura(lectura);
                if (vistas.has(clave)) continue;
                vistas.add(clave);
                lecturas.push(clave);
            }
        }
    }
    const barajadas = barajar(lecturas);
    return {
        version: `${moldes.version}-${huella(barajadas.join('\n'))}`,
        paginas,
        lecturas: barajadas,
        sinGrabar: [...sinGrabar],
    };
}

// ── Las lecturas de un bloque ───────────────────────────────────────────────

/**
 * Las lecturas internas del paquete no gastan el cupo de peticiones de la
 * persona (un bloque son 150): llevan esta marca, que solo conoce ESTE
 * proceso y cambia cada vez que arranca. El bloque en sí sí cuenta.
 */
export const MARCA_INTERNA = randomBytes(24).toString('hex');
export const CABECERA_INTERNA = 'x-lectura-de-la-precarga';

/** Lo que nunca se pide desde un paquete, aunque lo pida el teléfono. */
const NO_VALE = /^\/(auth|superadmin|precarga|health|time)\b/;

export function esUnaLecturaValida(clave: unknown): clave is string {
    return (
        typeof clave === 'string' &&
        clave.length <= 600 &&
        clave.startsWith('/') &&
        !clave.startsWith('//') &&
        !clave.includes('..') &&
        !clave.includes('#') &&
        !/[\s\\]/.test(clave) &&
        !NO_VALE.test(clave)
    );
}

// ── Lo que cambió desde la última vez ───────────────────────────────────────

/** Cuántos cambios se miran como mucho: con más, sale más a cuenta bajar todo. */
const TOPE_DE_CAMBIOS = 2000;
const PARECE_UN_ID = /^(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{6,64}$/;
const PARECE_FECHA = /^\d{4}-\d{2}(-\d{2})?$/;

/** Los ids de una lectura (sin fechas ni lo que es de todos: el ciclo, los lapsos). */
function losIdsDe(lectura: string, deTodos: Set<string>): string[] {
    const [camino, query = ''] = lectura.split('?');
    const trozos = [...camino.split('/'), ...new URLSearchParams(query).values()];
    return trozos.filter((t) => PARECE_UN_ID.test(t) && !PARECE_FECHA.test(t) && !deTodos.has(t));
}

export interface LoQueCambio {
    marca: number;
    /** Demasiado viejo (o demasiados cambios): toca bajar todo otra vez. */
    todo: boolean;
    lecturas: string[];
    paginas?: string[];
}

/**
 * «¿Qué cambió desde el cambio N?» — las lecturas del plan de esta persona
 * que esos cambios tocan:
 *
 *   · las que no son de nadie en concreto (listas, resúmenes, el inicio), si
 *     algún cambio le toca;
 *   · las que nombran un id de los que nombraba algún cambio (el alumno, la
 *     sección, lo de la dirección de la escritura).
 *
 * Un cambio que no le toca a esta persona (otra sección, otro alumno) no
 * cuenta. Lo nuevo que no estaba en el plan de antes (un alumno nuevo) llega
 * con la pasada entera de cada día.
 */
export async function loQueCambioDesde(prisma: any, yo: { id: string; role: string }, menu: unknown, desde: number): Promise<LoQueCambio> {
    const extremos = await prisma.cambioDelLiceo.aggregate({ _min: { id: true }, _max: { id: true } });
    const minimo: number | null = extremos._min.id;
    const marca: number = extremos._max.id ?? desde;

    const tz = await instituteTimezone(prisma);
    const hoyActual = todayInTimezone(tz);

    const paq = await prisma.paqueteDePrecarga.findUnique({
        where: { usuarioId: yo.id },
        select: { armadoEn: true },
    }).catch(() => null);

    const diaArmado = paq?.armadoEn ? todayInTimezone(tz, paq.armadoEn) : null;
    const cambioDeDia = diaArmado !== null && diaArmado !== hoyActual;

    // Obtener paginas de cache si existe
    // Por `RedisCache` (la llave lleva el liceo, MEZCLA-*) y por menú: si el
    // liceo activa Pagos, las páginas ya no son las mismas.
    const llavePaginas = `precarga:paginas:${yo.id}:${huella(JSON.stringify(menu ?? null))}`;
    const guardarPaginas = (p: string[]) => void RedisCache.set(llavePaginas, p, 30 * 86400);
    const paginasCache = (await RedisCache.get<string[]>(llavePaginas)) ?? undefined;

    if (marca <= desde) {
        if (!cambioDeDia && paginasCache) {
            return { marca, todo: false, lecturas: [], paginas: paginasCache };
        }
        const pantallas = await lasPantallasDe(prisma, yo, menu);
        const plan = elPlanDeLasPantallas(pantallas, yo.role);
        guardarPaginas(plan.paginas);
        const lecturas = cambioDeDia ? plan.lecturas.filter((l) => l.includes(hoyActual)) : [];
        return { marca, todo: false, lecturas, paginas: plan.paginas };
    }

    // Ya se tiraron cambios que este teléfono no vio: no se sabe qué fue.
    if (minimo !== null && desde < minimo - 1) {
        const pantallas = await lasPantallasDe(prisma, yo, menu);
        const plan = elPlanDeLasPantallas(pantallas, yo.role);
        return { marca, todo: true, lecturas: [], paginas: plan.paginas };
    }

    const filas: Array<{ ids: string[]; destinatarios: string[]; todos: boolean }> = await prisma.cambioDelLiceo.findMany({
        where: { id: { gt: desde } },
        select: { ids: true, destinatarios: true, todos: true },
        orderBy: { id: 'asc' },
        take: TOPE_DE_CAMBIOS + 1,
    });
    if (filas.length > TOPE_DE_CAMBIOS) {
        const pantallas = await lasPantallasDe(prisma, yo, menu);
        const plan = elPlanDeLasPantallas(pantallas, yo.role);
        return { marca, todo: true, lecturas: [], paginas: plan.paginas };
    }

    const suyas = filas.filter((f) => f.todos || f.destinatarios.includes(yo.id));
    if (suyas.length === 0) {
        if (!cambioDeDia && paginasCache) {
            return { marca, todo: false, lecturas: [], paginas: paginasCache };
        }
        const pantallas = await lasPantallasDe(prisma, yo, menu);
        const plan = elPlanDeLasPantallas(pantallas, yo.role);
        guardarPaginas(plan.paginas);
        const lecturas = cambioDeDia ? plan.lecturas.filter((l) => l.includes(hoyActual)) : [];
        return { marca, todo: false, lecturas, paginas: plan.paginas };
    }

    const pantallas = await lasPantallasDe(prisma, yo, menu);
    const plan = elPlanDeLasPantallas(pantallas, yo.role);
    guardarPaginas(plan.paginas);
    const idsQueCambiaron = new Set(suyas.flatMap((f) => f.ids));
    const comun = pantallas[0]?.ctx ?? {};
    const deTodos = new Set<string>(
        ['anio', 'ciclo', 'hoy', 'lunes', 'viernes', 'domingo'].map((k) => comun[k]).filter((v): v is string => typeof v === 'string')
    );
    for (const l of Array.isArray(comun.lapsos) ? comun.lapsos : []) deTodos.add(l);

    const lecturas = plan.lecturas.filter((l) => {
        if (cambioDeDia && l.includes(hoyActual)) return true;
        const ids = losIdsDe(l, deTodos);
        return ids.length === 0 || ids.some((id) => idsQueCambiaron.has(id));
    });
    return { marca, todo: false, lecturas, paginas: plan.paginas };
}

/** El último cambio apuntado (para que el plan diga desde cuándo está al día). */
export async function laUltimaMarca(prisma: any): Promise<number> {
    const r = await prisma.cambioDelLiceo.aggregate({ _max: { id: true } }).catch(() => null);
    return r?._max?.id ?? 0;
}
