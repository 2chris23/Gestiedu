'use client';

import { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, Shield, Clock, Lock, AlertTriangle, RefreshCw } from 'lucide-react';
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
 * Tarjeta de "Sesiones activas": lista dispositivos del usuario autenticado
 * y permite revocar cada uno individualmente (endpoints /api/auth/sessions).
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
            const res = await fetch(`/api/auth/sessions/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('error');
            toast.success('Sesión revocada correctamente');
            load();
        } catch {
            toast.error('No se pudo revocar la sesión');
        }
    };

    const dateFmt = (iso: string) =>
        new Date(iso).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    return (
        <div className="mt-8">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-indigo-50 rounded-lg">
                        <Clock className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                        <h2 className="text-base font-bold text-gray-900">Sesiones activas</h2>
                        <p className="text-xs text-gray-500">Dispositivos con la sesión abierta. Cierra los que no reconozcas.</p>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
                </div>
            ) : sessions.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No hay sesiones activas.</p>
            ) : (
                <div className="space-y-2">
                    {sessions.map(s => (
                        <div key={s.id} className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-4 py-3">
                            <div className="w-9 h-9 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0">
                                <Lock className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-sm font-semibold text-gray-800 truncate">
                                        {s.userAgent || 'Dispositivo desconocido'}
                                    </p>
                                    {s.isCurrent && (
                                        <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-md">ESTE DISPOSITIVO</span>
                                    )}
                                    {s.rememberMe && (
                                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md">RECORDAR SESIÓN</span>
                                    )}
                                </div>
                                <p className="text-xs text-gray-400 truncate">
                                    {s.ip ? `IP: ${s.ip} · ` : ''}
                                    Último uso: {dateFmt(s.lastUsedAt)} · Creada: {dateFmt(s.createdAt)}
                                </p>
                            </div>
                            <button
                                onClick={() => revoke(s.id)}
                                className="px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors flex-shrink-0"
                            >
                                Cerrar sesión
                            </button>
                        </div>
                    ))}
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
