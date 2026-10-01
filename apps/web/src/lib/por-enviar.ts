/**
 * LO HECHO SIN CONEXIÓN, ESPERANDO PARA SUBIR (como un mensaje de WhatsApp)
 *
 * Cristian (2026-09-30): «en Venezuela se va mucho la luz… es bueno que pueda
 * usarlo y dejarlo como pendiente hasta que se reestablezca la conexión». El
 * profesor pasa lista y pone notas sin señal; queda aquí, en el teléfono, con
 * un relojito, y sube solo al volver (`EnviarLoPendiente`).
 *
 * ─── LAS REGLAS ─────────────────────────────────────────────────────────────
 *
 *  - **Es de quien lo hizo** (`dueno`: `<liceo>:<id>`) y solo se envía con SU
 *    sesión. No caduca: se queda hasta llegar o hasta que su dueño lo tire.
 *  - **Orden al subir** (lo pidió Cristian): primero el plan y los
 *    instrumentos, luego lo que se crea, luego lo que se cambia, y **lo que
 *    se borra, al final**. Dentro de cada grupo, en el orden en que se hizo.
 *  - **Cada cambio lleva lo que se vio** (`antes`, `notasVistas`): si al
 *    llegar otro lo cambió, el servidor no lo pisa, pregunta.
 *  - **Se junta lo repetido**: tres notas seguidas al mismo alumno son una
 *    (la última, con el `antes` de la primera); crear y borrar lo mismo sin
 *    conexión se anulan.
 */

import { CAJON_POR_ENVIAR, conElCajon } from './base-del-telefono';

/** 1 el plan y sus instrumentos · 2 crear · 3 cambiar · 4 borrar. */
export type Grupo = 1 | 2 | 3 | 4;

export type Tipo =
    | 'asistencia'
    | 'notas'
    | 'marcas'
    | 'crear-actividad'
    | 'editar-actividad'
    | 'borrar-actividad'
    | 'otra-forma'
    | 'plan'
    | 'instrumento'
    | 'observacion'
    | 'citacion'
    | 'config'
    | 'evento'
    | 'otro';

export type Estado = 'pendiente' | 'hay-que-decidir' | 'en-espera' | 'rechazado';

export interface CambioPendiente {
    /** Su número (`X-Cambio`): el servidor no lo aplica dos veces. */
    id: string;
    dueno: string;
    /** Su nombre, para avisar si entra otra persona en este teléfono. */
    quien?: string;
    /** Nombres de los alumnos que toca (no se envían): para preguntar «¿cuál queda?». */
    nombres?: Record<string, string>;
    tipo: Tipo;
    grupo: Grupo;
    metodo: 'post' | 'put' | 'patch' | 'delete';
    url: string;
    params?: Record<string, string>;
    datos?: any;
    /** De qué es: para enseñarlo en su pantalla y para juntar lo repetido. */
    objeto: string;
    /** «Notas de Taller 2 · 3 alumnos»: lo que se lee en la lista. */
    resumen: string;
    /** Cuándo se hizo, en el teléfono (ISO). */
    hechoEn: string;
    orden: number;
    estado: Estado;
    intentos: number;
    /** Por qué no subió (rechazado), o qué espera (en-espera). */
    motivo?: string;
    /** Lo que contestó el servidor al chocar (qué había, qué hay, quién). */
    choque?: any;
    /** No antes de esto (ms): tras un fallo de red, se espera cada vez más. */
    noAntesDe?: number;
}

export type NuevoCambio = Omit<CambioPendiente, 'id' | 'dueno' | 'hechoEn' | 'orden' | 'estado' | 'intentos'> & { id?: string };

// ─── Las cuentas (puras) ────────────────────────────────────────────────────

/** El orden de subida: grupo (lo que borra, al final) y, dentro, como se hizo. */
export function ordenar(lista: CambioPendiente[]): CambioPendiente[] {
    return [...lista].sort((a, b) => a.grupo - b.grupo || a.orden - b.orden);
}

const mezclarAntes = (viejo: Record<string, unknown> | undefined, nuevo: Record<string, unknown> | undefined) =>
    viejo || nuevo ? { ...(nuevo ?? {}), ...(viejo ?? {}) } : undefined;

/**
 * Mete un cambio en la cola juntándolo con lo que ya espera del mismo objeto.
 * Devuelve la cola nueva. Solo se junta lo que sigue `pendiente` (lo que está
 * por decidir no se toca: la persona está mirándolo).
 */
export function juntar(cola: CambioPendiente[], nuevo: CambioPendiente): CambioPendiente[] {
    const iguales = (c: CambioPendiente) => c.estado === 'pendiente' && c.objeto === nuevo.objeto && c.tipo === nuevo.tipo && c.dueno === nuevo.dueno;

    // Borrar lo que se creó sin conexión: no llegó a existir, se anulan los dos
    // (y todo lo que se le hizo entretanto).
    if (nuevo.tipo === 'borrar-actividad') {
        const creada = cola.find((c) => c.tipo === 'crear-actividad' && c.objeto === nuevo.objeto && c.estado === 'pendiente' && c.dueno === nuevo.dueno);
        if (creada) return cola.filter((c) => !(c.objeto === nuevo.objeto && c.dueno === nuevo.dueno && c.estado === 'pendiente'));
    }

    const previo = cola.find(iguales);
    if (!previo) return [...cola, nuevo];

    let datos = nuevo.datos;
    if (nuevo.tipo === 'notas') {
        datos = {
            ...nuevo.datos,
            scores: { ...(previo.datos?.scores ?? {}), ...(nuevo.datos?.scores ?? {}) },
            antes: mezclarAntes(previo.datos?.antes, nuevo.datos?.antes),
        };
    } else if (nuevo.tipo === 'marcas') {
        datos = {
            ...nuevo.datos,
            marcas: { ...(previo.datos?.marcas ?? {}), ...(nuevo.datos?.marcas ?? {}) },
            antes: mezclarAntes(previo.datos?.antes, nuevo.datos?.antes),
        };
    } else if (nuevo.tipo === 'asistencia') {
        const porAlumno = new Map<string, any>();
        for (const a of previo.datos?.attendances ?? []) porAlumno.set(a.studentId, a);
        for (const a of nuevo.datos?.attendances ?? []) {
            const antes = porAlumno.get(a.studentId);
            // «Solo si no hay» no pisa lo tocado a mano antes.
            if (a.soloSiNoHay && antes && !antes.soloSiNoHay) continue;
            porAlumno.set(a.studentId, antes && 'antes' in antes ? { ...a, antes: antes.antes } : a);
        }
        datos = { ...previo.datos, ...nuevo.datos, attendances: [...porAlumno.values()] };
    } else if (nuevo.tipo === 'config') {
        datos = juntarConfig(previo.datos, nuevo.datos);
    }
    // Lo demás (editar, el plan, una observación): vale lo último.
    const unido: CambioPendiente = { ...previo, datos, resumen: nuevo.resumen, hechoEn: nuevo.hechoEn };
    return cola.map((c) => (c === previo ? unido : c));
}

/**
 * Dos cambios de la configuración sin conexión: se suman, campo a campo, y de
 * cada campo se queda lo PRIMERO que se vio (`__visto`) con lo último puesto.
 */
function juntarConfig(viejo: any, nuevo: any) {
    const cfg = (a: any, b: any) => {
        if (!a && !b) return undefined;
        const junto = { ...(a ?? {}), ...(b ?? {}) };
        if (a?.documentos || b?.documentos) junto.documentos = { ...(a?.documentos ?? {}), ...(b?.documentos ?? {}) };
        return junto;
    };
    const visto = new Map<string, { campo: string; antes: unknown; nuevo: unknown }>();
    for (const v of viejo?.__visto ?? []) visto.set(v.campo, v);
    for (const v of nuevo?.__visto ?? []) {
        const antes = visto.get(v.campo);
        visto.set(v.campo, antes ? { ...v, antes: antes.antes } : v);
    }
    const junto = { ...(viejo ?? {}), ...(nuevo ?? {}), __visto: [...visto.values()] };
    const configuration = cfg(viejo?.configuration, nuevo?.configuration);
    if (configuration) junto.configuration = configuration;
    return junto;
}

/** «hace un rato»: cuánto esperar tras `intentos` fallos de red (hasta 5 min). */
export function esperaTras(intentos: number): number {
    return Math.min(5 * 60_000, 5_000 * 2 ** Math.max(0, intentos - 1));
}

// ─── El cajón del teléfono ──────────────────────────────────────────────────

let enMemoria: CambioPendiente[] | null = null;
const oyentes = new Set<() => void>();

function avisarOyentes() {
    for (const o of oyentes) o();
}

/** Para `useSyncExternalStore`: se avisa cada vez que la cola cambia. */
export function alCambiarLaCola(oyente: () => void): () => void {
    oyentes.add(oyente);
    return () => oyentes.delete(oyente);
}

const VACIA: CambioPendiente[] = [];

/** Siempre la MISMA lista mientras no cambie: `useSyncExternalStore` lo exige (si no, bucle sin fin). */
export function laColaEnMemoria(): CambioPendiente[] {
    return enMemoria ?? VACIA;
}

async function leerTodo(): Promise<CambioPendiente[]> {
    const todo = await conElCajon<CambioPendiente[]>(CAJON_POR_ENVIAR, 'readonly', (c) => c.getAll());
    return todo ?? [];
}

async function escribirTodo(antes: CambioPendiente[], despues: CambioPendiente[]) {
    const quedan = new Set(despues.map((c) => c.id));
    await conElCajon(CAJON_POR_ENVIAR, 'readwrite', (c) => {
        for (const v of antes) if (!quedan.has(v.id)) c.delete(v.id);
        for (const n of despues) c.put(n);
    });
}

/** La cola de este dueño, en orden de subida. */
export async function laCola(dueno: string | null): Promise<CambioPendiente[]> {
    if (!dueno) return [];
    const todo = await leerTodo();
    const mia = ordenar(todo.filter((c) => c.dueno === dueno));
    enMemoria = mia;
    avisarOyentes();
    return mia;
}

let ultimoOrden = 0;
const nuevoId = () =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;

/** Mete un cambio en la cola (juntándolo con lo que espera). Devuelve su número. */
export async function encolar(dueno: string, cambio: NuevoCambio): Promise<string> {
    const todo = await leerTodo();
    const completo: CambioPendiente = {
        ...cambio,
        id: cambio.id ?? nuevoId(),
        dueno,
        hechoEn: new Date().toISOString(),
        orden: Math.max(Date.now(), ++ultimoOrden),
        estado: 'pendiente',
        intentos: 0,
    };
    ultimoOrden = completo.orden;
    const despues = juntar(todo, completo);
    await escribirTodo(todo, despues);
    await laCola(dueno);
    return completo.id;
}

export async function actualizarCambio(id: string, cambios: Partial<CambioPendiente>): Promise<void> {
    const todo = await leerTodo();
    const uno = todo.find((c) => c.id === id);
    if (!uno) return;
    await conElCajon(CAJON_POR_ENVIAR, 'readwrite', (c) => c.put({ ...uno, ...cambios }));
    await laCola(uno.dueno);
}

/** Ya llegó (o su dueño lo tiró): fuera de la cola. */
export async function quitarCambio(id: string): Promise<void> {
    const todo = await leerTodo();
    const uno = todo.find((c) => c.id === id);
    await conElCajon(CAJON_POR_ENVIAR, 'readwrite', (c) => c.delete(id));
    if (uno) await laCola(uno.dueno);
}

/** Cuántos cambios de OTRO dueño hay en este teléfono (para avisar al entrar). */
export async function pendientesDeOtros(dueno: string | null): Promise<CambioPendiente[]> {
    const todo = await leerTodo();
    return todo.filter((c) => c.dueno !== dueno);
}

/** Tirar los de un dueño (cerrar sesión sin conexión, o «entrar igual»). */
export async function tirarLosDe(dueno: string): Promise<void> {
    const todo = await leerTodo();
    await escribirTodo(todo, todo.filter((c) => c.dueno !== dueno));
    enMemoria = (enMemoria ?? []).filter((c) => c.dueno !== dueno);
    avisarOyentes();
}

// ─── Desde las pantallas ────────────────────────────────────────────────────

/** El aviso de que algo entró en la cola: `EnviarLoPendiente` lo intenta ya. */
export const EVENTO_ENCOLADO = 'gestiedu:encolado';

/**
 * Lo usan las pantallas cuando guardar falló por falta de conexión: lo deja en
 * la cola, a nombre de quien tiene la sesión, y avisa para que se intente
 * enviar en cuanto se pueda. Sin sesión (sin dueño) no se guarda nada.
 */
export async function dejarPendiente(cambio: NuevoCambio): Promise<string | null> {
    const { elDuenoDeAhora, elNombreDeAhora } = await import('./el-dueno');
    const dueno = elDuenoDeAhora();
    if (!dueno) return null;
    const id = await encolar(dueno, { ...cambio, quien: elNombreDeAhora() } as NuevoCambio);
    if (typeof document !== 'undefined') document.dispatchEvent(new Event(EVENTO_ENCOLADO));
    return id;
}

/**
 * Intenta hacerlo ya; si no hay conexión, lo deja pendiente y devuelve
 * `{ pendiente: true }`. Cualquier otro error sigue siendo un error.
 */
export async function hacerODejarPendiente<T>(hacer: () => Promise<T>, cambio: NuevoCambio): Promise<T | { pendiente: true }> {
    try {
        return await hacer();
    } catch (e) {
        const { esQueNoContesta } = await import('./estado-del-servidor');
        if (!esQueNoContesta(e)) throw e;
        await dejarPendiente(cambio);
        return { pendiente: true };
    }
}

export const esPendiente = (r: unknown): r is { pendiente: true } => Boolean(r && typeof r === 'object' && (r as any).pendiente === true);
