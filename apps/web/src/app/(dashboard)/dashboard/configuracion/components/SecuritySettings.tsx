'use client';

import { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, Shield, Clock, Lock, AlertTriangle, RefreshCw, Laptop, Smartphone, ShieldAlert, Trash2 } from 'lucide-react';
import { instituteService } from '@/services/institute.service';
import { toast } from 'sonner';

interface SecurityConfig {
    sessionTimeout: number;
    passwordComplexity: {
        minLength: number;
        requireSpecialChars: boolean;
        requireNumbers: boolean;
    };
    maxLoginAttempts: number;
}

const DEFAULT_CONFIG: SecurityConfig = {
    sessionTimeout: 60,
    passwordComplexity: {
        minLength: 8,
        requireSpecialChars: true,
        requireNumbers: true
    },
    maxLoginAttempts: 5
};

export function SecuritySettings() {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const [config, setConfig] = useState<SecurityConfig>(DEFAULT_CONFIG);

    useEffect(() => {
        loadConfig();
    }, []);

    const loadConfig = async () => {
        try {
            setLoading(true);
            const data = await instituteService.getConfig();

            if (data.configuration) {
                try {
                    const parsedConfig = JSON.parse(data.configuration);
                    if (parsedConfig.security) {
                        setConfig({
                            sessionTimeout: parsedConfig.security.sessionTimeout || DEFAULT_CONFIG.sessionTimeout,
                            maxLoginAttempts: parsedConfig.security.maxLoginAttempts || DEFAULT_CONFIG.maxLoginAttempts,
                            passwordComplexity: {
                                ...DEFAULT_CONFIG.passwordComplexity,
                                ...parsedConfig.security.passwordComplexity
                            }
                        });
                    }
                } catch (e) {
                    // ignore parse error or invalid structure
                }
            }
        } catch (error) {
            console.error(error);
            toast.error('Error al cargar la configuración');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        try {
            setSaving(true);

            const currentData = await instituteService.getConfig();
            let currentConfigObj = {};
            if (currentData.configuration) {
                try {
                    currentConfigObj = JSON.parse(currentData.configuration);
                } catch (e) { /* ignore */ }
            }

            const newConfigObj = {
                ...currentConfigObj,
                security: config
            };

            await instituteService.updateConfig({
                configuration: newConfigObj as any
            });

            toast.success('Configuración de seguridad actualizada');
        } catch (error) {
            console.error(error);
            toast.error('Error al guardar cambios');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Session Settings */}
            <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-gray-400" />
                    Sesión y Tiempo de Espera
                </h3>
                <div className="bg-white p-6 border border-gray-200 rounded-lg shadow-sm">
                    <div className="max-w-md">
                        <label htmlFor="sessionTimeout" className="block text-sm font-medium text-gray-700 mb-2">
                            Tiempo de inactividad (minutos)
                        </label>
                        <div className="flex items-center gap-4">
                            <input
                                id="sessionTimeout"
                                type="range"
                                min="15"
                                max="240"
                                step="15"
                                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                value={config.sessionTimeout}
                                onChange={(e) => setConfig({ ...config, sessionTimeout: Number(e.target.value) })}
                            />
                            <span className="text-sm font-bold text-gray-700 w-16 text-right">
                                {config.sessionTimeout} min
                            </span>
                        </div>
                        <p className="mt-2 text-xs text-gray-500">
                            Tiempo máximo que un usuario puede permanecer inactivo antes de cerrar sesión automáticamente.
                        </p>
                    </div>
                </div>
            </div>

            {/* Password Policy */}
            <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
                    <Lock className="w-5 h-5 text-gray-400" />
                    Política de Contraseñas
                </h3>
                <div className="bg-white p-6 border border-gray-200 rounded-lg shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <span className="text-sm font-medium text-gray-900 block">Longitud mínima</span>
                            <span className="text-xs text-gray-500">Número mínimo de caracteres requeridos.</span>
                        </div>
                        <Select
                            value={String(config.passwordComplexity.minLength)}
                            onValueChange={(v) => setConfig({
                                ...config,
                                passwordComplexity: { ...config.passwordComplexity, minLength: Number(v) }
                            })}
                        >
                            <SelectTrigger className="w-24">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="6">6</SelectItem>
                                <SelectItem value="8">8</SelectItem>
                                <SelectItem value="10">10</SelectItem>
                                <SelectItem value="12">12</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                        <div>
                            <span className="text-sm font-medium text-gray-900 block">Requerir números</span>
                            <span className="text-xs text-gray-500">La contraseña debe contener al menos un dígito.</span>
                        </div>
                        <div className={`w-10 h-5 rounded-full relative transition-colors cursor-pointer ${config.passwordComplexity.requireNumbers ? 'bg-indigo-600' : 'bg-gray-300'}`}
                            onClick={() => setConfig({
                                ...config,
                                passwordComplexity: { ...config.passwordComplexity, requireNumbers: !config.passwordComplexity.requireNumbers }
                            })}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    setConfig({
                                        ...config,
                                        passwordComplexity: { ...config.passwordComplexity, requireNumbers: !config.passwordComplexity.requireNumbers }
                                    });
                                }
                            }}>
                            <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${config.passwordComplexity.requireNumbers ? 'translate-x-5' : 'translate-x-0'}`}></div>
                        </div>
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                        <div>
                            <span className="text-sm font-medium text-gray-900 block">Requerir caracteres especiales</span>
                            <span className="text-xs text-gray-500">La contraseña debe contener al menos un símbolo (!@#$%).</span>
                        </div>
                        <div className={`w-10 h-5 rounded-full relative transition-colors cursor-pointer ${config.passwordComplexity.requireSpecialChars ? 'bg-indigo-600' : 'bg-gray-300'}`}
                            onClick={() => setConfig({
                                ...config,
                                passwordComplexity: { ...config.passwordComplexity, requireSpecialChars: !config.passwordComplexity.requireSpecialChars }
                            })}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    setConfig({
                                        ...config,
                                        passwordComplexity: { ...config.passwordComplexity, requireSpecialChars: !config.passwordComplexity.requireSpecialChars }
                                    });
                                }
                            }}>
                            <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${config.passwordComplexity.requireSpecialChars ? 'translate-x-5' : 'translate-x-0'}`}></div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Login Attempts */}
            <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
                    <Shield className="w-5 h-5 text-gray-400" />
                    Protección contra Fuerza Bruta
                </h3>
                <div className="bg-white p-6 border border-gray-200 rounded-lg shadow-sm">
                    <div className="max-w-md">
                        <label htmlFor="maxLoginAttempts" className="block text-sm font-medium text-gray-700 mb-2">
                            Intentos máximos de inicio de sesión
                        </label>
                    <Select value={String(config.maxLoginAttempts)} onValueChange={(v) => setConfig({ ...config, maxLoginAttempts: Number(v) })}>
                        <SelectTrigger className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="3">3 intentos</SelectItem>
                            <SelectItem value="5">5 intentos (Recomendado)</SelectItem>
                        </SelectContent>
                    </Select>
                        <p className="mt-2 text-xs text-gray-500 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-yellow-600" />
                            La cuenta se bloqueará temporalmente tras exceder este límite.
                        </p>
                    </div>
                </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end pt-6 border-t border-gray-200">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {saving ? (
                        <>
                            <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                            Guardando...
                        </>
                    ) : (
                        <>
                            <Save className="w-5 h-5 mr-2" />
                            Guardar Configuración
                        </>
                    )}
                </button>
            </div>

            <ActiveSessions />
        </div>
    );
}

/**
 * Ayudante para interpretar y mostrar de forma amigable el User-Agent
 */
function parseDevice(ua: string | null): { name: string; type: 'desktop' | 'mobile' | 'bot' } {
    if (!ua) return { name: 'Dispositivo desconocido', type: 'desktop' };
    if (ua.includes('node') || ua.includes('axios') || ua.includes('PowerShell')) {
        return { name: 'Script automatizado / API', type: 'bot' };
    }
    const isMobile = /Android|iPhone|iPad|Mobile/i.test(ua);
    let browser = 'Navegador web';
    if (ua.includes('Edg/')) browser = 'Microsoft Edge';
    else if (ua.includes('Chrome/')) browser = 'Google Chrome';
    else if (ua.includes('Firefox/')) browser = 'Mozilla Firefox';
    else if (ua.includes('Safari/') && !ua.includes('Chrome')) browser = 'Apple Safari';

    let os = '';
    if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Macintosh') || ua.includes('Mac OS')) os = 'macOS';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
    else if (ua.includes('Linux')) os = 'Linux';

    const name = os ? `${browser} (${os})` : browser;
    return { name, type: isMobile ? 'mobile' : 'desktop' };
}

/**
 * Tarjeta de "Sesiones activas": lista dispositivos del usuario autenticado
 * y permite revocar cada uno individualmente o cerrar todas las demás sesiones.
 */
function ActiveSessions() {
    const [sessions, setSessions] = useState<Array<{
        id: string;
        userAgent: string | null;
        ip: string | null;
        createdAt: string;
        lastUsedAt: string;
        rememberMe: boolean;
        isCurrent: boolean;
    }>>([]);
    const [loading, setLoading] = useState(true);
    const [revokingId, setRevokingId] = useState<string | null>(null);
    const [revokingOthers, setRevokingOthers] = useState(false);

    const load = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/auth/sessions');
            if (!res.ok) throw new Error('error');
            const data = await res.json();
            setSessions(data.sessions || []);
        } catch {
            setSessions([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const revoke = async (id: string) => {
        try {
            setRevokingId(id);
            const res = await fetch(`/api/auth/sessions/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('error');
            toast.success('Sesión revocada correctamente');
            await load();
        } catch {
            toast.error('No se pudo revocar la sesión');
        } finally {
            setRevokingId(null);
        }
    };

    const revokeOthers = async () => {
        try {
            setRevokingOthers(true);
            const res = await fetch('/api/auth/sessions', { method: 'DELETE' });
            if (!res.ok) throw new Error('error');
            toast.success('Todas las demás sesiones fueron cerradas con éxito');
            await load();
        } catch {
            toast.error('No se pudieron cerrar las demás sesiones');
        } finally {
            setRevokingOthers(false);
        }
    };

    const dateFmt = (iso: string) =>
        new Date(iso).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    return (
        <div className="mt-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-indigo-50 rounded-lg">
                        <Clock className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                        <h2 className="text-base font-bold text-gray-900">Sesiones activas</h2>
                        <p className="text-xs text-gray-500">
                            Dispositivos conectados con tu cuenta. Si solo usas este equipo, debe ser el único activo.
                        </p>
                    </div>
                </div>

                {sessions.length > 1 && (
                    <button
                        onClick={revokeOthers}
                        disabled={revokingOthers}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors shadow-sm disabled:opacity-50 flex-shrink-0"
                    >
                        <ShieldAlert className="w-4 h-4 text-amber-600" />
                        {revokingOthers ? 'Cerrando sesiones...' : 'Cerrar todas las demás sesiones'}
                    </button>
                )}
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
                </div>
            ) : sessions.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No hay sesiones activas.</p>
            ) : (
                <div className="space-y-2">
                    {sessions.map(s => {
                        const device = parseDevice(s.userAgent);
                        const DeviceIcon = device.type === 'mobile' ? Smartphone : device.type === 'bot' ? Lock : Laptop;

                        return (
                            <div key={s.id} className={`flex items-center gap-3 bg-white border rounded-lg px-4 py-3 transition-colors ${s.isCurrent ? 'border-indigo-300 bg-indigo-50/20' : 'border-gray-200'}`}>
                                <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${s.isCurrent ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'}`}>
                                    <DeviceIcon className="w-4 h-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <p className="text-sm font-semibold text-gray-800 truncate">
                                            {device.name}
                                        </p>
                                        {s.isCurrent && (
                                            <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100/70 border border-indigo-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                                ESTE DISPOSITIVO
                                            </span>
                                        )}
                                        {s.rememberMe && (
                                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md">
                                                RECORDAR SESIÓN
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-400 truncate mt-0.5">
                                        {s.ip ? `IP: ${s.ip} · ` : ''}
                                        Último uso: {dateFmt(s.lastUsedAt)} · Creada: {dateFmt(s.createdAt)}
                                    </p>
                                </div>

                                {s.isCurrent ? (
                                    <span className="text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-200/60 px-2.5 py-1 rounded-md flex items-center gap-1.5 flex-shrink-0">
                                        Sesión actual
                                    </span>
                                ) : (
                                    <button
                                        onClick={() => revoke(s.id)}
                                        disabled={revokingId === s.id}
                                        className="px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-100 rounded-lg transition-colors flex-shrink-0 disabled:opacity-50 inline-flex items-center gap-1"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        {revokingId === s.id ? 'Cerrando...' : 'Cerrar sesión'}
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            <button
                onClick={load}
                className="mt-3 text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
            >
                <RefreshCw className="w-3.5 h-3.5" />
                Refrescar lista
            </button>
        </div>
    );
}
