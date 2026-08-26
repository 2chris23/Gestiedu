import axios from 'axios';
import { useAuthStore } from '@/store/auth.store';
import { API_URL } from '@/config/env';

// Asegurar que la baseURL del cliente axios siempre tenga el prefijo /api
// NEXT_PUBLIC_API_URL puede ser 'http://localhost:3001' o 'http://localhost:3001/api'
const API_BASE_URL = API_URL.endsWith('/api') ? API_URL : `${API_URL}/api`;

// Crear instancia de axios con baseURL desde configuración centralizada
const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});


// Request Interceptor: Inyectar Token y Slug del Instituto
api.interceptors.request.use(
    async (config) => {

        // Read token and institute slug from cookies (client-side)
        if (typeof document !== 'undefined') {
            const cookies = document.cookie.split(';').reduce((acc, cookie) => {
                const [key, value] = cookie.trim().split('=');
                acc[key] = decodeURIComponent(value || '');
                return acc;
            }, {} as Record<string, string>);

            const token = cookies['access_token'];
            if (token) {
                config.headers.Authorization = `Bearer ${token}`;
            }

            // Enviar slug del instituto para resolución de tenant en el backend
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
let refreshQueue: Array<(success: boolean) => void> = [];

function flushRefreshQueue(success: boolean) {
    refreshQueue.forEach((cb) => cb(success));
    refreshQueue = [];
}

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        // Solo manejamos 401 con config disponible y no reintentado
        if (error.response?.status !== 401 || !originalRequest || originalRequest._retry) {
            return Promise.reject(error);
        }

        // Si ya hay un refresh en curso, encolar y esperar su resultado
        if (isRefreshing) {
            return new Promise((resolve, reject) => {
                refreshQueue.push((success: boolean) => {
                    if (success) {
                        originalRequest._retry = true;
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

            if (refreshResponse.ok) {
                flushRefreshQueue(true);
                return api.request(originalRequest);
            }

            // Refresh falló — desloguear una sola vez
            flushRefreshQueue(false);
            useAuthStore.getState().logout();
            if (typeof window !== 'undefined') {
                window.location.href = '/login';
            }
            return Promise.reject(error);
        } catch (refreshError) {
            flushRefreshQueue(false);
            useAuthStore.getState().logout();
            if (typeof window !== 'undefined') {
                window.location.href = '/login';
            }
            return Promise.reject(refreshError);
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
