'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/axios';
import { useAuthStore } from '@/store/auth.store';
import { useInstituteConfig } from '@/hooks/useInstitute';
import { useFotoDePerfil } from '@/hooks/useFotoDePerfil';
import { elDuenoDeAhora } from '@/lib/el-dueno';
import { getAssetUrl } from '@/config/env';
import { elLiceoDeLaCookie } from '@/lib/la-puerta-del-liceo';
import { enmascarar, recordarElPerfil, reducirImagen } from '@/lib/perfil-recordado';

/**
 * Apunta quién usa este teléfono para la pantalla de bloqueo
 * (`perfil-recordado.ts`): el nombre, el rol (y el año del alumno), el correo
 * a medias, la foto y el logo ya reducidos. Con conexión, al abrir el panel.
 */
export function RecordarElPerfil() {
    const user = useAuthStore((s) => s.user);
    const { data: config } = useInstituteConfig();
    const { data: foto } = useFotoDePerfil(user?.avatar);
    const esAlumno = user?.role === 'STUDENT';
    const { data: seccion } = useQuery({
        queryKey: ['seccionDelAlumno', user?.id],
        queryFn: async () => (await api.get(`/students/${encodeURIComponent(user!.id)}/materias`)).data?.seccion?.name ?? null,
        enabled: Boolean(esAlumno && user?.id),
        staleTime: 60 * 60 * 1000,
    });

    // Lo de texto, en cuanto se sabe.
    React.useEffect(() => {
        const dueno = elDuenoDeAhora();
        if (!dueno || !user) return;
        recordarElPerfil({
            dueno,
            nombre: user.firstName?.split(' ')[0] ?? '',
            apellido: user.lastName?.split(' ')[0] ?? '',
            rol: user.role,
            correo: user.email ? enmascarar(user.email) : '',
            liceo: elLiceoDeLaCookie(),
            ...(config?.name ? { nombreDelLiceo: config.name } : {}),
            ...(esAlumno ? { detalle: seccion ?? null } : {}),
        });
    }, [user, config?.name, esAlumno, seccion]);

    // La foto y el logo, reducidos (para que salgan sin conexión).
    React.useEffect(() => {
        const dueno = elDuenoDeAhora();
        if (!dueno || !foto) return;
        void reducirImagen(foto, 160).then((d) => d && recordarElPerfil({ dueno, foto: d }));
    }, [foto]);

    React.useEffect(() => {
        const dueno = elDuenoDeAhora();
        if (!dueno || !config?.logo) return;
        void reducirImagen(getAssetUrl(config.logo), 256).then((d) => d && recordarElPerfil({ dueno, logo: d }));
    }, [config?.logo]);

    return null;
}

export default RecordarElPerfil;
