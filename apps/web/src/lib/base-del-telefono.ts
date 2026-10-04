/**
 * LA BASE DEL TELÉFONO (IndexedDB): UNA SOLA, CON TRES CAJONES
 *
 *  - `lo-descargado`: lo que React Query tenía en memoria (`MemoriaDelTelefono`).
 *  - `respuestas`: cada respuesta del servidor, por dirección, para que sin
 *    conexión cualquier pantalla tenga lo último (`respuestas-guardadas.ts`).
 *  - `por-enviar`: lo hecho sin conexión que espera para subir (`por-enviar.ts`).
 *
 * Se abre desde un solo sitio a propósito: si dos módulos abrieran la misma
 * base con versiones distintas, el que pidiera la vieja fallaría
 * (`VersionError`) y la app se quedaría sin nada guardado.
 *
 * Todo cajón lleva el DUEÑO (`<liceo>:<id>`) en lo que guarda: en un teléfono
 * prestado, lo de uno no se abre con la sesión de otro.
 */

export const BASE = 'gestiedu';
export const VERSION_DE_LA_BASE = 2;

export const CAJON_DESCARGADO = 'lo-descargado';
export const CAJON_RESPUESTAS = 'respuestas';
export const CAJON_POR_ENVIAR = 'por-enviar';

/** Sitio para lo que no se puede perder: se tira lo que se vuelve a bajar. */
export async function hacerSitio(): Promise<void> {
    await conElCajon(CAJON_RESPUESTAS, 'readwrite', (c) => c.clear());
    await conElCajon(CAJON_DESCARGADO, 'readwrite', (c) => c.clear());
}

/**
 * Que el navegador no borre lo guardado cuando le falte sitio (lo pide; en
 * Chrome con la app instalada suele darlo). Y cuánto queda, para avisar.
 */
export async function pedirQueNoSeBorre(): Promise<{ libre: number | null }> {
    try {
        const s = typeof navigator !== 'undefined' ? navigator.storage : undefined;
        if (!s) return { libre: null };
        if (s.persisted && !(await s.persisted())) await s.persist?.().catch(() => false);
        const e = await s.estimate?.();
        return { libre: e?.quota != null && e?.usage != null ? e.quota - e.usage : null };
    } catch {
        return { libre: null };
    }
}

export function abrirLaBase(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    return new Promise((resolver) => {
        let peticion: IDBOpenDBRequest;
        try {
            peticion = indexedDB.open(BASE, VERSION_DE_LA_BASE);
        } catch {
            // En una ventana privada, o con los datos del sitio bloqueados,
            // abrir la base lanza. No es un fallo: es que aquí no se guarda.
            return resolver(null);
        }
        peticion.onupgradeneeded = () => {
            const bd = peticion.result;
            if (!bd.objectStoreNames.contains(CAJON_DESCARGADO)) bd.createObjectStore(CAJON_DESCARGADO);
            if (!bd.objectStoreNames.contains(CAJON_RESPUESTAS)) {
                bd.createObjectStore(CAJON_RESPUESTAS).createIndex('cuando', 'cuando');
            }
            if (!bd.objectStoreNames.contains(CAJON_POR_ENVIAR)) {
                bd.createObjectStore(CAJON_POR_ENVIAR, { keyPath: 'id' }).createIndex('dueno', 'dueno');
            }
        };
        peticion.onsuccess = () => resolver(peticion.result);
        peticion.onerror = () => resolver(null);
        peticion.onblocked = () => resolver(null);
    });
}

/**
 * EL TELÉFONO LLENO (GUARDA-01, 2026-10-04)
 *
 * Un teléfono barato y lleno no deja escribir (`QuotaExceededError`). Para
 * lo descargado da igual —es una ayuda—, pero lo hecho SIN CONEXIÓN no se
 * puede perder callado: la pantalla diría «pendiente» y no habría nada.
 */
export class SinEspacio extends Error {
    constructor() {
        super('El teléfono no tiene espacio: no se pudo guardar sin conexión. Libera espacio o espera a tener conexión.');
        this.name = 'SinEspacio';
    }
}

const esFaltaDeEspacio = (e: unknown) => {
    const nombre = (e as { name?: string } | null)?.name;
    return nombre === 'QuotaExceededError' || nombre === 'NS_ERROR_DOM_QUOTA_REACHED';
};

/**
 * Una operación sobre un cajón. Si no se puede (sin IndexedDB, error), `null`:
 * lo guardado es una ayuda, nunca rompe la pantalla. Con `exigir` (lo que
 * espera para subir), un fallo es un error: `SinEspacio` si falta sitio.
 */
export function conElCajon<T>(
    cajon: string,
    modo: IDBTransactionMode,
    trabajo: (almacen: IDBObjectStore) => IDBRequest | void,
    { exigir = false }: { exigir?: boolean } = {}
): Promise<T | null> {
    return abrirLaBase().then(
        (bd) =>
            new Promise<T | null>((resolver, rechazar) => {
                const fallo = (e: unknown) => {
                    if (!exigir) return resolver(null);
                    rechazar(esFaltaDeEspacio(e) ? new SinEspacio() : e instanceof Error ? e : new Error('No se pudo guardar en el teléfono.'));
                };
                if (!bd) return fallo(null);
                try {
                    const transaccion = bd.transaction(cajon, modo);
                    const peticion = trabajo(transaccion.objectStore(cajon));
                    let resultado: T | null = null;
                    if (peticion) {
                        peticion.onsuccess = () => {
                            resultado = (peticion.result as T) ?? null;
                        };
                    }
                    transaccion.oncomplete = () => {
                        bd.close();
                        resolver(resultado);
                    };
                    transaccion.onerror = () => {
                        bd.close();
                        fallo(transaccion.error);
                    };
                    transaccion.onabort = () => {
                        bd.close();
                        fallo(transaccion.error);
                    };
                } catch (e) {
                    bd.close();
                    fallo(e);
                }
            })
    );
}
