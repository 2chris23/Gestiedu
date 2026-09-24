import { useEffect, useState } from 'react';
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

/**
 * EL RELOJ DEL LICEO, QUE AVANZA
 *
 * `useSchoolToday` da el día; las pantallas del horario necesitan además la
 * hora que va (qué clase está «en curso») y el día de la semana. Lo hacían con
 * `new Date()`: el reloj y la zona del aparato. Un teléfono con la fecha
 * adelantada, o con otra zona horaria, enseñaba como «Hoy» las clases de otro
 * día (RELOJ-01).
 *
 * Aquí la hora es la del servidor: al llegar la respuesta se guarda cuánto
 * va adelantado o atrasado el aparato, y a partir de ahí se cuenta con ese
 * desfase, en la zona del liceo. Se refresca cada `cadaMs`. Sin respuesta del
 * servidor (sin conexión), el reloj local como último recurso, igual que
 * `useSchoolToday`.
 */
export interface RelojDelLiceo {
    /** Día en el liceo, "YYYY-MM-DD". */
    fecha: string;
    /** Hora en el liceo, "HH:mm". */
    hora: string;
    /** 0 = domingo … 6 = sábado, del día del liceo. */
    diaDeLaSemana: number;
    /** true cuando ya contestó el servidor (antes es el reloj del aparato). */
    delServidor: boolean;
}

export function relojDelLiceoEn(momento: number, zona: string): Omit<RelojDelLiceo, 'delServidor'> {
    const instante = new Date(momento);
    let fecha: string;
    let hora: string;
    try {
        fecha = new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instante);
        hora = new Intl.DateTimeFormat('en-GB', { timeZone: zona, hour: '2-digit', minute: '2-digit', hour12: false }).format(instante);
    } catch {
        fecha = toLocalYMD(instante);
        hora = instante.toTimeString().slice(0, 5);
    }
    const diaDeLaSemana = new Date(`${fecha}T12:00:00Z`).getUTCDay();
    return { fecha, hora, diaDeLaSemana };
}

export function useRelojDelLiceo(cadaMs = 30_000): RelojDelLiceo {
    const { data, dataUpdatedAt } = useSchoolTime();
    // El instante del aparato se toma fuera del pintado: al montar, cada
    // `cadaMs` y cada vez que llega la hora del servidor.
    const [ahoraDelAparato, setAhoraDelAparato] = useState(() => Date.now());
    useEffect(() => {
        setAhoraDelAparato(Date.now());
        const t = setInterval(() => setAhoraDelAparato(Date.now()), cadaMs);
        return () => clearInterval(t);
    }, [cadaMs, dataUpdatedAt]);

    if (!data?.now || !data?.timezone) {
        const local = new Date(ahoraDelAparato);
        return {
            fecha: toLocalYMD(local),
            hora: local.toTimeString().slice(0, 5),
            diaDeLaSemana: local.getDay(),
            delServidor: false,
        };
    }
    // Lo que va adelantado (o atrasado) este aparato respecto del servidor.
    const desfase = Date.parse(data.now) - dataUpdatedAt;
    return { ...relojDelLiceoEn(Math.max(ahoraDelAparato, dataUpdatedAt) + desfase, data.timezone), delServidor: true };
}
