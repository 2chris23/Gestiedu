'use client';

import { useCallback, useEffect, useState } from 'react';
import { superAdminFetch } from '@/lib/superadmin-fetch';

/**
 * LA SALUD DEL SISTEMA, A LA VISTA DEL DUEÑO (falla gris, 2026-10-04)
 *
 * Lo que falla callado: una tarea que dejó de correr (el recordatorio de
 * cuotas, la foto del cuadro de honor, el mantenimiento), el respaldo de
 * anoche o el disco que se llena. Nada de eso da un error en ninguna pantalla
 * de los liceos; aquí se ve. Lo da `GET /api/superadmin/monitoring/health` (por `/api/superadmin/salud`).
 */

interface Tarea {
    ultimaVez: string;
    ultimaVezBien: string | null;
    error: string | null;
    salud: 'bien' | 'atrasada' | 'fallando';
}

interface Salud {
    status: 'healthy' | 'degraded' | 'critical' | string;
    respaldos?: { salud: string; ultimaVezBien: string | null };
    tareas?: Record<string, Tarea>;
    tareasMal?: string[];
    disco?: { libreGB: number; totalGB: number; libre: number } | null;
}

const NOMBRES: Record<string, string> = {
    mantenimiento: 'Mantenimiento (lo viejo)',
    'cuadro-de-honor': 'Foto del cuadro de honor',
    'recordatorio-de-cuotas': 'Recordatorio de cuotas',
    'estado-de-los-anos': 'Estado de los años escolares',
    almacenamiento: 'Espacio de cada liceo',
};

const COLOR: Record<string, string> = {
    bien: 'bg-green-500/15 text-green-300 border-green-500/40',
    'al-dia': 'bg-green-500/15 text-green-300 border-green-500/40',
    atrasada: 'bg-yellow-500/15 text-yellow-200 border-yellow-500/40',
    atrasado: 'bg-yellow-500/15 text-yellow-200 border-yellow-500/40',
    'sin-programar': 'bg-yellow-500/15 text-yellow-200 border-yellow-500/40',
    fallando: 'bg-red-500/15 text-red-300 border-red-500/40',
    fallo: 'bg-red-500/15 text-red-300 border-red-500/40',
};

const cuando = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'nunca';

export function SaludDelSistema() {
    const [salud, setSalud] = useState<Salud | null>(null);
    const [error, setError] = useState(false);

    const cargar = useCallback(async () => {
        try {
            // Con algo crítico responde 503, y el cuerpo dice qué: se lee igual.
            const r = await superAdminFetch('/api/superadmin/salud');
            setSalud(await r.json());
            setError(false);
        } catch {
            setError(true);
        }
    }, []);

    useEffect(() => {
        void cargar();
        const t = window.setInterval(() => void cargar(), 60_000);
        return () => window.clearInterval(t);
    }, [cargar]);

    if (error) return <p className="mb-8 rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">No se pudo leer la salud del sistema.</p>;
    if (!salud) return null;

    const general =
        salud.status === 'healthy'
            ? { texto: 'Todo bien', clase: COLOR.bien }
            : salud.status === 'degraded'
              ? { texto: 'Algo no va bien', clase: COLOR.atrasada }
              : { texto: 'Hay algo grave', clase: COLOR.fallando };
    const tareas = Object.entries(salud.tareas ?? {});
    const disco = salud.disco;
    const discoSalud = !disco ? null : disco.libre < 0.1 ? 'fallo' : disco.libre < 0.2 ? 'atrasado' : 'bien';

    return (
        <section aria-labelledby="salud-del-sistema" className="mb-8 rounded-lg border border-gray-700 bg-gray-800 p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 id="salud-del-sistema" className="text-lg font-bold text-white">
                    Salud del sistema
                </h2>
                <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${general.clase}`}>{general.texto}</span>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-gray-700/50 bg-gray-900/60 p-4">
                    <p className="text-sm text-gray-300">Respaldos</p>
                    <p className={`mt-2 inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${COLOR[salud.respaldos?.salud ?? 'fallo'] ?? COLOR.fallo}`}>
                        {salud.respaldos?.salud ?? 'sin datos'}
                    </p>
                    <p className="mt-2 text-xs text-gray-300">Último bien: {cuando(salud.respaldos?.ultimaVezBien)}</p>
                </div>
                <div className="rounded-xl border border-gray-700/50 bg-gray-900/60 p-4">
                    <p className="text-sm text-gray-300">Disco</p>
                    {disco ? (
                        <>
                            <p className={`mt-2 inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${COLOR[discoSalud!]}`}>
                                {Math.round(disco.libre * 100)} % libre
                            </p>
                            <p className="mt-2 text-xs text-gray-300">
                                {disco.libreGB} GB libres de {disco.totalGB} GB
                            </p>
                        </>
                    ) : (
                        <p className="mt-2 text-xs text-gray-300">No se pudo medir</p>
                    )}
                </div>
                <div className="rounded-xl border border-gray-700/50 bg-gray-900/60 p-4">
                    <p className="text-sm text-gray-300">Tareas automáticas</p>
                    <ul className="mt-2 space-y-1.5">
                        {tareas.length === 0 && <li className="text-xs text-gray-300">Ninguna ha corrido todavía en este servidor.</li>}
                        {tareas.map(([nombre, t]) => (
                            <li key={nombre} className="flex items-center justify-between gap-2 text-xs">
                                <span className="text-gray-200" title={t.error ?? undefined}>
                                    {NOMBRES[nombre] ?? nombre}
                                </span>
                                <span className={`shrink-0 rounded-full border px-2 py-0.5 font-semibold ${COLOR[t.salud]}`} title={`Última vez bien: ${cuando(t.ultimaVezBien)}`}>
                                    {t.salud}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </section>
    );
}

export default SaludDelSistema;
