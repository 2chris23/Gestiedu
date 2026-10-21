import { User, CreateUserData } from '@/types/user';
import { API_URL } from '@/config/env';
import { conseguirCredencial } from '@/lib/credencial-en-memoria';
import api from '@/lib/axios';

/**
 * LA CREDENCIAL YA NO ESTÁ EN LAS COOKIES
 *
 * Esto se fabricaba las cabeceras leyendo `document.cookie`. Desde que la llave
 * corta vive en la memoria de la pestaña, ahí no hay nada: salía
 * `Authorization: Bearer ` (vacío) y **el servidor respondía 401**.
 *
 * Lo que eso significaba en el liceo: **crear un usuario desde la pantalla
 * dejaba de funcionar**, sin decir por qué. El formulario se cerraba como si
 * hubiera guardado y el usuario no aparecía.
 *
 * Lo cazó BOTON-01, que es la primera prueba que pulsa el botón de verdad en
 * vez de llamar a la API por dentro. Llamando a la API no se veía: la API
 * estaba bien; lo que estaba mal era cómo la llamaba esta pantalla.
 *
 * El liceo sí sigue en la cookie, que no es una credencial.
 */
const getHeaders = async (): Promise<Record<string, string>> => {
    const token = (await conseguirCredencial()) || '';

    let slug = '';
    if (typeof document !== 'undefined') {
        const cookies = document.cookie.split(';').reduce((acc, cookie) => {
            const [key, value] = cookie.trim().split('=');
            acc[key] = value;
            return acc;
        }, {} as Record<string, string>);
        slug = cookies['institute_slug'] || '';
    }

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
    };
    if (slug) {
        headers['X-Institute-Slug'] = slug;
    }
    return headers;
};

interface Pagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

export const userService = {
    getUsers: async (params?: { page?: number; limit?: number; search?: string; role?: string; status?: string; faltan?: boolean }): Promise<{ users: User[]; pagination: Pagination }> => {
        // Por `api` (no `fetch` a mano): así la lista queda guardada en el
        // teléfono y sin conexión se ve la última (`respuestas-guardadas.ts`).
        const query: Record<string, string> = {};
        if (params?.page) query.page = params.page.toString();
        if (params?.limit) query.limit = params.limit.toString();
        if (params?.search) query.search = params.search;
        if (params?.role && params.role !== 'ALL') query.role = params.role;
        if (params?.status) query.status = params.status;
        // Solo los alumnos a los que les falta un dato o un recaudo.
        if (params?.faltan) query.faltan = 'true';

        const { data } = await api.get('/users', { params: query });
        return {
            users: data.users,
            pagination: data.pagination
        };
    },

    archiveUser: async (id: string): Promise<User> => {
        const response = await fetch(`${API_URL}/users/${id}/archive`, {
            method: 'POST',
            headers: await getHeaders()
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.message || error.error || 'Error al archivar usuario');
        }

        const data = await response.json();
        return data.user;
    },

    unarchiveUser: async (id: string): Promise<User> => {
        const response = await fetch(`${API_URL}/users/${id}/unarchive`, {
            method: 'POST',
            headers: await getHeaders()
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.message || error.error || 'Error al restaurar usuario');
        }

        const data = await response.json();
        return data.user;
    },

    createUser: async (user: CreateUserData): Promise<User> => {
        // Backend expects certain fields.
        // id is used as "Cédula".
        const response = await fetch(`${API_URL}/users`, {
            method: 'POST',
            headers: await getHeaders(),
            body: JSON.stringify(user)
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            console.error('Error creating user:', error); // Log detallado para depuración

            // Si el backend devuelve detalles de validación, mostrarlos
            const msg = error.details
                ? `${error.message}: ${Array.isArray(error.details) ? error.details.map((d: { message?: string }) => d.message || String(d)).join(', ') : JSON.stringify(error.details)}`
                : (error.error || error.message || 'Error al crear usuario');

            throw new Error(msg);
        }

        const data = await response.json();
        return data.user || data;
    },

    updateUser: async (id: string, user: Partial<CreateUserData>): Promise<User> => {
        const response = await fetch(`${API_URL}/users/${id}`, {
            method: 'PUT',
            headers: await getHeaders(),
            body: JSON.stringify(user)
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            console.error('Error updating user:', error);

            const msg = error.details
                ? `${error.message}: ${Array.isArray(error.details) ? error.details.map((d: { message?: string }) => d.message || String(d)).join(', ') : JSON.stringify(error.details)}`
                : (error.error || error.message || 'Error al actualizar usuario');

            throw new Error(msg);
        }

        const data = await response.json();
        return data.user || data;
    },

    deleteUser: async (id: string): Promise<void> => {
        const response = await fetch(`${API_URL}/users/${id}`, {
            method: 'DELETE',
            headers: await getHeaders()
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            console.error('Error deleting user:', error);
            const msg = error.message || error.error || 'Error al eliminar usuario';
            throw new Error(msg);
        }
    },

    getUserById: async (id: string): Promise<User> => {
        // Por `api` (no `fetch` a mano), como `getUsers`: con `fetch` la ficha
        // no quedaba en el teléfono y, sin conexión, una ficha bajada por la
        // precarga decía «no está guardada» (PLANTILLA-01). La sesión
        // caducada la atiende `api` (renueva o manda al login).
        try {
            const { data } = await api.get(`/users/${encodeURIComponent(id)}`);
            return data.user;
        } catch (error: any) {
            if (error?.response?.status === 403) throw new Error('No tiene permisos para ver este usuario.');
            throw error;
        }
    }
};
