import { API_URL } from '@/config/env';

/**
 * 📡 Backend Configuration Reader (Frontend)
 * 
 * Este módulo lee la configuración que el backend escribió
 * para saber en qué puerto está corriendo.
 * 
 * El frontend "escucha" lo que el backend le dice.
 */

interface BackendConfig {
    port: number;
    host: string;
    protocol: 'http' | 'https';
    apiUrl: string;
    status: 'running' | 'stopped';
    lastStarted: string | null;
    version: string;
}

const CONFIG_URL = '/shared/backend-config.json';

/**
 * Lee la configuración del backend desde el archivo compartido
 * @returns Configuración del backend o null si no se puede leer
 */
export async function readBackendConfig(): Promise<BackendConfig | null> {
    // Solo ejecutar en el cliente, no en SSR
    if (typeof window === 'undefined') {
        return null;
    }

    try {
        const response = await fetch(CONFIG_URL, {
            cache: 'no-store', // No cachear para obtener siempre la última versión
        });

        if (!response.ok) {
            return null;
        }

        const config: BackendConfig = await response.json();
        return config;
    } catch (error) {
        return null;
    }
}

/**
 * Obtiene la URL del API desde la configuración del backend
 * Si no se puede leer, usa el valor de env.ts
 */
export async function getApiUrl(): Promise<string> {
    const config = await readBackendConfig();

    if (config && config.status === 'running') {
        return config.apiUrl;
    }

    // Fallback al valor centralizado de env.ts
    return API_URL;
}

/**
 * Verifica si el backend está corriendo según la configuración
 */
export async function isBackendRunning(): Promise<boolean> {
    const config = await readBackendConfig();
    return config?.status === 'running';
}
