/**
 * LO ÚLTIMO QUE SE DESCARGÓ, GUARDADO EN EL TELÉFONO
 *
 * Sin señal, la app enseñaba una pantalla vacía o el error del navegador. Un
 * alumno en la parada del autobús no puede mirar a qué hora es su primera
 * clase; un profesor sin datos en el aula no puede ver la lista de su sección.
 * Ahora se guarda lo último que se descargó y eso es lo que se enseña mientras
 * no haya conexión.
 *
 * ─── LAS TRES REGLAS ────────────────────────────────────────────────────────
 *
 *  1. **Se mira, no se toca.** Guardar, corregir o borrar cualquier cosa sigue
 *     necesitando internet: eso se corta en `lib/axios.ts`, no aquí. Nada se
 *     queda «pendiente de enviar» a espaldas de nadie.
 *  2. **Lo guardado es de QUIEN lo descargó.** La llave lleva el liceo y la
 *     cédula: si entra otra persona, o la misma en otro liceo, lo de antes no
 *     se abre — se borra y se empieza de cero. Sin esto, un teléfono
 *     compartido enseñaría las notas del anterior.
 *  3. **Al cerrar sesión se borra.** Cerrar sesión es cerrar sesión.
 *
 * Se guarda en IndexedDB y no en `localStorage` por dos motivos: cabe mucho más
 * (localStorage son 5 MB para todo el sitio) y no bloquea la pantalla al
 * escribir, que con el horario de una sección entera se nota.
 *
 * Y caduca: `MAXIMO_DE_DIAS`. Un horario de hace tres semanas no es información,
 * es una trampa.
 */

const BASE = 'gestiedu';
const ALMACEN = 'lo-descargado';
const LLAVE = 'react-query';

/** Después de esto, lo guardado se tira: es más viejo que útil. */
export const MAXIMO_DE_DIAS = 7;

export interface LoGuardado {
    /** Quién lo descargó: `<liceo>:<cédula>`. */
    dueno: string;
    /** Cuándo se guardó (milisegundos). */
    cuando: number;
    /** El estado de React Query, tal cual lo deja `dehydrate`. */
    estado: unknown;
}

function abrir(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    return new Promise((resolver) => {
        let peticion: IDBOpenDBRequest;
        try {
            peticion = indexedDB.open(BASE, 1);
        } catch {
            // En una ventana privada, o con los datos del sitio bloqueados,
            // abrir la base lanza. No es un fallo: es que aquí no se guarda.
            return resolver(null);
        }
        peticion.onupgradeneeded = () => {
            const bd = peticion.result;
            if (!bd.objectStoreNames.contains(ALMACEN)) bd.createObjectStore(ALMACEN);
        };
        peticion.onsuccess = () => resolver(peticion.result);
        peticion.onerror = () => resolver(null);
        peticion.onblocked = () => resolver(null);
    });
}

function conElAlmacen<T>(modo: IDBTransactionMode, trabajo: (almacen: IDBObjectStore) => IDBRequest): Promise<T | null> {
    return abrir().then(
        (bd) =>
            new Promise<T | null>((resolver) => {
                if (!bd) return resolver(null);
                try {
                    const transaccion = bd.transaction(ALMACEN, modo);
                    const peticion = trabajo(transaccion.objectStore(ALMACEN));
                    peticion.onsuccess = () => resolver((peticion.result as T) ?? null);
                    peticion.onerror = () => resolver(null);
                    transaccion.oncomplete = () => bd.close();
                } catch {
                    resolver(null);
                }
            })
    );
}

/** `<liceo>:<cédula>`. Si falta cualquiera de los dos, no se guarda nada. */
export function deQuienEs(liceo: string | null | undefined, cedula: string | null | undefined): string | null {
    if (!liceo || !cedula) return null;
    return `${liceo}:${cedula}`;
}

export async function guardarLoDescargado(dueno: string, estado: unknown): Promise<void> {
    if (!dueno) return;
    const paquete: LoGuardado = { dueno, cuando: Date.now(), estado };
    await conElAlmacen('readwrite', (almacen) => almacen.put(paquete, LLAVE));
}

/**
 * Devuelve lo guardado **solo si es de esta misma persona y no ha caducado**.
 * En cualquier otro caso lo borra y devuelve `null`.
 */
export async function leerLoDescargado(dueno: string | null): Promise<LoGuardado | null> {
    if (!dueno) return null;
    const guardado = await conElAlmacen<LoGuardado>('readonly', (almacen) => almacen.get(LLAVE));
    if (!guardado) return null;

    const caducado = Date.now() - guardado.cuando > MAXIMO_DE_DIAS * 24 * 60 * 60 * 1000;
    if (guardado.dueno !== dueno || caducado) {
        await olvidarLoDescargado();
        return null;
    }
    return guardado;
}

export async function olvidarLoDescargado(): Promise<void> {
    await conElAlmacen('readwrite', (almacen) => almacen.delete(LLAVE));
}
