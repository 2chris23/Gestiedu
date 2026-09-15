import { useQuery } from '@tanstack/react-query';
import api from '@/lib/axios';
import { toLocalYMD } from '@/utils/date.utils';

/**
 * LA HORA DEL LICEO, NO LA DEL DISPOSITIVO
 *
 * El reloj del teléfono o del computador se cambia a mano, y una VPN puede mover
 * la zona horaria. Si la pantalla se fiara de él, alguien podría ponerse en otro
 * día y ver la clase que no toca.
 *
 * Estos hooks preguntan al servidor qué día y qué hora son en el liceo. Si el
 * servidor no responde (sin conexión), se usa el reloj local como último recurso
 * para no dejar la pantalla en blanco: da igual porque escribir sigue estando
 * controlado por el servidor, que rechaza cualquier fecha futura.
 */

export interface SchoolTime {
    /** Momento exacto según el servidor (ISO). */
    now: string;
    /** Día en el liceo, "YYYY-MM-DD". */
    date: string;
    /** Hora en el liceo, "HH:mm". */
    time: string;
    timezone: string;
}

export function useSchoolTime() {
    return useQuery<SchoolTime>({
        queryKey: ['school-time'],
        queryFn: async () => {
            const { data } = await api.get('/time');
            return data;
        },
        // Se revalida cada pocos minutos: cambiar el reloj del dispositivo no
        // altera esta respuesta.
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: true,
        retry: 1,
    });
}

/**
 * El día de hoy en el liceo ("YYYY-MM-DD"). Mientras llega la respuesta del
 * servidor devuelve el día local, que en la inmensa mayoría de los casos es el
 * mismo.
 */
export function useSchoolToday(): string {
    const { data } = useSchoolTime();
    return data?.date ?? toLocalYMD();
}
