'use client';

import { useState, useEffect } from 'react';
import { Save, Bell, Mail, Smartphone, RefreshCw } from 'lucide-react';
import { instituteService } from '@/services/institute.service';
import { toast } from 'sonner';

interface NotificationConfig {
    channels: {
        email: boolean;
        inApp: boolean;
    };
    types: {
        academic: boolean; // Notas, asistencias
        administrative: boolean; // Pagos, documentos
        security: boolean; // Accesos, cambios de contraseña
    };
}

const DEFAULT_CONFIG: NotificationConfig = {
    channels: {
        email: true,
        inApp: true
    },
    types: {
        academic: true,
        administrative: true,
        security: true
    }
};

export function NotificationSettings() {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    // Estado local para la configuración de notificaciones
    const [config, setConfig] = useState<NotificationConfig>(DEFAULT_CONFIG);

    useEffect(() => {
        loadConfig();
    }, []);

    const loadConfig = async () => {
        try {
            setLoading(true);
            const data = await instituteService.getConfig();

            // Parsear la configuración existente si existe
            if (data.configuration) {
                try {
                    const parsedConfig = JSON.parse(data.configuration);
                    if (parsedConfig.notifications) {
                        // Merge con defaults para asegurar que existan todas las keys
                        setConfig({
                            channels: { ...DEFAULT_CONFIG.channels, ...parsedConfig.notifications.channels },
                            types: { ...DEFAULT_CONFIG.types, ...parsedConfig.notifications.types }
                        });
                    }
                } catch (e) {
                    console.error("Error parsing configuration JSON", e);
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

            // Primero obtenemos la config actual completa para no perder otros settings (como academic settings)
            const currentData = await instituteService.getConfig();
            let currentConfigObj = {};
            if (currentData.configuration) {
                try {
                    currentConfigObj = JSON.parse(currentData.configuration);
                } catch (e) { /* ignore */ }
            }

            // Actualizamos solo la parte de notificaciones
            const newConfigObj = {
                ...currentConfigObj,
                notifications: config
            };

            // Enviamos al backend
            await instituteService.updateConfig({
                configuration: newConfigObj as any
                // Type assertion needed because UpdateInstituteDto defines specific shape, 
                // but we passing the whole specific object structure which matches the updated DTO
            });

            toast.success('Preferencias de notificaciones guardadas');
        } catch (error) {
            console.error(error);
            toast.error('Error al guardar cambios');
        } finally {
            setSaving(false);
        }
    };

    const toggleChannel = (channel: keyof NotificationConfig['channels']) => {
        setConfig(prev => ({
            ...prev,
            channels: {
                ...prev.channels,
                [channel]: !prev.channels[channel]
            }
        }));
    };

    const toggleType = (type: keyof NotificationConfig['types']) => {
        setConfig(prev => ({
            ...prev,
            types: {
                ...prev.types,
                [type]: !prev.types[type]
            }
        }));
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
            <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Canales de Notificación</h3>
                <p className="text-sm text-gray-600 mb-4">
                    Selecciona los medios por los cuales el sistema enviará alertas a usuarios y administradores.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Email Channel */}
                    <div className={`p-4 border rounded-lg cursor-pointer transition-all ${config.channels.email ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}
                        onClick={() => toggleChannel('email')} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleChannel('email'); } }}>
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-full ${config.channels.email ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-500'}`}>
                                <Mail className="w-5 h-5" />
                            </div>
                            <div className="flex-1">
                                <h4 className="text-sm font-semibold text-gray-900">Correo Electrónico</h4>
                                <p className="text-xs text-gray-500">Enviar alertas a la dirección de email registrada.</p>
                            </div>
                            <div className={`w-10 h-5 rounded-full relative transition-colors ${config.channels.email ? 'bg-indigo-600' : 'bg-gray-300'}`}>
                                <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${config.channels.email ? 'translate-x-5' : 'translate-x-0'}`}></div>
                            </div>
                        </div>
                    </div>

                    {/* In-App Channel */}
                    <div className={`p-4 border rounded-lg cursor-pointer transition-all ${config.channels.inApp ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}
                        onClick={() => toggleChannel('inApp')} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleChannel('inApp'); } }}>
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-full ${config.channels.inApp ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-500'}`}>
                                <Bell className="w-5 h-5" />
                            </div>
                            <div className="flex-1">
                                <h4 className="text-sm font-semibold text-gray-900">Notificaciones en Sistema</h4>
                                <p className="text-xs text-gray-500">Mostrar alertas dentro de la plataforma (campana).</p>
                            </div>
                            <div className={`w-10 h-5 rounded-full relative transition-colors ${config.channels.inApp ? 'bg-indigo-600' : 'bg-gray-300'}`}>
                                <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${config.channels.inApp ? 'translate-x-5' : 'translate-x-0'}`}></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="border-t border-gray-200 pt-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Tipos de Alertas Activas</h3>
                <p className="text-sm text-gray-600 mb-4">
                    Define qué categorías de eventos generarán notificaciones automaticas.
                </p>

                <div className="space-y-3">
                    {/* Academic */}
                    <label aria-label="Académicas" className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                        <div className="flex items-center gap-3">
                            <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                            <div>
                                <span className="text-sm font-medium text-gray-900 block">Académicas</span>
                                <span className="text-xs text-gray-500 block">Nuevas calificaciones, inasistencias, reportes de conducta.</span>
                            </div>
                        </div>
                        <input
                            type="checkbox"
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                            checked={config.types.academic}
                            onChange={() => toggleType('academic')}
                        />
                    </label>

                    {/* Administrative */}
                    <label aria-label="Administrativas" className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                        <div className="flex items-center gap-3">
                            <div className="h-2 w-2 rounded-full bg-orange-500"></div>
                            <div>
                                <span className="text-sm font-medium text-gray-900 block">Administrativas</span>
                                <span className="text-xs text-gray-500 block">Recordatorios de pago, comunicados oficiales, eventos.</span>
                            </div>
                        </div>
                        <input
                            type="checkbox"
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                            checked={config.types.administrative}
                            onChange={() => toggleType('administrative')}
                        />
                    </label>

                    {/* Security */}
                    <label aria-label="Seguridad" className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                        <div className="flex items-center gap-3">
                            <div className="h-2 w-2 rounded-full bg-red-500"></div>
                            <div>
                                <span className="text-sm font-medium text-gray-900 block">Seguridad</span>
                                <span className="text-xs text-gray-500 block">Inicios de sesión sospechosos, cambios de contraseña, intentos fallidos.</span>
                            </div>
                        </div>
                        <input
                            type="checkbox"
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                            checked={config.types.security}
                            onChange={() => toggleType('security')}
                        />
                    </label>
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
                            Guardar Preferencias
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
