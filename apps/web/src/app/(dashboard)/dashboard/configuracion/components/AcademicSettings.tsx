'use client';

import { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Globe, Calendar } from 'lucide-react';
import { Ajustes, BotonGuardar, CargandoAjustes, Fila, FilaCampo, Grupo, SELECT_EN_FILA } from '@/components/configuracion/ajustes';
import { instituteService, type InstituteConfig } from '@/services/institute.service';
import { toast } from 'sonner';
import { esPendiente } from '@/lib/por-enviar';
import { esQueNoContesta } from '@/lib/estado-del-servidor';
import { useConfirm } from '@/hooks/useConfirm';
import { erroresDelHorario, turnosDeLaConfig, type HorarioDelLiceo } from '@/lib/franjas-del-horario';
import { HorarioDelLiceoEditor } from './HorarioDelLiceoEditor';
import { ApreciacionesEditor, APRECIACIONES_POR_DEFECTO, erroresDeApreciaciones } from './ApreciacionesEditor';
import { ReglasDeLaLaborSocial } from '@/components/labor-social/ReglasDeLaLaborSocial';
import { ReglasDeLasPendientes } from '@/components/pendientes/ReglasDeLasPendientes';

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

    if (loading) return <CargandoAjustes />;

    const cambiarFirma = (k: 'firmanteNombre' | 'firmanteCedula' | 'firmanteCargo') => (e: React.ChangeEvent<HTMLInputElement>) =>
        setAcademicConfig((prev) => ({ ...prev, documentos: { ...prev.documentos, [k]: e.target.value } }));

    return (
        <Ajustes className="max-w-3xl">
            <form onSubmit={handleSubmit} className="space-y-7">
                <Grupo id="notas" titulo="Notas" pie="El redondeo se aplica a la nota de cada lapso y a la definitiva: con la regla del MPPE, un 9,5 es un 10.">
                    <FilaCampo
                        id="gradeScaleMin"
                        etiqueta="Calificación Mínima"
                        type="number"
                        min="0"
                        value={academicConfig.gradeScale.min}
                        onChange={handleNumberChange((min) => setAcademicConfig((prev) => ({ ...prev, gradeScale: { ...prev.gradeScale, min } })))}
                    />
                    <FilaCampo
                        id="gradeScaleMax"
                        etiqueta="Calificación Máxima"
                        type="number"
                        min="1"
                        value={academicConfig.gradeScale.max}
                        onChange={handleNumberChange((max) => setAcademicConfig((prev) => ({ ...prev, gradeScale: { ...prev.gradeScale, max } })))}
                    />
                    <FilaCampo
                        id="passingGrade"
                        etiqueta="Nota Mínima Aprobatoria"
                        ayuda={`Entre ${academicConfig.gradeScale.min} y ${academicConfig.gradeScale.max}.`}
                        type="number"
                        min={academicConfig.gradeScale.min}
                        max={academicConfig.gradeScale.max}
                        value={academicConfig.passingGrade}
                        onChange={handleNumberChange((passingGrade) => setAcademicConfig((prev) => ({ ...prev, passingGrade })))}
                    />
                    <Fila etiqueta="Redondeo" etiquetaId="redondeo-rotulo">
                        <Select
                            value={academicConfig.redondeoDeDefinitivas}
                            onValueChange={(v) => setAcademicConfig((prev) => ({ ...prev, redondeoDeDefinitivas: v === 'NINGUNO' ? 'NINGUNO' : 'MPPE' }))}
                        >
                            <SelectTrigger id="redondeoDeDefinitivas" aria-label="Redondeo de las notas definitivas" className={SELECT_EN_FILA}>
                                <SelectValue placeholder="Redondeo" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="MPPE">Al entero (MPPE)</SelectItem>
                                <SelectItem value="NINGUNO">Sin redondear</SelectItem>
                            </SelectContent>
                        </Select>
                    </Fila>
                </Grupo>

                <Grupo id="asistencia" titulo="Asistencia">
                    <FilaCampo
                        id="asistenciaMinima"
                        etiqueta="Asistencia mínima"
                        sufijo="%"
                        ayuda="Por debajo de este porcentaje se le avisa al representante. No reprueba ni afecta las notas."
                        type="number"
                        min="0"
                        max="100"
                        value={academicConfig.asistenciaMinima}
                        onChange={handleNumberChange((asistenciaMinima) => setAcademicConfig((prev) => ({ ...prev, asistenciaMinima })))}
                    />
                </Grupo>

                <div data-recorrido="config-cuadro-de-honor">
                    <Grupo
                        id="cuadro-de-honor"
                        titulo="Cuadro de honor"
                        descripcion="El puntaje de cada alumno: el peso de las notas y el de la asistencia (con 80 y 20, el máximo es 100), menos lo que resta cada observación del período. Se recalcula cada sábado."
                        pie="Si en tu liceo las observaciones no son llamados de atención, pon la resta en 0."
                    >
                        {(
                            [
                                ['pesoNotas', 'Peso de las notas', 100],
                                ['pesoAsistencia', 'Peso de la asistencia', 100],
                                ['restaPorObservacion', 'Resta por observación', 50],
                            ] as const
                        ).map(([campo, rotulo, max]) => (
                            <FilaCampo
                                key={campo}
                                etiqueta={rotulo}
                                type="number"
                                min={0}
                                max={max}
                                value={academicConfig.cuadroDeHonor[campo]}
                                onChange={handleNumberChange((v) => setAcademicConfig((prev) => ({ ...prev, cuadroDeHonor: { ...prev.cuadroDeHonor, [campo]: v } })))}
                            />
                        ))}
                    </Grupo>
                </div>

                <ApreciacionesEditor
                    valor={academicConfig.apreciaciones}
                    alCambiar={(apreciaciones) => setAcademicConfig((prev) => ({ ...prev, apreciaciones }))}
                />

                <Grupo id="region" titulo="Región">
                    <Fila icono={Globe} etiqueta="Zona horaria">
                        <Select value={academicConfig.timezone} onValueChange={(v) => setAcademicConfig((prev) => ({ ...prev, timezone: v }))}>
                            <SelectTrigger id="timezone" aria-label="Zona Horaria" className={SELECT_EN_FILA}>
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
                    </Fila>
                    <Fila etiqueta="Idioma">
                        <Select value={academicConfig.language} onValueChange={(v) => setAcademicConfig((prev) => ({ ...prev, language: v }))}>
                            <SelectTrigger id="language" aria-label="Idioma del Sistema" className={SELECT_EN_FILA}>
                                <SelectValue placeholder="Idioma" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="es">Español</SelectItem>
                                <SelectItem value="en">English</SelectItem>
                            </SelectContent>
                        </Select>
                    </Fila>
                    <Fila icono={Calendar} etiqueta="Formato de fecha">
                        <Select value={academicConfig.dateFormat} onValueChange={(v) => setAcademicConfig((prev) => ({ ...prev, dateFormat: v }))}>
                            <SelectTrigger id="dateFormat" aria-label="Formato de Fecha" className={SELECT_EN_FILA}>
                                <SelectValue placeholder="Formato de fecha" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="DD/MM/YYYY">31/12/2024</SelectItem>
                                <SelectItem value="MM/DD/YYYY">12/31/2024</SelectItem>
                            </SelectContent>
                        </Select>
                    </Fila>
                </Grupo>

                <Grupo
                    id="constancias"
                    titulo="Quién firma las constancias"
                    descripcion="Sale al pie de las constancias de estudio y de buena conducta. En blanco, la línea de firma sale vacía."
                >
                    <FilaCampo id="firmanteNombre" etiqueta="Nombre" maxLength={120} placeholder="Carmen Rojas" value={academicConfig.documentos.firmanteNombre} onChange={cambiarFirma('firmanteNombre')} />
                    <FilaCampo id="firmanteCedula" etiqueta="Cédula" maxLength={120} placeholder="V-9.876.543" value={academicConfig.documentos.firmanteCedula} onChange={cambiarFirma('firmanteCedula')} />
                    <FilaCampo id="firmanteCargo" etiqueta="Cargo" maxLength={120} placeholder="Director(a)" value={academicConfig.documentos.firmanteCargo} onChange={cambiarFirma('firmanteCargo')} />
                </Grupo>

                <section aria-labelledby="horario-titulo" className="space-y-2">
                    <div className="px-4">
                        <h3 id="horario-titulo" className="text-xs font-semibold uppercase tracking-[0.06em] text-gray-600">
                            Configuración de Horario
                        </h3>
                        <p className="mt-1 text-sm leading-snug text-gray-600">Mañana y tarde: a qué hora empieza y acaba cada una, cuánto dura la clase y sus recreos.</p>
                    </div>
                    <HorarioDelLiceoEditor valor={academicConfig.schedule} alCambiar={(schedule) => setAcademicConfig((prev) => ({ ...prev, schedule }))} />
                </section>

                <BotonGuardar guardando={saving} />
            </form>

            {/* Con su propio botón de guardar: la labor social y la materia pendiente (antes, en sus pantallas del menú). */}
            <ReglasDeLaLaborSocial />
            <ReglasDeLasPendientes />
        </Ajustes>
    );
}
