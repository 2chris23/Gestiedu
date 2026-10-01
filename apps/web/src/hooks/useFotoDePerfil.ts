import { useQuery } from '@tanstack/react-query';
import api from '@/lib/axios';

/**
 * Las fotos de perfil piden sesión (la de un alumno solo la ve quien puede ver
 * a ese alumno). Un `<img src>` no manda la credencial —vive en la memoria de la
 * pestaña, no en una cookie—, así que se pide con axios y se pinta desde memoria.
 *
 * La dirección lleva la huella de la foto (`?v=…`): misma dirección, misma foto.
 * Por eso se guarda para siempre en la sesión y no se vuelve a pedir.
 *
 * `visible`: una lista de treinta alumnos pedía las treinta fotos al abrirse,
 * aunque en el teléfono se vieran seis. Ahora cada foto se pide cuando su
 * avatar llega a la pantalla (`UserAvatar`); la que ya se trajo sale al acto.
 */
export const esFotoDelSistema = (src?: string | null): src is string => !!src && src.startsWith('/users/');

export function useFotoDePerfil(src?: string | null, visible = true) {
    return useQuery({
        queryKey: ['fotoDePerfil', src],
        queryFn: async () => {
            const { data } = await api.get(src as string, { responseType: 'blob' });
            return URL.createObjectURL(data as Blob);
        },
        enabled: esFotoDelSistema(src) && visible,
        staleTime: Infinity,
        gcTime: 30 * 60 * 1000,
        retry: false,
    });
}
