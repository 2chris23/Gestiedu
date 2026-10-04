'use client';

import { useEffect, useRef } from 'react';
import api from '@/lib/axios';
import { useQuienSoy } from '@/hooks/useQuienSoy';
import { useSchoolToday } from '@/hooks/useSchoolTime';
import { useConexion } from '@/hooks/useConexion';
import { guardarEstasPaginas } from '@/lib/paginas-guardadas';
import { escalonar } from '@/lib/azar';
import { lasPorGuardar } from '@/lib/pantallas-sin-guardar';
import { loDelAdmin, loDelAlumno, loDelProfesor, type LoQueSeBaja } from '@/lib/lo-que-se-baja-solo';

/**
 * LA DESCARGA EN SEGUNDO PLANO (como WhatsApp)
 *
 * Con conexión, sin que nadie lo pida: al entrar, al volver la conexión, al
 * volver a la app y cada media hora, se baja lo de cada uno
 * (`lo-que-se-baja-solo.ts`). De una en una y sin prisa: la pantalla que la
 * persona está usando va primero. Nada si el teléfono pide ahorrar datos.
 *
 * Con la app CERRADA del todo no baja nada: en la APK eso necesita el aviso de
 * Firebase para despertarla (pendiente, `docs/APP-MOVIL.md`).
 */

const CADA = 30 * 60 * 1000;
const AL_VOLVER = 15 * 60 * 1000;
const PAUSA_ENTRE_LECTURAS = 250;
const LLAVE = 'gestiedu:ultima-descarga';

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

function ahorrandoDatos(): boolean {
    const conexion = (navigator as unknown as { connection?: { saveData?: boolean } }).connection;
    return Boolean(conexion?.saveData);
}

function ultima(dueno: string): number {
    try {
        const g = JSON.parse(localStorage.getItem(LLAVE) || 'null');
        return g?.dueno === dueno ? Number(g.cuando) || 0 : 0;
    } catch {
        return 0;
    }
}

function apuntar(dueno: string) {
    try {
        localStorage.setItem(LLAVE, JSON.stringify({ dueno, cuando: Date.now() }));
    } catch {
        /* sin almacenamiento: se bajará algo más a menudo, nada más */
    }
}

async function queBajar(rol: string, yoId: string, hoy: string): Promise<LoQueSeBaja> {
    if (rol === 'TEACHER') {
        const { data } = await api.get(`/schedules/teacher/${yoId}/blocks`);
        return loDelProfesor(yoId, data?.scheduleBlocks ?? [], hoy);
    }
    if (rol === 'STUDENT') {
        const { data } = await api.get(`/students/${encodeURIComponent(yoId)}/materias`);
        return loDelAlumno(yoId, data?.seccion?.id ?? null, data?.materias ?? []);
    }
    if (rol === 'ADMIN') return loDelAdmin();
    return { lecturas: [], pantallas: ['/dashboard'] };
}

export function DescargaEnSegundoPlano() {
    const { yo } = useQuienSoy();
    const hoy = useSchoolToday();
    const { hayConexion } = useConexion();
    const bajando = useRef(false);
    const bajarYa = useRef<((minimo: number) => Promise<void>) | null>(null);
    const estado = useRef({ yo, hoy, hayConexion });
    estado.current = { yo, hoy, hayConexion };

    useEffect(() => {
        if (!yo?.id || !yo.role) return;
        const dueno = `${yo.role}:${yo.id}`;

        const bajar = async (minimo: number) => {
            const { yo: quien, hoy: dia, hayConexion: hay } = estado.current;
            if (bajando.current || !hay || !quien?.id || ahorrandoDatos()) return;
            if (Date.now() - ultima(dueno) < minimo) return;
            bajando.current = true;
            try {
                const plan = await queBajar(quien.role, quien.id, dia);
                guardarEstasPaginas([...plan.pantallas, ...lasPorGuardar()]);
                for (const l of plan.lecturas) {
                    // Si se va la conexión a medias, se deja: se sigue la próxima vez.
                    if (!estado.current.hayConexion) return;
                    await api.get(l.url, { params: l.params }).catch(() => undefined);
                    await esperar(PAUSA_ENTRE_LECTURAS);
                }
                apuntar(dueno);
            } catch {
                /* sin conexión o sin permiso: la próxima vez */
            } finally {
                bajando.current = false;
            }
        };

        bajarYa.current = bajar;

        // Un poco después de abrir: lo primero es lo que la persona está viendo.
        const primera = window.setTimeout(() => void bajar(AL_VOLVER), 15_000);
        const cada = window.setInterval(() => void bajar(CADA), CADA);
        const alVolver = () => {
            if (document.visibilityState === 'visible') void bajar(AL_VOLVER);
        };
        document.addEventListener('visibilitychange', alVolver);
        return () => {
            window.clearTimeout(primera);
            window.clearInterval(cada);
            document.removeEventListener('visibilitychange', alVolver);
            bajarYa.current = null;
        };
    }, [yo?.id, yo?.role]);

    // Al volver la conexión, lo que falte, sin esperar la media hora.
    const antes = useRef(hayConexion);
    useEffect(() => {
        const volvio = hayConexion && !antes.current;
        antes.current = hayConexion;
        if (!volvio) return;
        // Cada teléfono a su hora (de 5 s a 1 min): bajarse lo de su rol es
        // lo más pesado, y al volver la luz lo harían todos a la vez.
        const t = window.setTimeout(() => void bajarYa.current?.(0), 5_000 + escalonar(55_000));
        return () => window.clearTimeout(t);
    }, [hayConexion]);

    return null;
}

export default DescargaEnSegundoPlano;
