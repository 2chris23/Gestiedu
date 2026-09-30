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
 * Una operación sobre un cajón. Si no se puede (sin IndexedDB, error), `null`:
 * lo guardado es una ayuda, nunca rompe la pantalla.
 */
export function conElCajon<T>(
    cajon: string,
    modo: IDBTransactionMode,
    trabajo: (almacen: IDBObjectStore) => IDBRequest | void
): Promise<T | null> {
    return abrirLaBase().then(
        (bd) =>
            new Promise<T | null>((resolver) => {
                if (!bd) return resolver(null);
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
                        resolver(null);
                    };
                    transaccion.onabort = () => {
                        bd.close();
                        resolver(null);
                    };
                } catch {
                    bd.close();
                    resolver(null);
                }
            })
    );
}
