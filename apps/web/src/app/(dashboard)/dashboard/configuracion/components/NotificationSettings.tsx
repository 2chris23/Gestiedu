'use client';

import { useState, useEffect } from 'react';
import { Bell, Mail, GraduationCap, FileText, ShieldAlert } from 'lucide-react';
import { Ajustes, BotonGuardar, CargandoAjustes, FilaInterruptor, Grupo } from '@/components/configuracion/ajustes';
import { instituteService } from '@/services/institute.service';
import { toast } from 'sonner';
import { esPendiente } from '@/lib/por-enviar';
import { esQueNoContesta } from '@/lib/estado-del-servidor';

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
            if (!esQueNoContesta(error)) toast.error('Error al cargar la configuración');
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
            const r = await instituteService.updateConfig({
                configuration: newConfigObj as any
                // Type assertion needed because UpdateInstituteDto defines specific shape, 
                // but we passing the whole specific object structure which matches the updated DTO
            });

            if (esPendiente(r)) toast('Sin conexión: el cambio quedó pendiente ⏱ y se guarda solo al volver.', { id: 'pendiente' });
            else toast.success('Preferencias de notificaciones guardadas');
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

    if (loading) return <CargandoAjustes />;

    return (
        <Ajustes>
            <Grupo id="canales" titulo="Cómo se avisa" descripcion="Por dónde el sistema manda las alertas a la gente del liceo.">
                <FilaInterruptor
                    icono={Mail}
                    titulo="Correo electrónico"
                    descripcion="A la dirección registrada de cada uno."
                    checked={config.channels.email}
                    onChange={() => toggleChannel('email')}
                />
                <FilaInterruptor
                    icono={Bell}
                    titulo="En la app"
                    descripcion="En la campana y, con la app instalada, en el teléfono."
                    checked={config.channels.inApp}
                    onChange={() => toggleChannel('inApp')}
                />
            </Grupo>

            <Grupo id="tipos" titulo="Qué se avisa">
                <FilaInterruptor
                    icono={GraduationCap}
                    titulo="Académicas"
                    descripcion="Notas nuevas, inasistencias, conducta."
                    checked={config.types.academic}
                    onChange={() => toggleType('academic')}
                />
                <FilaInterruptor
                    icono={FileText}
                    titulo="Administrativas"
                    descripcion="Recordatorios de pago, comunicados, eventos."
                    checked={config.types.administrative}
                    onChange={() => toggleType('administrative')}
                />
                <FilaInterruptor
                    icono={ShieldAlert}
                    titulo="Seguridad"
                    descripcion="Entradas raras, cambios de contraseña, intentos fallidos."
                    checked={config.types.security}
                    onChange={() => toggleType('security')}
                />
            </Grupo>

            <BotonGuardar type="button" texto="Guardar Preferencias" onClick={handleSave} guardando={saving} />
        </Ajustes>
    );
}
