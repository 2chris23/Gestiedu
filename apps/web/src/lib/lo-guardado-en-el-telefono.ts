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
 *  1. **Aquí solo se guarda lo descargado.** Lo hecho sin conexión que espera
 *     para subir vive aparte, en `lib/por-enviar.ts`, y no caduca.
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

import { CAJON_DESCARGADO, conElCajon } from './base-del-telefono';

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

const conElAlmacen = <T,>(modo: IDBTransactionMode, trabajo: (almacen: IDBObjectStore) => IDBRequest) =>
    conElCajon<T>(CAJON_DESCARGADO, modo, trabajo);

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
