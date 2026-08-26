import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface SuperAdmin {
    id: string;
    email: string;
    name: string;
    role: 'SUPERADMIN';
}

interface SuperAdminAuthState {
    superAdmin: SuperAdmin | null;
    setSuperAdmin: (superAdmin: SuperAdmin | null) => void;
    logout: () => void;
}

export const useSuperAdminAuthStore = create<SuperAdminAuthState>()(
    persist(
        (set) => ({
            superAdmin: null,

            setSuperAdmin: (superAdmin) => set({ superAdmin }),

            logout: () => {
                set({ superAdmin: null });

                // Limpiar cookies del cliente
                if (typeof window !== 'undefined') {
                    document.cookie = 'superadmin_access_token=; path=/; max-age=0';
                    document.cookie = 'superadmin_refresh_token=; path=/; max-age=0';
                    document.cookie = 'superadmin_data=; path=/; max-age=0';
                }
            },
        }),
        {
            name: 'superadmin-auth', // clave en localStorage
            storage: createJSONStorage(() => localStorage),
        }
    )
);
