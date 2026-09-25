import { alertService, AlertSeverity } from '../services/alert.service';

/**
 * ENTERARSE ANTES DE QUE LLAME EL LICEO
 *
 * Un error 500 es algo que se rompió en el sistema, no algo que el usuario
 * hizo mal. Quedaba en el registro del servidor, que nadie lee: la primera
 * noticia era la llamada del liceo diciendo «no funciona».
 *
 * Ahora cada respuesta 500 se apunta por liceo y por ruta, y cada minuto se
 * convierte en UNA alerta por ruta que falló —con cuántas veces y el último
 * motivo— en el panel del superadmin. Una por minuto, no una por error: con
 * trescientas personas pulsando lo mismo, trescientas alertas no las lee nadie.
 */

interface Cuenta {
    liceo: string;
    ruta: string;
    veces: number;
    primera: string;
    ultima: string;
}

const pendientes = new Map<string, Cuenta>();
let temporizador: NodeJS.Timeout | null = null;

export function apuntarFallo(liceo: string | null | undefined, metodo: string, ruta: string): void {
    const quien = liceo || 'sin-liceo';
    const clave = `${quien}|${metodo} ${ruta}`;
    const ahora = new Date().toISOString();
    const c = pendientes.get(clave);
    if (c) {
        c.veces++;
        c.ultima = ahora;
    } else {
        pendientes.set(clave, { liceo: quien, ruta: `${metodo} ${ruta}`, veces: 1, primera: ahora, ultima: ahora });
    }
    if (!temporizador && process.env.NODE_ENV !== 'test') {
        temporizador = setTimeout(() => {
            temporizador = null;
            void volcarFallos();
        }, 60_000);
        temporizador.unref();
    }
}

/** Convierte lo apuntado en alertas. Devuelve cuántas creó. */
export async function volcarFallos(): Promise<number> {
    const lote = [...pendientes.values()];
    pendientes.clear();
    for (const c of lote) {
        await alertService.createAlert({
            type: 'SERVER_ERROR',
            severity: c.veces >= 10 ? AlertSeverity.CRITICAL : AlertSeverity.HIGH,
            message: `${c.veces} error(es) 500 en ${c.ruta} (liceo ${c.liceo})`,
            data: c,
        });
    }
    return lote.length;
}
