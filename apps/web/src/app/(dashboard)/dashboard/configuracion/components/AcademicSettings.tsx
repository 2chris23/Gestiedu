'use client';

import { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, GraduationCap, Globe, Calendar, Clock, FileText } from 'lucide-react';
import { instituteService, type InstituteConfig } from '@/services/institute.service';
import { toast } from 'sonner';
import { esPendiente } from '@/lib/por-enviar';
import { esQueNoContesta } from '@/lib/estado-del-servidor';
import { useConfirm } from '@/hooks/useConfirm';
import { calcularTurno, erroresDelHorario, turnosDeLaConfig, type HorarioDelLiceo } from '@/lib/franjas-del-horario';
import { HorarioDelLiceoEditor } from './HorarioDelLiceoEditor';
import { ApreciacionesEditor, APRECIACIONES_POR_DEFECTO, erroresDeApreciaciones } from './ApreciacionesEditor';

export function AcademicSettings() {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [config, setConfig] = useState<InstituteConfig | null>(null);
    const confirmar = useConfirm();

    const [academicConfig, setAcademicConfig] = useState({
        timezone: 'America/Caracas',
        gradeScale: { min: 0, max: 20 },
        passingGrade: 10,
        asistenciaMinima: 80,
        // Los pesos del cuadro de honor (2026-10-04): 80 / 20 / 5 por defecto.
        cuadroDeHonor: { pesoNotas: 80, pesoAsistencia: 20, restaPorObservacion: 5 },
        redondeoDeDefinitivas: 'MPPE' as 'MPPE' | 'NINGUNO',
        apreciaciones: [...APRECIACIONES_POR_DEFECTO],
        // Quién firma las constancias. El código DEA y los demás datos
        // oficiales del plantel están en Información General.
        documentos: { firmanteNombre: '', firmanteCedula: '', firmanteCargo: '' },
        language: 'es',
        dateFormat: 'DD/MM/YYYY',
        // Por turno: inicio, fin, duración y recreos (`lib/franjas-del-horario.ts`).
        schedule: { turnos: turnosDeLaConfig(null) } as HorarioDelLiceo,
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
                    cuadroDeHonor: {
                        pesoNotas: rawConfig.cuadroDeHonor?.pesoNotas ?? 80,
                        pesoAsistencia: rawConfig.cuadroDeHonor?.pesoAsistencia ?? 20,
                        restaPorObservacion: rawConfig.cuadroDeHonor?.restaPorObservacion ?? 5,
                    },
                    redondeoDeDefinitivas: rawConfig.redondeoDeDefinitivas === 'NINGUNO' ? 'NINGUNO' : 'MPPE',
                    apreciaciones: Array.isArray(rawConfig.apreciaciones) && rawConfig.apreciaciones.length >= 2
                        ? rawConfig.apreciaciones
                        : [...APRECIACIONES_POR_DEFECTO],
                    documentos: {
                        firmanteNombre: rawConfig.documentos?.firmanteNombre ?? '',
                        firmanteCedula: rawConfig.documentos?.firmanteCedula ?? '',
                        firmanteCargo: rawConfig.documentos?.firmanteCargo ?? '',
                    },
                    language: rawConfig.language || 'es',
                    dateFormat: rawConfig.dateFormat || 'DD/MM/YYYY',
                    // Lo guardado a la vieja (solo la mañana) se lee con sus dos turnos.
                    schedule: { ...(rawConfig.schedule || {}), turnos: turnosDeLaConfig(rawConfig.schedule) },
                });
            } else if (data.timezone) {
                setAcademicConfig(prev => ({ ...prev, timezone: data.timezone || prev.timezone }));
            }
        } catch (error) {
            console.error(error);
            if (!esQueNoContesta(error)) toast.error('Error al cargar la configuración');
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

        const c = academicConfig.cuadroDeHonor;
        if (
            [c.pesoNotas, c.pesoAsistencia].some((v) => v < 0 || v > 100) ||
            c.restaPorObservacion < 0 ||
            c.restaPorObservacion > 50 ||
            c.pesoNotas + c.pesoAsistencia === 0
        ) {
            toast.error('Cuadro de honor: los pesos van de 0 a 100 (no los dos en 0) y lo que resta cada observación, de 0 a 50.');
            return;
        }

        const malApreciaciones = erroresDeApreciaciones(academicConfig.apreciaciones);
        if (malApreciaciones) {
            toast.error(malApreciaciones);
            return;
        }

        const noCuadra = erroresDelHorario(academicConfig.schedule);
        if (noCuadra.length) {
            toast.error(noCuadra[0]);
            return;
        }

        const guardar = (confirmarClasesFuera = false) =>
            instituteService.updateConfig({
                configuration: { ...academicConfig, ...(confirmarClasesFuera ? { confirmarClasesFuera: true } : {}) } as any,
                timezone: academicConfig.timezone,
            });

        try {
            setSaving(true);
            try {
                if (esPendiente(await guardar())) {
                    toast('Sin conexión: el cambio quedó pendiente ⏱ y se guarda solo al volver.', { id: 'pendiente' });
                    return;
                }
            } catch (error: any) {
                // Clases puestas que dejarían de caer en una hora del día: se
                // pregunta antes de dejarlas fuera de la rejilla.
                if (error?.response?.status !== 409 || error?.response?.data?.code !== 'HORARIO_DEJA_CLASES_FUERA') throw error;
                const seguir = await confirmar({
                    title: '¿Cambiar el horario igualmente?',
                    description: `${error.response.data.error} Esas clases no se borran, pero ninguna pantalla las enseñará hasta que se muevan a una hora del nuevo horario.`,
                    confirmLabel: 'Cambiar el horario',
                    cancelLabel: 'No, revisar',
                });
                if (!seguir) return;
                await guardar(true);
            }
            toast.success('Configuración académica actualizada exitosamente');
            await loadConfig();
        } catch (error: any) {
            console.error(error);
            toast.error(error?.response?.data?.error || 'Error al guardar la configuración');
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

                {/* El cuadro de honor (2026-10-04): cómo se cuenta el puntaje. */}
                <fieldset className="rounded-xl border border-gray-200 p-4 md:col-span-2" data-recorrido="config-cuadro-de-honor">
                    <legend className="px-1 text-sm font-semibold text-gray-800">Cuadro de honor</legend>
                    <p className="mb-3 text-xs text-gray-600">
                        El puntaje de cada alumno: el peso de las notas y el de la asistencia (con 80 y 20, el máximo es 100), menos lo que resta cada observación del período. Se recalcula cada sábado.
                    </p>
                    <div className="grid gap-3 sm:grid-cols-3">
                        {([
                            ['pesoNotas', 'Peso de las notas', 100],
                            ['pesoAsistencia', 'Peso de la asistencia', 100],
                            ['restaPorObservacion', 'Resta por observación', 50],
                        ] as const).map(([campo, rotulo, max]) => (
                            <label key={campo} className="block text-sm font-medium text-gray-700">
                                {rotulo}
                                <input
                                    type="number"
                                    min={0}
                                    max={max}
                                    value={academicConfig.cuadroDeHonor[campo]}
                                    onChange={handleNumberChange((v) =>
                                        setAcademicConfig((prev) => ({ ...prev, cuadroDeHonor: { ...prev.cuadroDeHonor, [campo]: v } }))
                                    )}
                                    className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-indigo-500"
                                />
                            </label>
                        ))}
                    </div>
                    <p className="mt-2 text-xs text-gray-600">Si en tu liceo las observaciones no son llamados de atención, pon la resta en 0.</p>
                </fieldset>

                {/* Redondeo de las definitivas */}
                <div>
                    <label htmlFor="redondeoDeDefinitivas" className="block text-sm font-medium text-gray-700 mb-2">
                        Redondeo de las notas definitivas
                    </label>
                    <Select
                        value={academicConfig.redondeoDeDefinitivas}
                        onValueChange={(v) => setAcademicConfig(prev => ({ ...prev, redondeoDeDefinitivas: v === 'NINGUNO' ? 'NINGUNO' : 'MPPE' }))}
                    >
                        <SelectTrigger id="redondeoDeDefinitivas" className="w-full">
                            <SelectValue placeholder="Redondeo" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="MPPE">Al entero: 0,50 o más sube (MPPE)</SelectItem>
                            <SelectItem value="NINGUNO">Sin redondear (dos decimales)</SelectItem>
                        </SelectContent>
                    </Select>
                    <p className="mt-1 text-xs text-gray-500">
                        Se aplica a la nota de cada lapso y a la definitiva al cerrar el ciclo: con la regla del MPPE, un 9,5 es un 10.
                    </p>
                </div>

                <div className="md:col-span-2">
                    <ApreciacionesEditor
                        valor={academicConfig.apreciaciones}
                        alCambiar={(apreciaciones) => setAcademicConfig((prev) => ({ ...prev, apreciaciones }))}
                    />
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

            {/* Constancias */}
            <div className="pt-6 border-t border-gray-200">
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                    <FileText className="inline w-5 h-5 mr-2" />
                    Constancias
                </h3>
                <p className="text-sm text-gray-600 mb-6">
                    Lo que sale al pie de las constancias de estudio y de buena conducta. Si lo dejas en blanco, la línea de firma sale vacía.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label htmlFor="firmanteNombre" className="block text-sm font-medium text-gray-700 mb-2">Quién firma (nombre y apellido)</label>
                        <input
                            id="firmanteNombre"
                            type="text"
                            maxLength={120}
                            placeholder="Carmen Rojas"
                            value={academicConfig.documentos.firmanteNombre}
                            onChange={(e) => setAcademicConfig(prev => ({ ...prev, documentos: { ...prev.documentos, firmanteNombre: e.target.value } }))}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                    <div>
                        <label htmlFor="firmanteCedula" className="block text-sm font-medium text-gray-700 mb-2">Cédula de quien firma</label>
                        <input
                            id="firmanteCedula"
                            type="text"
                            maxLength={120}
                            placeholder="V-9.876.543"
                            value={academicConfig.documentos.firmanteCedula}
                            onChange={(e) => setAcademicConfig(prev => ({ ...prev, documentos: { ...prev.documentos, firmanteCedula: e.target.value } }))}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                    <div>
                        <label htmlFor="firmanteCargo" className="block text-sm font-medium text-gray-700 mb-2">Cargo</label>
                        <input
                            id="firmanteCargo"
                            type="text"
                            maxLength={120}
                            placeholder="Director(a)"
                            value={academicConfig.documentos.firmanteCargo}
                            onChange={(e) => setAcademicConfig(prev => ({ ...prev, documentos: { ...prev.documentos, firmanteCargo: e.target.value } }))}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
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
                <HorarioDelLiceoEditor
                    valor={academicConfig.schedule}
                    alCambiar={(schedule) => setAcademicConfig((prev) => ({ ...prev, schedule }))}
                />
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
                    {(['MANANA', 'TARDE'] as const).map((t) => {
                        const turno = turnosDeLaConfig(academicConfig.schedule)[t];
                        const cuenta = calcularTurno(turno, t);
                        return (
                            <p key={t}>
                                • {t === 'MANANA' ? 'Mañana' : 'Tarde'}: {turno.inicio} a {turno.fin}
                                {cuenta.errores.length ? ' (no cuadra)' : `, ${cuenta.bloques} horas de ${turno.duracion} min`}
                            </p>
                        );
                    })}
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
