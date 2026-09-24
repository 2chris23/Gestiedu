import { useQuery } from '@tanstack/react-query';
import api from '@/lib/axios';

/**
 * ASISTENCIA POR QR, DEL LADO DEL TELÉFONO
 *
 * Lo que decide está en el servidor (`services/asistencia-qr.service.ts`). Aquí
 * solo se reúne lo que el servidor necesita saber del teléfono:
 *
 *  · **Qué aparato es.** En la app, el identificador de Android del teléfono
 *    (`AsistenciaQr.aparato()` en `AsistenciaQrPlugin.java`): sobrevive a
 *    cerrar sesión y a reinstalar la app. En un navegador, un número guardado
 *    en ese navegador —que se borra con borrar los datos: vale menos, y así se
 *    trata—. Ninguno de los dos se guarda con la sesión: cerrar sesión y entrar
 *    con la cuenta del amigo es justo la trampa que tiene que cortar.
 *  · **Dónde está.** En la app, la ubicación del teléfono con la marca de si
 *    viene de una app de ubicaciones falsas (Android lo dice). En un navegador,
 *    la del navegador, que se falsea en dos clics: por eso el faro «muerde» en
 *    la app y en el navegador vale poco.
 */

export interface Ubicacion {
    lat: number;
    lng: number;
    precision?: number;
    falsa?: boolean;
}

export interface ElAparato {
    id: string;
    descripcion: string;
}

type PluginAsistencia = {
    aparato?: () => Promise<{ id: string; descripcion: string }>;
    ubicacion?: (o: { tiempoMaximo: number }) => Promise<{ lat: number; lng: number; precision?: number; falsa?: boolean }>;
};

function elPlugin(): PluginAsistencia | null {
    if (typeof window === 'undefined') return null;
    const cap = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor;
    return (cap?.Plugins?.AsistenciaQr as PluginAsistencia | undefined) ?? null;
}

const LLAVE_DEL_APARATO = 'gestiedu:aparato';

/** `crypto.randomUUID` solo existe en https o localhost; esto, en todas partes. */
function numeroAlAzar(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Qué teléfono es. No depende de la sesión: sobrevive a cerrarla. */
export async function elAparato(): Promise<ElAparato> {
    const plugin = elPlugin();
    if (plugin?.aparato) {
        try {
            const a = await plugin.aparato();
            if (a?.id) return { id: `android:${a.id}`, descripcion: a.descripcion || 'Android' };
        } catch {
            // Sin el complemento nativo, como un navegador.
        }
    }
    let id: string | null = null;
    try {
        id = localStorage.getItem(LLAVE_DEL_APARATO);
        if (!id) {
            id = `web:${numeroAlAzar()}`;
            localStorage.setItem(LLAVE_DEL_APARATO, id);
        }
    } catch {
        id = `web:${numeroAlAzar()}`;
    }
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const sistema = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iPhone' : /Windows/i.test(ua) ? 'Windows' : 'Navegador';
    return { id, descripcion: `${sistema} · navegador` };
}

/**
 * Dónde está el teléfono ahora. `null` si no se puede saber (permiso negado,
 * sin señal): el servidor lo trata como «por confirmar», no como un no.
 */
export async function laUbicacion(tiempoMaximo = 8000): Promise<Ubicacion | null> {
    const plugin = elPlugin();
    if (plugin?.ubicacion) {
        try {
            const u = await plugin.ubicacion({ tiempoMaximo });
            if (u && Number.isFinite(u.lat) && Number.isFinite(u.lng)) return u;
        } catch {
            return null;
        }
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
    return new Promise((resolver) => {
        navigator.geolocation.getCurrentPosition(
            (p) => resolver({ lat: p.coords.latitude, lng: p.coords.longitude, precision: p.coords.accuracy }),
            () => resolver(null),
            { enableHighAccuracy: true, timeout: tiempoMaximo, maximumAge: 15000 }
        );
    });
}

// ─── Lo que se le pide al servidor ──────────────────────────────────────────

export interface ConfigAsistenciaQr {
    activa: boolean;
    radioMetros: number;
    fueraDelRadio: 'confirmar' | 'bloquear';
    unTelefonoPorAlumno: boolean;
    minutosATiempo: number;
    diasParaCorregir: number;
}

export interface RegistroDelPase {
    id: string;
    studentId: string;
    nombre: string;
    foto: string | null;
    forma: 'ALUMNO_ESCANEA' | 'PROFESOR_ESCANEA';
    estado: 'ACEPTADO' | 'POR_CONFIRMAR' | 'RECHAZADO' | 'QUITADO';
    motivo: string | null;
    asistencia: 'PRESENT' | 'LATE' | null;
    aparato: string | null;
    distancia: number | null;
    hora: string;
}

export interface VistaDelPase {
    pase: {
        id: string;
        fecha: string;
        abiertoEn: string;
        aTiempoHasta: string;
        cerradoEn: string | null;
        esCorreccion: boolean;
        conFaro: boolean;
        abierto: boolean;
        seccion: string | null;
        materia: string | null;
    };
    codigo: string | null;
    cambiaEnMs: number | null;
    cuenta: { registrados: number; total: number };
    registros: RegistroDelPase[];
    faltan: Array<{ id: string; nombre: string; foto: string | null }>;
}

const datos = <T,>(r: { data: { data: T } }) => r.data.data;

export const asistenciaQr = {
    config: () => api.get('/asistencia-qr/configuracion').then(datos<ConfigAsistenciaQr>),
    guardarConfig: (c: Partial<ConfigAsistenciaQr>) => api.put('/asistencia-qr/configuracion', c).then(datos<ConfigAsistenciaQr>),

    abrir: (b: { classroomId: string; subjectId: string; fecha?: string; ubicacion?: Ubicacion | null }) =>
        api.post('/asistencia-qr/pases', b).then(datos<VistaDelPase>),
    ver: (paseId: string) => api.get(`/asistencia-qr/pases/${paseId}`).then(datos<VistaDelPase>),
    faro: (paseId: string, ubicacion: Ubicacion) =>
        api.post(`/asistencia-qr/pases/${paseId}/faro`, { ubicacion }).then(datos<VistaDelPase>),
    aprobar: (paseId: string, registroId: string) =>
        api.post(`/asistencia-qr/pases/${paseId}/registros/${registroId}/aprobar`, {}).then(datos<VistaDelPase>),
    quitar: (paseId: string, registroId: string) =>
        api.post(`/asistencia-qr/pases/${paseId}/registros/${registroId}/quitar`, {}).then(datos<VistaDelPase>),
    cerrar: (paseId: string, presentesAMano: string[]) =>
        api.post(`/asistencia-qr/pases/${paseId}/cerrar`, { presentesAMano }).then(datos<{ ausentes: number; presentes: number }>),
    escanearAlumno: (paseId: string, codigo: string) =>
        api
            .post(`/asistencia-qr/pases/${paseId}/escanear-alumno`, { codigo })
            .then(datos<{ alumno: { id: string; nombre: string; foto: string | null }; asistencia: string; yaEstaba: boolean }>),

    escanear: (b: { codigo: string; aparato: ElAparato; ubicacion: Ubicacion | null }) =>
        api
            .post('/asistencia-qr/escanear', b)
            .then(datos<{ estado: string; asistencia?: string; mensaje: string; materia?: string | null; seccion?: string | null; yaEstaba?: boolean }>),
    miCodigo: () => api.get('/asistencia-qr/mi-codigo').then(datos<{ codigo: string; cambiaEnMs: number }>),

    aparatoDe: (studentId: string) =>
        api
            .get(`/asistencia-qr/aparato/${encodeURIComponent(studentId)}`)
            .then(datos<{ descripcion: string | null; registradoEn: string; ultimoUso: string } | null>),
    desbloquear: (studentId: string) =>
        api.delete(`/asistencia-qr/aparato/${encodeURIComponent(studentId)}`).then(datos<{ desbloqueado: boolean }>),
};

/** Las reglas del liceo (¿usa el QR?). Apagado, los botones del QR no salen. */
export function useConfigAsistenciaQr() {
    return useQuery({ queryKey: ['asistencia-qr', 'config'], queryFn: asistenciaQr.config, staleTime: 5 * 60 * 1000 });
}

/** Lo que dice cada motivo, en la lista del profesor. */
export const QUE_PASO: Record<string, string> = {
    OTRO_TELEFONO: 'Intentó desde un teléfono que no es el suyo',
    TELEFONO_YA_USADO: 'Ese teléfono ya registró a otro alumno',
    TELEFONO_DE_OTRO: 'Ese teléfono es de otro alumno',
    FUERA_DEL_RADIO: 'Lejos de la clase',
    SIN_UBICACION: 'Sin ubicación',
    UBICACION_IMPRECISA: 'Ubicación poco precisa',
    UBICACION_FALSA: 'Ubicación falsa',
    SIN_FARO: '',
};

/** El error del servidor, dicho para el alumno o el profesor. */
export function elMotivo(e: unknown, porDefecto = 'No se pudo. Inténtalo otra vez.'): string {
    const d = (e as { response?: { data?: { error?: string; message?: string } } })?.response?.data;
    return d?.error || d?.message || porDefecto;
}
