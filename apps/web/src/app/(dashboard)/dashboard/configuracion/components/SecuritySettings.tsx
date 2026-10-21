'use client';

import { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Shield, Clock, Lock } from 'lucide-react';
import { Ajustes, BotonGuardar, CargandoAjustes, Fila, FilaInterruptor, Grupo } from '@/components/configuracion/ajustes';
import { instituteService } from '@/services/institute.service';
import { toast } from 'sonner';
import { esPendiente } from '@/lib/por-enviar';
import { esQueNoContesta } from '@/lib/estado-del-servidor';

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
            if (!esQueNoContesta(error)) toast.error('Error al cargar la configuración');
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

            const r = await instituteService.updateConfig({
                configuration: newConfigObj as any
            });

            if (esPendiente(r)) toast('Sin conexión: el cambio quedó pendiente ⏱ y se guarda solo al volver.', { id: 'pendiente' });
            else toast.success('Configuración de seguridad actualizada');
        } catch (error) {
            console.error(error);
            toast.error('Error al guardar cambios');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <CargandoAjustes />;

    const clave = config.passwordComplexity;
    const ponerClave = (c: Partial<SecurityConfig['passwordComplexity']>) => setConfig({ ...config, passwordComplexity: { ...clave, ...c } });

    return (
        <Ajustes>
            <Grupo id="sesion" titulo="Sesión y Tiempo de Espera">
                <Fila icono={Clock} etiqueta="Cerrar la sesión tras" descripcion="Minutos sin usar la app, para todos en el liceo." apilada>
                    <div className="flex items-center gap-4">
                        <input
                            id="sessionTimeout"
                            aria-label="Tiempo de inactividad (minutos)"
                            type="range"
                            min="15"
                            max="240"
                            step="15"
                            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-gray-200 accent-indigo-600"
                            value={config.sessionTimeout}
                            onChange={(e) => setConfig({ ...config, sessionTimeout: Number(e.target.value) })}
                        />
                        <span className="w-16 shrink-0 text-right text-[15px] font-semibold tabular-nums text-gray-900">{config.sessionTimeout} min</span>
                    </div>
                </Fila>
            </Grupo>

            <Grupo id="contrasenas" titulo="Contraseñas" pie="Valen para las contraseñas nuevas; las de antes siguen sirviendo.">
                <Fila icono={Lock} etiqueta="Largo mínimo">
                    <Select value={String(clave.minLength)} onValueChange={(v) => ponerClave({ minLength: Number(v) })}>
                        <SelectTrigger aria-label="Longitud mínima" className="h-auto min-h-[40px] w-auto gap-1.5 rounded-xl border-0 bg-gray-100 px-3 text-[15px] shadow-none">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {['6', '8', '10', '12'].map((n) => (
                                <SelectItem key={n} value={n}>
                                    {n} letras
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Fila>
                <FilaInterruptor titulo="Con algún número" checked={clave.requireNumbers} onChange={(v) => ponerClave({ requireNumbers: v })} />
                <FilaInterruptor titulo="Con algún símbolo" descripcion="Como !, @, # o $." checked={clave.requireSpecialChars} onChange={(v) => ponerClave({ requireSpecialChars: v })} />
            </Grupo>

            <Grupo id="intentos" titulo="Contra quien adivina" pie="Pasado el límite, la cuenta se bloquea un rato.">
                <Fila icono={Shield} etiqueta="Intentos para entrar">
                    <Select value={String(config.maxLoginAttempts)} onValueChange={(v) => setConfig({ ...config, maxLoginAttempts: Number(v) })}>
                        <SelectTrigger id="maxLoginAttempts" aria-label="Intentos máximos de inicio de sesión" className="h-auto min-h-[40px] w-auto gap-1.5 rounded-xl border-0 bg-gray-100 px-3 text-[15px] shadow-none">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="3">3</SelectItem>
                            <SelectItem value="5">5 (recomendado)</SelectItem>
                        </SelectContent>
                    </Select>
                </Fila>
            </Grupo>

            <BotonGuardar type="button" texto="Guardar Configuración" onClick={handleSave} guardando={saving} />
        </Ajustes>
    );
}
