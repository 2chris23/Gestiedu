import { useEffect, useSyncExternalStore } from 'react';

/**
 * UNA OFERTA CADA VEZ
 *
 * Al entrar, la app puede querer ofrecer tres cosas: bajar la APK, los
 * avisos al teléfono y el recorrido de la pantalla. Salían las tres a la vez,
 * dos de ellas metidas en la página: en el Inicio azul del admin partían la
 * cabecera y tapaban el nombre (lo vio Cristian en el navegador del teléfono).
 *
 * Ahora cada una pide su turno y sale solo la de más prioridad; al cerrarla,
 * la siguiente. Todas como una tarjeta flotante abajo (`TarjetaQueOfrece`).
 */
export type Oferta = 'descargar-la-app' | 'avisos' | 'recorrido';

const PRIORIDAD: Oferta[] = ['descargar-la-app', 'avisos', 'recorrido'];

const quieren = new Set<Oferta>();
const oyentes = new Set<() => void>();

const avisar = () => oyentes.forEach((o) => o());
const suscribir = (o: () => void) => {
    oyentes.add(o);
    return () => oyentes.delete(o);
};
const laDeTurno = (): Oferta | null => PRIORIDAD.find((o) => quieren.has(o)) ?? null;

/** ¿Le toca salir a esta oferta? `quiere`: si ahora mismo tiene algo que ofrecer. */
export function useTurnoDeOfrecer(oferta: Oferta, quiere: boolean): boolean {
    useEffect(() => {
        if (!quiere) return;
        quieren.add(oferta);
        avisar();
        return () => {
            quieren.delete(oferta);
            avisar();
        };
    }, [oferta, quiere]);
    const deTurno = useSyncExternalStore(suscribir, laDeTurno, () => null);
    return quiere && deTurno === oferta;
}
