import api from '@/lib/axios';

export interface InstituteConfig {
    id: string;
    name: string;
    code: string;
    email: string;
    phone?: string;
    address?: string;
    logo?: string;
    favicon?: string; // Nuevo
    primaryColor?: string; // Nuevo
    secondaryColor?: string; // Nuevo
    subjectPalette?: string; // JSON string array - Nuevo
    colors?: string; // JSON string (legacy)
    configuration?: string; // JSON string
    createdAt: string;
    updatedAt: string;
}

export interface UpdateInstituteDto {
    name?: string;
    code?: string;
    email?: string;
    phone?: string;
    address?: string;
    description?: string;
    logo?: string;
    colors?: {
        primary: string;
        secondary: string;
        accent: string;
    };
    configuration?: {
        timezone?: string;
        gradeScale?: { min: number; max: number };
        passingGrade?: number;
        language?: string;
        dateFormat?: string;
        notifications?: {
            channels: {
                email: boolean;
                inApp: boolean;
            };
            types: {
                academic: boolean;
                administrative: boolean;
                security: boolean;
            };
        };
        security?: {
            sessionTimeout: number; // minutes
            passwordComplexity: {
                minLength: number;
                requireSpecialChars: boolean;
                requireNumbers: boolean;
            };
            maxLoginAttempts: number;
        };
    };
}

export const instituteService = {
    /**
     * Obtener configuración del instituto
     */
    getConfig: async (): Promise<InstituteConfig> => {
        const response = await api.get('/institutes/current/config');
        return response.data.data;
    },

    /**
     * Actualizar configuración del instituto
     */
    updateConfig: async (data: UpdateInstituteDto): Promise<InstituteConfig> => {
        // Usamos la ruta de instituto específico, asumiendo que el ID 'institute' es aceptado
        // o que el backend será ajustado.
        const response = await api.put('/institutes/current/config', data);
        return response.data.data;
    },

    /**
     * Subir logos del instituto (favicon y logo principal)
     */
    uploadLogos: async (favicon?: File, logo?: File): Promise<{ favicon?: string; logo?: string }> => {
        const formData = new FormData();

        if (favicon) {
            formData.append('favicon', favicon);
        }
        if (logo) {
            formData.append('logo', logo);
        }

        const response = await api.post('/institutes/logos', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });

        return response.data.data;
    },

    /**
     * Actualizar colores del sistema
     */
    updateColors: async (primaryColor: string, secondaryColor: string): Promise<{ primaryColor: string; secondaryColor: string }> => {
        const response = await api.patch('/institutes/colors', {
            primaryColor,
            secondaryColor
        });
        return response.data.data;
    },

    /**
     * Obtener paleta de colores para materias
     */
    getSubjectPalette: async (): Promise<string[]> => {
        const response = await api.get('/institutes/subject-palette');
        return response.data.data;
    },

    /**
     * Agregar color a la paleta
     */
    addColorToPalette: async (color: string): Promise<string[]> => {
        const response = await api.post('/institutes/subject-palette', { color });
        return response.data.data;
    },

    /**
     * Eliminar color de la paleta
     */
    removeColorFromPalette: async (index: number): Promise<string[]> => {
        const response = await api.delete(`/institutes/subject-palette/${index}`);
        return response.data.data;
    },

    /**
     * Actualizar color en la paleta
     */
    updateColorInPalette: async (index: number, color: string): Promise<string[]> => {
        const response = await api.patch(`/institutes/subject-palette/${index}`, { color });
        return response.data.data;
    },
};
