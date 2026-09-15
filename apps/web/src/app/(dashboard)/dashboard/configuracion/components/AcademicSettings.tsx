'use client';

import { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, GraduationCap, Globe, Calendar, Clock } from 'lucide-react';
import { instituteService, type InstituteConfig } from '@/services/institute.service';
import { toast } from 'sonner';

export function AcademicSettings() {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [config, setConfig] = useState<InstituteConfig | null>(null);

    const [academicConfig, setAcademicConfig] = useState({
        timezone: 'America/Caracas',
        gradeScale: { min: 0, max: 20 },
        passingGrade: 10,
        asistenciaMinima: 80,
        language: 'es',
        dateFormat: 'DD/MM/YYYY',
        schedule: {
            startTime: '07:00',
            blockDuration: 45,
            totalBlocks: 7,
            breakAfterBlock: 3,
            breakDuration: 15
        }
    });

    useEffect(() => {
        loadConfig();
    }, []);

    const loadConfig = async () => {
        try {
            setLoading(true);
            const data = await instituteService.getConfig();
            setConfig(data);

            const rawConfig = data.configuration
                ? (typeof data.configuration === 'string' ? JSON.parse(data.configuration) : data.configuration)
                : (data as any).academicConfig;

            if (rawConfig) {
                setAcademicConfig({
                    timezone: data.timezone || rawConfig.timezone || 'America/Caracas',
                    gradeScale: rawConfig.gradeScale || { min: 0, max: 20 },
                    passingGrade: rawConfig.passingGrade ?? rawConfig.notaMinimaAprobatoria ?? 10,
                    asistenciaMinima: rawConfig.asistenciaMinima ?? 80,
                    language: rawConfig.language || 'es',
                    dateFormat: rawConfig.dateFormat || 'DD/MM/YYYY',
                    schedule: rawConfig.schedule || {
                        startTime: '07:00',
                        blockDuration: 45,
                        totalBlocks: 7,
                        breakAfterBlock: 3,
                        breakDuration: 15
                    }
                });
            } else if (data.timezone) {
                setAcademicConfig(prev => ({ ...prev, timezone: data.timezone || prev.timezone }));
            }
        } catch (error) {
            console.error(error);
            toast.error('Error al cargar la configuración');
        } finally {
            setLoading(false);
        }
    };

    const handleNumberChange = (setter: (val: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseInt(e.target.value, 10);
        setter(isNaN(val) ? 0 : val);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (academicConfig.gradeScale.min >= academicConfig.gradeScale.max) {
            toast.error('La calificación mínima debe ser menor que la máxima');
            return;
        }

        if (academicConfig.passingGrade < academicConfig.gradeScale.min || academicConfig.passingGrade > academicConfig.gradeScale.max) {
            toast.error(`La nota mínima aprobatoria debe estar entre ${academicConfig.gradeScale.min} y ${academicConfig.gradeScale.max}`);
            return;
        }

        if (academicConfig.asistenciaMinima < 0 || academicConfig.asistenciaMinima > 100) {
            toast.error('La asistencia mínima es un porcentaje: debe estar entre 0 y 100');
            return;
        }

        try {
            setSaving(true);
            await instituteService.updateConfig({
                configuration: academicConfig,
                timezone: academicConfig.timezone,
            });
            toast.success('Configuración académica actualizada exitosamente');
            await loadConfig();
        } catch (error) {
            console.error(error);
            toast.error('Error al guardar la configuración');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Cargando configuración...</p>
                </div>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                    <GraduationCap className="inline w-5 h-5 mr-2" />
                    Configuración Académica
                </h3>
                <p className="text-sm text-gray-600 mb-6">
                    Define los parámetros académicos que se usarán en todo el sistema.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Escala de Calificaciones - Min */}
                <div>
                    <label htmlFor="gradeScaleMin" className="block text-sm font-medium text-gray-700 mb-2">
                        Calificación Mínima
                    </label>
                    <input
                        id="gradeScaleMin"
                        type="number"
                        value={academicConfig.gradeScale.min}
                        onChange={handleNumberChange((min) => setAcademicConfig(prev => ({
                            ...prev,
                            gradeScale: { ...prev.gradeScale, min }
                        })))}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                        min="0"
                    />
                </div>

                {/* Escala de Calificaciones - Max */}
                <div>
                    <label htmlFor="gradeScaleMax" className="block text-sm font-medium text-gray-700 mb-2">
                        Calificación Máxima
                    </label>
                    <input
                        id="gradeScaleMax"
                        type="number"
                        value={academicConfig.gradeScale.max}
                        onChange={handleNumberChange((max) => setAcademicConfig(prev => ({
                            ...prev,
                            gradeScale: { ...prev.gradeScale, max }
                        })))}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                        min="1"
                    />
                </div>

                {/* Nota Aprobatoria */}
                <div>
                    <label htmlFor="passingGrade" className="block text-sm font-medium text-gray-700 mb-2">
                        Nota Mínima Aprobatoria
                    </label>
                    <input
                        id="passingGrade"
                        type="number"
                        value={academicConfig.passingGrade}
                        onChange={handleNumberChange((passingGrade) => setAcademicConfig(prev => ({
                            ...prev,
                            passingGrade
                        })))}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                        min={academicConfig.gradeScale.min}
                        max={academicConfig.gradeScale.max}
                    />
                    <p className="mt-1 text-xs text-gray-500">
                        Debe estar entre {academicConfig.gradeScale.min} y {academicConfig.gradeScale.max}
                    </p>
                </div>

                {/* Asistencia mínima */}
                <div>
                    <label htmlFor="asistenciaMinima" className="block text-sm font-medium text-gray-700 mb-2">
                        Asistencia Mínima (%)
                    </label>
                    <input
                        id="asistenciaMinima"
                        type="number"
                        value={academicConfig.asistenciaMinima}
                        onChange={handleNumberChange((asistenciaMinima) => setAcademicConfig(prev => ({
                            ...prev,
                            asistenciaMinima
                        })))}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                        min="0"
                        max="100"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                        Por debajo de este porcentaje se le avisa al representante. No reprueba ni afecta las notas.
                    </p>
                </div>

                {/* Zona Horaria */}
                <div>
                    <label htmlFor="timezone" className="block text-sm font-medium text-gray-700 mb-2">
                        <Globe className="inline w-4 h-4 mr-1" />
                        Zona Horaria
                    </label>
                    <Select value={academicConfig.timezone} onValueChange={(v) => setAcademicConfig(prev => ({ ...prev, timezone: v }))}>
                        <SelectTrigger className="w-full">
                            <SelectValue placeholder="Zona horaria" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="America/Caracas">Caracas (GMT-4)</SelectItem>
                            <SelectItem value="America/New_York">Nueva York (GMT-5)</SelectItem>
                            <SelectItem value="America/Mexico_City">Ciudad de México (GMT-6)</SelectItem>
                            <SelectItem value="America/Bogota">Bogotá (GMT-5)</SelectItem>
                            <SelectItem value="America/Lima">Lima (GMT-5)</SelectItem>
                            <SelectItem value="America/Argentina/Buenos_Aires">Buenos Aires (GMT-3)</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Idioma */}
                <div>
                    <label htmlFor="language" className="block text-sm font-medium text-gray-700 mb-2">
                        Idioma del Sistema
                    </label>
                    <Select value={academicConfig.language} onValueChange={(v) => setAcademicConfig(prev => ({ ...prev, language: v }))}>
                        <SelectTrigger className="w-full">
                            <SelectValue placeholder="Idioma" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="es">Español</SelectItem>
                            <SelectItem value="en">English</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Formato de Fecha */}
                <div>
                    <label htmlFor="dateFormat" className="block text-sm font-medium text-gray-700 mb-2">
                        <Calendar className="inline w-4 h-4 mr-1" />
                        Formato de Fecha
                    </label>
                    <Select value={academicConfig.dateFormat} onValueChange={(v) => setAcademicConfig(prev => ({ ...prev, dateFormat: v }))}>
                        <SelectTrigger className="w-full">
                            <SelectValue placeholder="Formato de fecha" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="DD/MM/YYYY">DD/MM/YYYY (31/12/2024)</SelectItem>
                            <SelectItem value="MM/DD/YYYY">MM/DD/YYYY (12/31/2024)</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Configuración de Horario */}
            <div className="pt-6 border-t border-gray-200">
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                    <Clock className="inline w-5 h-5 mr-2" />
                    Configuración de Horario
                </h3>
                <p className="text-sm text-gray-600 mb-6">
                    Configura la estructura diaria del horario de clases y recreos.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div>
                        <label htmlFor="scheduleStartTime" className="block text-sm font-medium text-gray-700 mb-2">Hora de Inicio</label>
                        <input
                            id="scheduleStartTime"
                            type="time"
                            value={academicConfig.schedule.startTime}
                            onChange={(e) => setAcademicConfig(prev => ({ ...prev, schedule: { ...prev.schedule, startTime: e.target.value } }))}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                    <div>
                        <label htmlFor="blockDuration" className="block text-sm font-medium text-gray-700 mb-2">Duración de clase (min)</label>
                        <input
                            id="blockDuration"
                            type="number"
                            min="15"
                            max="180"
                            value={academicConfig.schedule.blockDuration}
                            onChange={handleNumberChange((blockDuration) => setAcademicConfig(prev => ({ ...prev, schedule: { ...prev.schedule, blockDuration } })))}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                    <div>
                        <label htmlFor="totalBlocks" className="block text-sm font-medium text-gray-700 mb-2">Total horas al día</label>
                        <input
                            id="totalBlocks"
                            type="number"
                            min="1"
                            max="15"
                            value={academicConfig.schedule.totalBlocks}
                            onChange={handleNumberChange((totalBlocks) => setAcademicConfig(prev => ({ ...prev, schedule: { ...prev.schedule, totalBlocks } })))}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                    <div>
                        <label htmlFor="breakAfterBlock" className="block text-sm font-medium text-gray-700 mb-2">Recreo después de la hora Nº</label>
                        <input
                            id="breakAfterBlock"
                            type="number"
                            min="1"
                            max="10"
                            value={academicConfig.schedule.breakAfterBlock}
                            onChange={handleNumberChange((breakAfterBlock) => setAcademicConfig(prev => ({ ...prev, schedule: { ...prev.schedule, breakAfterBlock } })))}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                    <div>
                        <label htmlFor="breakDuration" className="block text-sm font-medium text-gray-700 mb-2">Duración del recreo (min)</label>
                        <input
                            id="breakDuration"
                            type="number"
                            min="5"
                            max="120"
                            value={academicConfig.schedule.breakDuration}
                            onChange={handleNumberChange((breakDuration) => setAcademicConfig(prev => ({ ...prev, schedule: { ...prev.schedule, breakDuration } })))}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                </div>
            </div>

            {/* Preview */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-900 mb-2">Vista Previa</h4>
                <div className="text-sm text-blue-800 space-y-1">
                    <p>• Escala: {academicConfig.gradeScale.min} - {academicConfig.gradeScale.max} puntos</p>
                    <p>• Nota aprobatoria: {academicConfig.passingGrade} puntos</p>
                    <p>• Zona horaria: {academicConfig.timezone}</p>
                    <p>• Idioma: {academicConfig.language === 'es' ? 'Español' : academicConfig.language === 'en' ? 'English' : 'Português'}</p>
                    <p className="mt-2 font-semibold">Horario:</p>
                    <p>• {academicConfig.schedule.totalBlocks} bloques de {academicConfig.schedule.blockDuration} min. Inicio: {academicConfig.schedule.startTime}</p>
                    <p>• Recreo: {academicConfig.schedule.breakDuration} min después de la {academicConfig.schedule.breakAfterBlock}ra hora</p>
                </div>
            </div>

            {/* Botón Guardar */}
            <div className="flex justify-end pt-6 border-t border-gray-200">
                <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                >
                    {saving ? (
                        <>
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                            Guardando...
                        </>
                    ) : (
                        <>
                            <Save className="w-5 h-5 mr-2" />
                            Guardar Cambios
                        </>
                    )}
                </button>
            </div>
        </form>
    );
}
