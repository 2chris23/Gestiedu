'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Laptop, Lock, RefreshCw, ShieldAlert, Smartphone } from 'lucide-react';
import { Fila, Grupo } from '@/components/configuracion/ajustes';

/**
 * DÓNDE TENGO LA SESIÓN ABIERTA (en Configuración → Contraseña y acceso)
 *
 * Vivía en la Seguridad del liceo, pero son las sesiones de quien mira, no
 * del liceo: ahora cualquiera las ve y cierra las suyas. Cada aparato con su
 * última vez; «Cerrar» en cada uno y «Cerrar las demás» al pie.
 */
interface Sesion {
    id: string;
    userAgent: string | null;
    ip: string | null;
    createdAt: string;
    lastUsedAt: string;
    rememberMe: boolean;
    isCurrent: boolean;
}

function elAparato(ua: string | null): { nombre: string; tipo: 'ordenador' | 'telefono' | 'programa' } {
    if (!ua) return { nombre: 'Un aparato', tipo: 'ordenador' };
    if (ua.includes('node') || ua.includes('axios') || ua.includes('PowerShell')) return { nombre: 'Un programa (API)', tipo: 'programa' };
    const telefono = /Android|iPhone|iPad|Mobile/i.test(ua);
    const navegador = ua.includes('Edg/') ? 'Edge' : ua.includes('Chrome/') ? 'Chrome' : ua.includes('Firefox/') ? 'Firefox' : ua.includes('Safari/') ? 'Safari' : 'Navegador';
    const sistema = ua.includes('Windows')
        ? 'Windows'
        : ua.includes('Mac OS') || ua.includes('Macintosh')
          ? 'Mac'
          : ua.includes('Android')
            ? 'Android'
            : ua.includes('iPhone') || ua.includes('iPad')
              ? 'iPhone o iPad'
              : ua.includes('Linux')
                ? 'Linux'
                : '';
    return { nombre: sistema ? `${sistema} · ${navegador}` : navegador, tipo: telefono ? 'telefono' : 'ordenador' };
}

const cuando = (iso: string) =>
    new Date(iso).toLocaleString('es-VE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function MisSesiones() {
    const [sesiones, setSesiones] = useState<Sesion[]>([]);
    const [cargando, setCargando] = useState(true);
    const [cerrando, setCerrando] = useState<string | null>(null);

    const cargar = async () => {
        try {
            setCargando(true);
            const r = await fetch('/api/auth/sessions');
            if (!r.ok) throw new Error('error');
            setSesiones((await r.json()).sessions || []);
        } catch {
            setSesiones([]);
        } finally {
            setCargando(false);
        }
    };
    useEffect(() => {
        void cargar();
    }, []);

    const cerrar = async (id: string | 'demas') => {
        try {
            setCerrando(id);
            const r = await fetch(id === 'demas' ? '/api/auth/sessions' : `/api/auth/sessions/${id}`, { method: 'DELETE' });
            if (!r.ok) throw new Error('error');
            toast.success(id === 'demas' ? 'Cerraste la sesión en los demás aparatos' : 'Sesión cerrada en ese aparato');
            await cargar();
        } catch {
            toast.error('No se pudo cerrar');
        } finally {
            setCerrando(null);
        }
    };

    if (cargando && sesiones.length === 0) return null;
    if (sesiones.length === 0) return null;

    return (
        <Grupo
            id="sesiones"
            titulo="Sesiones abiertas"
            descripcion="Los aparatos donde está abierta tu cuenta. Si no reconoces uno, ciérralo y cambia tu contraseña."
        >
            {sesiones.map((s) => {
                const aparato = elAparato(s.userAgent);
                const Icono = aparato.tipo === 'telefono' ? Smartphone : aparato.tipo === 'programa' ? Lock : Laptop;
                return (
                    <Fila key={s.id} icono={Icono} etiqueta={aparato.nombre} descripcion={s.isCurrent ? 'Este aparato · ahora' : `Última vez: ${cuando(s.lastUsedAt)}`}>
                        {s.isCurrent ? (
                            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Este</span>
                        ) : (
                            <button
                                type="button"
                                onClick={() => void cerrar(s.id)}
                                disabled={cerrando !== null}
                                className="min-h-[40px] rounded-full bg-red-50 px-4 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                            >
                                {cerrando === s.id ? 'Cerrando…' : 'Cerrar'}
                            </button>
                        )}
                    </Fila>
                );
            })}
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <button
                    type="button"
                    onClick={() => void cargar()}
                    className="flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"
                >
                    <RefreshCw className="h-4 w-4" aria-hidden /> Actualizar
                </button>
                {sesiones.length > 1 && (
                    <button
                        type="button"
                        onClick={() => void cerrar('demas')}
                        disabled={cerrando !== null}
                        className="flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-red-700 hover:text-red-800 disabled:opacity-50"
                    >
                        <ShieldAlert className="h-4 w-4" aria-hidden />
                        {cerrando === 'demas' ? 'Cerrando…' : 'Cerrar las demás'}
                    </button>
                )}
            </div>
        </Grupo>
    );
}

export default MisSesiones;
