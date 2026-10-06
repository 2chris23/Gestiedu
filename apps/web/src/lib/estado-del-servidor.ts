/**
 * ¿CONTESTA EL LICEO?
 *
 * `navigator.onLine` dice si el teléfono tiene red, no si el servidor del
 * liceo contesta. Y el caso que de verdad pasa es el segundo: el teléfono con
 * datos o con wifi, y el servidor apagado, reiniciándose o inalcanzable. Con
 * solo `navigator.onLine`, la app creía que había conexión, cada pantalla se
 * quedaba esperando una respuesta que no iba a llegar, al guardar salía un
 * error que no decía por qué, y si en ese momento tocaba renovar la sesión, la
 * app te sacaba al login.
 *
 * Aquí se lleva la cuenta de verdad: una petición que no llega (error de red,
 * tiempo agotado, o el repartidor diciendo que detrás no hay nadie: 502, 503,
 * 504) marca «sin servidor»; la primera que contesta, marca «con servidor».
 * Mientras no contesta, se le pregunta de vez en cuando con una petición
 * mínima, para enterarse en cuanto vuelva.
 */

type Oyente = () => void;

export interface EstadoDelServidor {
    /** El servidor contestó la última vez que se le preguntó. */
    contesta: boolean;
    /** Cuándo contestó por última vez (ms), si alguna vez lo hizo en este dispositivo. */
    ultimaRespuesta: number | null;
}

const CLAVE = 'gestiedu:ultima-respuesta-del-servidor';

function leerUltima(): number | null {
    try {
        const v = Number(localStorage.getItem(CLAVE));
        return Number.isFinite(v) && v > 0 ? v : null;
    } catch {
        return null;
    }
}

let estado: EstadoDelServidor = { contesta: true, ultimaRespuesta: null };
let iniciado = false;
const oyentes = new Set<Oyente>();
let ultimoGuardado = 0;

/** Ventana de tiempo (10 segundos) requerida sin fallos para volver a marcar que contesta. */
const VENTANA_SIN_FALLOS_MS = 10_000;
/** Respuestas exitosas seguidas necesarias tras un fallo para dar por recuperada la conexión. */
const EXITOS_NECESARIOS = 2;

let ultimoFallo = 0;
let exitosSeguidos = 0;
let temporizadorRebote: ReturnType<typeof setTimeout> | null = null;

function avisar() {
    oyentes.forEach((o) => o());
}

function iniciar() {
    if (iniciado || typeof window === 'undefined') return;
    iniciado = true;
    estado = { ...estado, ultimaRespuesta: leerUltima() };
}

export function elEstadoDelServidor(): EstadoDelServidor {
    iniciar();
    return estado;
}

export function escucharElServidor(oyente: Oyente): () => void {
    iniciar();
    oyentes.add(oyente);
    return () => oyentes.delete(oyente);
}

/**
 * Una respuesta del servidor, la que sea (también un 401 o un 404: contestó).
 *
 * Anti-rebote (histéresis): tras un fallo, volver a «contesta: true» requiere
 * al menos 2 respuestas buenas seguidas y ningún fallo en los últimos 10 s.
 * Si ya hubo 2 respuestas pero aún no se completan los 10 s limpios, se espera
 * el tiempo restante con un temporizador, confirmando que no haya fallado entretanto.
 */
export function elServidorContesto(): void {
    iniciar();
    const ahora = Date.now();
    exitosSeguidos++;

    if (estado.contesta) {
        estado.ultimaRespuesta = ahora;
    } else {
        const tiempoSinFallos = ahora - ultimoFallo;
        if (exitosSeguidos >= EXITOS_NECESARIOS && tiempoSinFallos >= VENTANA_SIN_FALLOS_MS) {
            if (temporizadorRebote) {
                clearTimeout(temporizadorRebote);
                temporizadorRebote = null;
            }
            estado = { contesta: true, ultimaRespuesta: ahora };
            avisar();
        } else if (exitosSeguidos >= EXITOS_NECESARIOS) {
            if (!temporizadorRebote) {
                const restante = Math.max(100, VENTANA_SIN_FALLOS_MS - tiempoSinFallos);
                temporizadorRebote = setTimeout(() => {
                    temporizadorRebote = null;
                    const t = Date.now();
                    if (!estado.contesta && exitosSeguidos >= EXITOS_NECESARIOS && t - ultimoFallo >= VENTANA_SIN_FALLOS_MS) {
                        estado = { contesta: true, ultimaRespuesta: t };
                        avisar();
                    }
                }, restante);
            }
        }
    }

    // Se apunta en disco como mucho una vez cada diez segundos: esto pasa en
    // cada respuesta y escribir en cada una no aporta nada.
    if (ahora - ultimoGuardado > 10_000) {
        ultimoGuardado = ahora;
        try {
            localStorage.setItem(CLAVE, String(ahora));
        } catch {
            /* sin almacenamiento local: solo se pierde la hora del aviso */
        }
    }
}

export function elServidorNoContesta(): void {
    iniciar();
    ultimoFallo = Date.now();
    exitosSeguidos = 0;
    if (temporizadorRebote) {
        clearTimeout(temporizadorRebote);
        temporizadorRebote = null;
    }
    if (!estado.contesta) return;
    estado = { ...estado, contesta: false };
    avisar();
}

/** Solo para reiniciar el estado en las pruebas unitarias. */
export function _reiniciarEstadoParaPruebas(): void {
    estado = { contesta: true, ultimaRespuesta: null };
    iniciado = false;
    oyentes.clear();
    ultimoGuardado = 0;
    ultimoFallo = 0;
    exitosSeguidos = 0;
    if (temporizadorRebote) {
        clearTimeout(temporizadorRebote);
        temporizadorRebote = null;
    }
}

/**
 * ¿Este error es que el servidor no contestó, y no que dijo que no?
 *
 * Un 400, un 403 o un 409 son respuestas: el servidor está y ha decidido. Un
 * 500 del propio servidor también (viene en JSON, con su motivo). Lo que no es
 * respuesta: que no llegue nada, que se agote el tiempo, o que el repartidor de
 * delante diga que detrás no hay nadie.
 */
export function esQueNoContesta(error: any): boolean {
    if (!error) return false;
    if (error.name === 'SinConexion' || error.name === 'SinServidor') return true;
    if (error.code === 'ECONNABORTED' || error.code === 'ERR_NETWORK' || error.code === 'ETIMEDOUT') return true;
    const r = error.response;
    /**
     * Muchos servicios envuelven el error en uno suyo
     * (`throw new Error(getApiErrorMessage(error, '…'))`) y la respuesta se
     * pierde por el camino: no se sabe si contestó. Pero cuando el servidor
     * ya consta como caído, es eso. Sin esto, sin conexión salía «Error al
     * cargar años escolares» en rojo encima de los años que sí se veían,
     * guardados (medido en la APK).
     */
    if (!r) return !!error.isAxiosError || error instanceof TypeError || !elEstadoDelServidor().contesta;
    if ([502, 503, 504].includes(r.status)) return true;
    if (r.status >= 500) {
        const tipo = String(r.headers?.['content-type'] ?? '');
        return !tipo.includes('application/json');
    }
    return false;
}
