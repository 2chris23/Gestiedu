import api from '@/lib/axios';
import { esLaApp } from '@/lib/el-candado';
import { conAzar } from '@/lib/azar';
import { ESTADO_GUARDADO, guardarRespuestas } from '@/lib/respuestas-guardadas';
import { guardarEstasPaginasYEsperar, mirarLaVersionDeLaAppYEsperar } from '@/lib/paginas-guardadas';

/**
 * LA PRECARGA: SIN CONEXIÓN, TODO — EN UN PAQUETE (octubre 2026)
 *
 * La primera vez que alguien entra en un teléfono, se baja TODO lo suyo para
 * usar la app sin conexión, como WhatsApp al restaurar sus archivos de la
 * nube. Solo esa vez se enseña (el libro, con los MB); después se pone al
 * día sola, de fondo.
 *
 * Antes se abría cada pantalla en un marco invisible: 1,6 h el admin y sin
 * saber cuánto faltaba. Ahora el servidor dice qué bajar
 * (`POST /precarga/plan`: las lecturas de cada pantalla de esa persona,
 * grabadas en molde) y lo entrega por bloques (`POST /precarga/bloque`). Cada
 * lectura queda en el teléfono con la misma llave que usaría la pantalla
 * (`respuestas-guardadas.ts`), así que sin conexión `api` la encuentra.
 *
 * Las páginas: una por tipo de pantalla. El ayudante (`sw.js`, `laPlantilla`)
 * sirve la de una ficha para todas las demás con el trozo de la dirección
 * cambiado (PLANTILLA-01).
 *
 * Si se va la conexión, ESPERA (no deja seguir: lo pidió Cristian) y sigue
 * sola donde quedó al volver.
 */

export type Fase = 'empezando' | 'bajando' | 'paginas' | 'esperando' | 'listo';

export interface Avance {
    fase: Fase;
    /** Lo recibido, en bytes (lo que ocupa en el teléfono). */
    bytes: number;
    /** Lo que se calcula que ocupará todo; se corrige con cada bloque. */
    bytesTotales: number | null;
    bloquesHechos: number;
    bloques: number;
    /**
     * El avance de verdad (el % y la barra): lecturas hechas de las del plan.
     * Se sabe exacto desde el principio; los MB, no.
     */
    lecturasHechas: number;
    lecturasTotales: number;
    /** Lo que de verdad pasó por internet (va comprimido: unas 15-30 veces menos). 0 si no se sabe. */
    bytesPorLaRed: number;
    /** A qué ritmo se está bajando (bytes de lo guardado por segundo), en los últimos segundos. */
    velocidad: number | null;
}

interface Plan {
    version: string;
    /** El último cambio apuntado en el liceo cuando se hizo el plan (ver `ponerseAlDia`). */
    marca: number;
    paginas: string[];
    lecturas: string[];
    porBloque: number;
    /** Lo que pesará cada bloque según lo aprendido en el servidor (null si aún no sabe). */
    estimadoPorBloque?: number[] | null;
}

// ── Lo ya hecho, para reanudar ─────────────────────────────────────────────

const LLAVE = 'gestiedu:precarga';

interface Hecho {
    dueno: string;
    /** La versión del plan en la que van los bloques hechos. */
    version: string;
    hechos: number[];
    bytes: number;
    completa: boolean;
    cuando: number;
}

function leerHecho(dueno: string): Hecho {
    try {
        const h = JSON.parse(localStorage.getItem(LLAVE) || 'null') as Hecho | null;
        if (h && h.dueno === dueno) return { ...h, hechos: Array.isArray(h.hechos) ? h.hechos : [] };
    } catch {
        /* nada */
    }
    return { dueno, version: '', hechos: [], bytes: 0, completa: false, cuando: 0 };
}

function escribirHecho(h: Hecho) {
    try {
        localStorage.setItem(LLAVE, JSON.stringify(h));
    } catch {
        /* teléfono lleno: la próxima vez sigue donde pueda, no se pierde nada */
    }
}

/** ¿Ya bajó todo esta persona en este teléfono? (la pantalla de carga sale solo la primera vez). */
export function estaCompleta(dueno: string): boolean {
    return leerHecho(dueno).completa;
}

/** ¿Hace cuánto se completó la última pasada? */
export function cuandoSeCompleto(dueno: string): number {
    const h = leerHecho(dueno);
    return h.completa ? h.cuando : 0;
}

// ── Desde qué cambio está al día este teléfono ─────────────────────────────

const LLAVE_MARCA = 'gestiedu:cambios-desde';

function laMarca(dueno: string): number | null {
    try {
        const m = JSON.parse(localStorage.getItem(LLAVE_MARCA) || 'null') as { dueno: string; desde: number } | null;
        return m && m.dueno === dueno && Number.isFinite(m.desde) ? m.desde : null;
    } catch {
        return null;
    }
}

function apuntarLaMarca(dueno: string, desde: number) {
    try {
        localStorage.setItem(LLAVE_MARCA, JSON.stringify({ dueno, desde }));
    } catch {
        /* nada: la próxima vez se pregunta desde antes */
    }
}

/** Al cerrar sesión. */
export function olvidarLaPrecarga(): void {
    try {
        localStorage.removeItem(LLAVE);
        localStorage.removeItem(LLAVE_MARCA);
    } catch {
        /* nada */
    }
}

/** ¿Hace falta enseñar la precarga? Solo en la app (o donde se pida para las pruebas). */
export function seEnsenaLaPrecarga(): boolean {
    if (esLaApp()) return true;
    try {
        if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
        return localStorage.getItem('gestiedu:precarga-en-el-navegador') === '1';
    } catch {
        return false;
    }
}

// ── Bajar ──────────────────────────────────────────────────────────────────

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Lo que pesa una lectura cuando aún no se sabe (se corrige con el primer bloque). */
const BYTES_POR_LECTURA_AL_EMPEZAR = 4_000;

/** ¿El fallo es «no hay conexión / el servidor no contesta» (se espera) o de verdad? */
function esDeEsperar(e: unknown): boolean {
    const r = (e as { response?: { status?: number } })?.response;
    if (!r) return true;
    return r.status === 429 || (r.status ?? 0) >= 500;
}

/**
 * Lo que el servidor no dio: 5xx o 429 se reintenta; un 4xx (no es tuyo, no
 * existe) se guarda TAMBIÉN, como respuesta: sin conexión, `api` contesta
 * el mismo «no» que con conexión y la pantalla hace lo de siempre (el
 * profesor no ve los promedios de una sección que no guía), en vez de decir
 * que algo no se descargó.
 */
async function apuntarLosFallos(dueno: string, fallos: Record<string, number> | undefined, otraVez: string[]) {
    const negadas: Array<[string, unknown]> = [];
    for (const [clave, codigo] of Object.entries(fallos ?? {})) {
        if (codigo === 429 || codigo >= 500) otraVez.push(clave);
        else if (codigo >= 400) negadas.push([clave, { [ESTADO_GUARDADO]: codigo }]);
    }
    await guardarRespuestas(dueno, negadas);
}

/**
 * Bloques a la vez. El servidor tarda más en preparar un bloque (~1 s) que la
 * red en traerlo (va comprimido: 1,1 MB son ~35 KB); de uno en uno, el
 * teléfono pasaba la mayor parte del tiempo esperando.
 */
const BLOQUES_A_LA_VEZ = 3;

export interface Opciones {
    dueno: string;
    menu: string[];
    alAvanzar?: (a: Avance) => void;
    hayConexion: () => boolean;
    cancelada: () => boolean;
}

/**
 * Baja lo que falte. No se rinde sin conexión: espera y sigue. Acaba en
 * `listo`, o en `cancelada` (se cerró la sesión o la pantalla).
 */
export async function bajarTodo(o: Opciones): Promise<'listo' | 'cancelada'> {
    const red = midiendoLaRed();
    try {
        return await bajarTodoMidiendo(o, red);
    } finally {
        red.parar();
    }
}

/**
 * CUÁNTO PASA DE VERDAD POR INTERNET
 *
 * Lo que se guarda en el teléfono (los «MB» de la descarga) viaja comprimido:
 * 34 MB del admin son unos 2 MB de datos. El navegador lo dice por cada
 * respuesta (`encodedBodySize`); se suma lo de la precarga. Si no lo dice
 * (otro origen sin `Timing-Allow-Origin`), queda en 0 y no se enseña.
 */
function midiendoLaRed(): { bytes: () => number; parar: () => void } {
    let bytes = 0;
    let observador: PerformanceObserver | null = null;
    try {
        observador = new PerformanceObserver((lista) => {
            for (const e of lista.getEntries() as PerformanceResourceTiming[]) {
                if (e.name.includes('/precarga/')) bytes += e.encodedBodySize || 0;
            }
        });
        observador.observe({ type: 'resource', buffered: false });
    } catch {
        observador = null;
    }
    return { bytes: () => bytes, parar: () => observador?.disconnect() };
}

async function bajarTodoMidiendo(o: Opciones, red: { bytes: () => number }): Promise<'listo' | 'cancelada'> {
    const avisar = (a: Avance) => o.alAvanzar?.(a);
    const hecho = leerHecho(o.dueno);
    let intento = 0;

    /** Repite `paso` hasta que salga, esperando a la conexión entre medias. */
    async function hastaQueSalga<T>(paso: () => Promise<T>, avance: () => Avance): Promise<T | 'cancelada'> {
        for (;;) {
            if (o.cancelada()) return 'cancelada';
            if (o.hayConexion()) {
                try {
                    const r = await paso();
                    intento = 0;
                    return r;
                } catch (e) {
                    if (!esDeEsperar(e)) throw e;
                }
            }
            avisar({ ...avance(), fase: 'esperando' });
            intento = Math.min(intento + 1, 6);
            await esperar(conAzar(Math.min(30_000, 1500 * 2 ** intento)));
        }
    }

    const vacio: Avance = {
        fase: 'empezando',
        bytes: hecho.bytes,
        bytesTotales: null,
        bloquesHechos: 0,
        bloques: 0,
        lecturasHechas: 0,
        lecturasTotales: 0,
        bytesPorLaRed: 0,
        velocidad: null,
    };
    avisar(vacio);
    // La cáscara de la app (en la APK ya va dentro; en el navegador, se baja).
    // Se pide ya y se espera al final: sin ella entera, sin conexión algunas
    // partes de la app no abrirían.
    const laCascara = mirarLaVersionDeLaAppYEsperar();

    const plan = await hastaQueSalga(async () => (await api.post('/precarga/plan', { menu: o.menu })).data as Plan, () => vacio);
    if (plan === 'cancelada') return 'cancelada';

    // Otra versión del plan: los bloques ya no son los mismos. Lo ya guardado
    // sigue en el teléfono; se vuelve a contar desde el principio.
    if (hecho.version !== plan.version) {
        hecho.version = plan.version;
        hecho.hechos = [];
        hecho.bytes = 0;
        escribirHecho(hecho);
    }

    const porBloque = Math.max(1, plan.porBloque || 150);
    const bloques: string[][] = [];
    for (let i = 0; i < plan.lecturas.length; i += porBloque) bloques.push(plan.lecturas.slice(i, i + porBloque));
    const hechos = new Set(hecho.hechos);
    let lecturasBajadas = 0;
    let bytesDeLoBajado = 0;
    // Lo que el servidor calcula que pesará cada bloque (lo aprendió de otras
    // descargas de este liceo). Sin eso, la media de lo que se lleva.
    const estimados =
        Array.isArray(plan.estimadoPorBloque) && plan.estimadoPorBloque.length === bloques.length ? plan.estimadoPorBloque : null;

    /**
     * EL TOTAL QUE SE ENSEÑA: lo bajado + lo que se calcula que falta.
     *
     * Antes era «media de lo bajado × lo que falta», y como lo primero era lo
     * más grande, el total empezaba en 104,9 MB y acababa en 33,2 (lo vio el
     * amigo de Cristian). Ahora las lecturas van barajadas (cada bloque se
     * parece a todos) y, si el servidor ya sabe cuánto pesa cada tipo de
     * lectura en este liceo, lo dice por bloque; lo que se desvíe se corrige
     * con lo que va llegando. El % y la barra van por lecturas: exactos.
     */
    const avanceAhora = (fase: Fase = 'bajando'): Avance => {
        let lecturasHechas = 0;
        let porEstimar = 0;
        let estimadoQueFalta = 0;
        let estimadoDeLoHecho = 0;
        bloques.forEach((b, i) => {
            if (hechos.has(i)) {
                lecturasHechas += b.length;
                if (estimados) estimadoDeLoHecho += estimados[i];
            } else if (estimados) estimadoQueFalta += estimados[i];
            else porEstimar += b.length;
        });
        // Si lo de verdad pesa distinto de lo aprendido, se corrige (con
        // calma: solo con unos cuantos bloques hechos, y como mucho ×2).
        const correccion =
            estimados && hechos.size >= 3 && estimadoDeLoHecho > 0 ? Math.min(2, Math.max(0.5, hecho.bytes / estimadoDeLoHecho)) : 1;
        const porLectura = lecturasBajadas ? bytesDeLoBajado / lecturasBajadas : BYTES_POR_LECTURA_AL_EMPEZAR;
        return {
            fase,
            bytes: hecho.bytes,
            bytesTotales: Math.max(hecho.bytes, Math.round(hecho.bytes + estimadoQueFalta * correccion + porEstimar * porLectura)),
            bloquesHechos: hechos.size,
            bloques: bloques.length,
            lecturasHechas,
            lecturasTotales: plan.lecturas.length,
            bytesPorLaRed: red.bytes(),
            velocidad: elRitmo(),
        };
    };

    // El ritmo: lo guardado en los últimos ~5 s (con la media de toda la
    // descarga mientras no haya bastante).
    const muestras: Array<[number, number]> = [];
    const empezo = performance.now();
    const apuntarRitmo = () => {
        const ahora = performance.now();
        muestras.push([ahora, bytesDeLoBajado]);
        while (muestras.length > 2 && ahora - muestras[0][0] > 5000) muestras.shift();
    };
    const elRitmo = (): number | null => {
        const segundos = (performance.now() - empezo) / 1000;
        if (bytesDeLoBajado === 0 || segundos < 1) return null;
        if (muestras.length >= 2) {
            const [t0, b0] = muestras[0];
            const [t1, b1] = muestras[muestras.length - 1];
            if (t1 - t0 >= 1500) return ((b1 - b0) * 1000) / (t1 - t0);
        }
        return bytesDeLoBajado / segundos;
    };
    avisar(avanceAhora());

    // Lo que el servidor no pudo dar en el momento (estaba ocupado): al final, otra vez.
    const otraVez: string[] = [];

    const porBajar = bloques.map((_, i) => i).filter((i) => !hechos.has(i));
    let seCancelo = false;
    const trabajador = async () => {
        while (!seCancelo && porBajar.length) {
            const i = porBajar.shift()!;
            const r = await hastaQueSalga(
                async () => (await api.post('/precarga/bloque', { lecturas: bloques[i] })).data as { datos: Record<string, unknown>; fallos: Record<string, number> },
                () => avanceAhora()
            );
            if (r === 'cancelada') {
                seCancelo = true;
                return;
            }
            const bytes = await guardarRespuestas(o.dueno, Object.entries(r.datos ?? {}));
            await apuntarLosFallos(o.dueno, r.fallos, otraVez);
            lecturasBajadas += bloques[i].length;
            bytesDeLoBajado += bytes;
            apuntarRitmo();
            hecho.bytes += bytes;
            hechos.add(i);
            hecho.hechos = [...hechos];
            escribirHecho(hecho);
            avisar(avanceAhora());
        }
    };
    await Promise.all(Array.from({ length: Math.min(BLOQUES_A_LA_VEZ, porBajar.length) }, trabajador));
    if (seCancelo) return 'cancelada';

    // TODAS, de bloque en bloque, hasta cinco vueltas y cada vez con más calma:
    // con el servidor cargado, a veces una sección entera quedaba fuera (solo
    // se reintentaban las 200 primeras, una vez).
    for (let vuelta = 1; otraVez.length && vuelta <= 5; vuelta++) {
        await esperar(conAzar(1500 * vuelta));
        const pendientes = otraVez.splice(0, otraVez.length);
        for (let i = 0; i < pendientes.length; i += porBloque) {
            const r = await hastaQueSalga(
                async () =>
                    (await api.post('/precarga/bloque', { lecturas: pendientes.slice(i, i + porBloque) })).data as {
                        datos: Record<string, unknown>;
                        fallos: Record<string, number>;
                    },
                () => avanceAhora()
            );
            if (r === 'cancelada') return 'cancelada';
            await guardarRespuestas(o.dueno, Object.entries(r.datos ?? {}));
            await apuntarLosFallos(o.dueno, r.fallos, otraVez);
        }
    }

    // Las páginas (una por tipo de pantalla), que guarda el ayudante.
    avisar(avanceAhora('paginas'));
    await guardarEstasPaginasYEsperar(plan.paginas);
    await laCascara;

    hecho.completa = true;
    hecho.cuando = Date.now();
    escribirHecho(hecho);
    // Lo que cambie desde que se hizo el plan, lo trae `ponerseAlDia`.
    if (Number.isFinite(plan.marca)) apuntarLaMarca(o.dueno, plan.marca);
    avisar(avanceAhora('listo'));
    return 'listo';
}

/**
 * DESPUÉS DE LA PRIMERA VEZ: SOLO LO QUE CAMBIÓ (como WhatsApp)
 *
 * El servidor apunta cada cambio del liceo (`cambios_del_liceo`). El teléfono
 * pregunta «¿qué cambió desde el último que vi?» y el servidor contesta qué
 * lecturas de su plan tocan esos cambios; solo esas se vuelven a bajar. Sin
 * cambios, una pregunta de pocos bytes. Si la marca es muy vieja (el servidor
 * ya tiró esos cambios) o no hay, toca la pasada entera (`todo`), de fondo.
 */
export async function ponerseAlDia(dueno: string, menu: string[], hayConexion: () => boolean): Promise<'al-dia' | 'todo' | 'sin-conexion'> {
    const desde = laMarca(dueno);
    if (desde === null) return 'todo';
    try {
        const { data } = await api.post('/precarga/cambios', { desde, menu });
        const r = data as { marca: number; lecturas: string[]; todo?: boolean; porBloque?: number };
        if (r.todo) return 'todo';
        const porBloque = Math.max(1, r.porBloque || 150);
        for (let i = 0; i < r.lecturas.length; i += porBloque) {
            if (!hayConexion()) return 'sin-conexion';
            const { data: b } = await api.post('/precarga/bloque', { lecturas: r.lecturas.slice(i, i + porBloque) });
            await guardarRespuestas(dueno, Object.entries((b?.datos ?? {}) as Record<string, unknown>));
            await apuntarLosFallos(dueno, b?.fallos, []);
        }
        apuntarLaMarca(dueno, r.marca);
        return 'al-dia';
    } catch {
        return 'sin-conexion';
    }
}

/** «12,4 MB», «850 KB». */
export function enMegas(bytes: number): string {
    if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1000))} KB`;
    return `${(bytes / 1_000_000).toLocaleString('es-VE', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} MB`;
}
