import axios from 'axios';
import { useAuthStore } from '@/store/auth.store';
import { conseguirCredencial, guardarCredencial, olvidarCredencial } from './credencial-en-memoria';
import { laPuertaDelLiceo } from './la-puerta-del-liceo';
import { API_URL } from '@/config/env';
import { elServidorContesto, elServidorNoContesta, esQueNoContesta } from './estado-del-servidor';

// Asegurar que la baseURL del cliente axios siempre tenga el prefijo /api
// NEXT_PUBLIC_API_URL puede ser 'http://localhost:3001' o 'http://localhost:3001/api'
const API_BASE_URL = API_URL.endsWith('/api') ? API_URL : `${API_URL}/api`;

// Crear instancia de axios con baseURL desde configuración centralizada
const api = axios.create({
    baseURL: API_BASE_URL,
    /**
     * Sin tope, una petición a un servidor que no está (el PC apagado, la red
     * del liceo caída) se quedaba esperando lo que tardara el sistema en
     * rendirse: a veces más de un minuto, con la pantalla girando. Veinte
     * segundos es mucho más de lo que tarda cualquier respuesta de verdad.
     */
    timeout: 20000,
    headers: {
        'Content-Type': 'application/json',
    },
});


/**
 * SIN CONEXIÓN SE MIRA, NO SE TOCA
 *
 * El teléfono guarda lo último que se descargó y sin señal la app lo enseña
 * (`providers/MemoriaDelTelefono.tsx`). Mirar, sí. Cambiar, no: poner una nota,
 * pasar asistencia o cobrar un pago necesitan hablar con el servidor.
 *
 * Y se corta AQUÍ, en el acto, en vez de dejarlo «pendiente de enviar». Una
 * cola de cambios que se mandan solos media hora después, sobre datos que
 * mientras tanto ha tocado otro profesor, es la forma más rápida de perder una
 * nota sin que nadie se entere. Mejor decirlo cuando la persona está delante.
 *
 * `navigator.onLine` no es una verdad absoluta —dice si hay red, no si el
 * servidor contesta—, pero cuando dice que NO, no hay. Cuando dice que sí y no
 * la hay, la petición sale y falla con su error de siempre.
 */
const SOLO_MIRAR = new Set(['get', 'head', 'options']);

export const MENSAJE_SIN_CONEXION =
    'Sin conexión con el liceo. Esto necesita conexión para guardarse: no se ha guardado nada. Inténtalo cuando vuelva la conexión.';

/**
 * El error que ve la pantalla cuando no se pudo guardar por falta de conexión.
 *
 * Trae la misma forma que una respuesta del servidor (`response.data.error`),
 * porque así es como la mayoría de las pantallas leen el motivo de un error:
 * sin eso, enseñaban «No se pudo guardar» sin decir por qué, y el profesor lo
 * intentaba otra vez creyendo que era culpa suya.
 */
export class SinConexion extends Error {
    readonly isAxiosError = true;
    readonly code = 'SIN_CONEXION';
    readonly response = { status: 503, data: { error: MENSAJE_SIN_CONEXION, message: MENSAJE_SIN_CONEXION, code: 'SIN_CONEXION' }, headers: {} };
    constructor() {
        super(MENSAJE_SIN_CONEXION);
        this.name = 'SinConexion';
    }
}

/** ¿Esta petición cambia algo? */
function esEscritura(metodo?: string): boolean {
    return !SOLO_MIRAR.has((metodo || 'get').toLowerCase());
}

// Request Interceptor: Inyectar Token y Slug del Instituto
api.interceptors.request.use(
    async (config) => {
        const metodo = (config.method || 'get').toLowerCase();
        if (
            !SOLO_MIRAR.has(metodo) &&
            typeof navigator !== 'undefined' &&
            navigator.onLine === false
        ) {
            throw new SinConexion();
        }

        if (typeof document !== 'undefined') {
            /**
             * LA CREDENCIAL SALE DE LA MEMORIA, NO DE LAS COOKIES
             *
             * Antes se leía de `document.cookie`, y para eso la cookie tenía que
             * estar abierta a la página. Cualquier cosa que consiguiera ejecutar
             * código allí se la llevaba con una línea. Ahora vive solo en la
             * memoria de la pestaña: ver `lib/credencial-en-memoria.ts`.
             *
             * Si no hay (por ejemplo, al recargar), se pide una nueva con la
             * llave larga, que sigue guardada donde la página no la ve.
             */
            const token = await conseguirCredencial();
            if (token) {
                config.headers.Authorization = `Bearer ${token}`;
            }

            // El liceo sí se lee de la cookie: no es una credencial, solo dice
            // a qué liceo se pregunta, y el servidor no se fía de ella para
            // nada (manda el liceo del token).
            const cookies = document.cookie.split(';').reduce((acc, cookie) => {
                const [key, value] = cookie.trim().split('=');
                acc[key] = decodeURIComponent(value || '');
                return acc;
            }, {} as Record<string, string>);

            const slug = cookies['institute_slug'];
            if (slug) {
                config.headers['X-Institute-Slug'] = slug;
            }
        }

        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response Interceptor: Manejo Global de Errores
let isRefreshing = false;
// Cola de peticiones que llegaron mientras se refrescaba el token.
// Sin esta cola, las peticiones paralelas a un 401 caían directo al logout
// aunque el refresh fuera exitoso (race condition).
let refreshQueue: Array<(success: boolean, token?: string) => void> = [];

function flushRefreshQueue(success: boolean, token?: string) {
    refreshQueue.forEach((cb) => cb(success, token));
    refreshQueue = [];
}

api.interceptors.response.use(
    (response) => {
        elServidorContesto();
        return response;
    },
    async (error) => {
        const originalRequest = error.config;

        // ¿Contestó el servidor (aunque fuera para decir que no), o no llegó nada?
        if (esQueNoContesta(error)) {
            elServidorNoContesta();
            // Guardar sin servidor: el mismo aviso claro que sin internet. Leer
            // sin servidor: se deja el error tal cual, y la pantalla sigue
            // enseñando lo que tenía guardado.
            if (esEscritura(originalRequest?.method)) return Promise.reject(new SinConexion());
            return Promise.reject(error);
        }
        if (error.response) elServidorContesto();

        // Solo manejamos 401 con config disponible y no reintentado
        if (error.response?.status !== 401 || !originalRequest || originalRequest._retry) {
            return Promise.reject(error);
        }

        // Si ya hay un refresh en curso, encolar y esperar su resultado
        if (isRefreshing) {
            return new Promise((resolve, reject) => {
                refreshQueue.push((success: boolean, token?: string) => {
                    if (success) {
                        originalRequest._retry = true;
                        if (token && originalRequest.headers) {
                            originalRequest.headers.Authorization = `Bearer ${token}`;
                        }
                        resolve(api.request(originalRequest));
                    } else {
                        reject(error);
                    }
                });
            });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
            const refreshResponse = await fetch('/api/auth/refresh', { method: 'POST' });

            /**
             * RENOVAR SIN SERVIDOR NO ES «LA SESIÓN CADUCÓ»
             *
             * Si el servidor no contesta (o contesta el repartidor diciendo que
             * detrás no hay nadie), la sesión no se sabe si vale: no se toca.
             * Antes cualquier fallo al renovar cerraba la sesión y mandaba al
             * login, que sin servidor tampoco abre: la app se quedaba en nada.
             * Solo un «no» del servidor (401/403) cierra la sesión.
             */
            if (!refreshResponse.ok && ![400, 401, 403].includes(refreshResponse.status)) {
                elServidorNoContesta();
                flushRefreshQueue(false);
                return Promise.reject(esEscritura(originalRequest?.method) ? new SinConexion() : error);
            }

            if (refreshResponse.ok) {
                const refreshData = await refreshResponse.json().catch(() => ({}));
                const newAccessToken = refreshData.accessToken;

                // La cookie ya viene puesta en la respuesta de /api/auth/refresh,
                // con `Secure` en producción. Reescribirla aquí a mano le quitaba
                // esa marca cada diez minutos, que es cada vez que se renueva.
                // La llave nueva se queda en memoria para las siguientes
                // peticiones; si no, cada una volvería a renovar.
                guardarCredencial(newAccessToken);

                if (newAccessToken && originalRequest.headers) {
                    originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
                }

                flushRefreshQueue(true, newAccessToken);
                return api.request(originalRequest);
            }

            // Refresh falló — desloguear una sola vez
            flushRefreshQueue(false);
            olvidarCredencial();
            useAuthStore.getState().logout();
            if (typeof window !== 'undefined') {
                // Con el liceo: `/login` a secas responde «no existe», y quien
                // se quedaba sin sesión acababa en un 404.
                window.location.href = laPuertaDelLiceo();
            }
            return Promise.reject(error);
        } catch (refreshError) {
            // La renovación ni siquiera llegó: no hay servidor. La sesión se
            // queda como estaba (ver arriba).
            elServidorNoContesta();
            flushRefreshQueue(false);
            return Promise.reject(esEscritura(originalRequest?.method) ? new SinConexion() : refreshError);
        } finally {
            isRefreshing = false;
        }
    }
);

// Exportar la baseURL configurada para referencia
export function getConnectionStatus(): { baseURL: string } {
    return {
        baseURL: API_BASE_URL,
    };
}

export default api;
