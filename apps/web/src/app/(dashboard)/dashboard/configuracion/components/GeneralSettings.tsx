'use client';

import { useState, useEffect } from 'react';
import { Save, Building2, Mail, Phone, MapPin, Landmark } from 'lucide-react';
import { Lista } from '@/components/ui/lista';
import { ENTIDADES_FEDERALES } from '@/lib/entidades-federales';
import { useQueryClient } from '@tanstack/react-query';
import { membreteKey } from '@/hooks/useMembrete';
import { instituteKeys } from '@/hooks/useInstitute';

/**
 * LOS DATOS OFICIALES DEL PLANTEL
 *
 * Lo que el Ministerio (MPPE) usa para identificar al liceo y va en la
 * cabecera de todo documento oficial: el código DEA, el estadístico, el de
 * dependencia, el nombre oficial, la zona educativa, la entidad federal, el
 * municipio y la parroquia. Salen en la boleta, la constancia, el resumen
 * final y el plan de evaluación (`components/documentos/MembreteOficial.tsx`).
 * El servidor revisa los formatos al guardar.
 */
const SIN_ENTIDAD = '__ninguna';

const DATOS_VACIOS = {
    nombreOficial: '',
    codigoDea: '',
    codigoEstadistico: '',
    codigoDependencia: '',
    codigoDelPlanDeEstudio: '',
    zonaEducativa: '',
    entidadFederal: '',
    municipio: '',
    parroquia: '',
    textoDelMinisterio: '',
};
type DatosDelPlantel = typeof DATOS_VACIOS;

const CAMPO =
    'w-full px-4 py-2 min-h-[44px] border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent';
import { instituteService, type InstituteConfig } from '@/services/institute.service';
import { toast } from 'sonner';
import { esQueNoContesta } from '@/lib/estado-del-servidor';

export function GeneralSettings() {
    const queryClient = useQueryClient();
    // Empieza cargando: si empezaba en «no», el formulario salía vacío un
    // instante, se podía escribir, y al llegar los datos lo escrito se perdía.
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [config, setConfig] = useState<InstituteConfig | null>(null);

    const [formData, setFormData] = useState({
        name: '',
        code: '',
        email: '',
        phone: '',
        address: '',
    });
    const [plantel, setPlantel] = useState<DatosDelPlantel>(DATOS_VACIOS);

    useEffect(() => {
        loadConfig();
    }, []);

    const loadConfig = async () => {
        try {
            setLoading(true);
            const data = await instituteService.getConfig();
            setConfig(data);
            setFormData({
                name: data.name || '',
                code: data.code || '',
                email: data.email || '',
                phone: data.phone || '',
                address: data.address || '',
            });
            const raw: any = data.configuration
                ? typeof data.configuration === 'string'
                    ? JSON.parse(data.configuration)
                    : data.configuration
                : (data as any).academicConfig;
            const docs = raw?.documentos ?? {};
            setPlantel(
                Object.fromEntries(Object.keys(DATOS_VACIOS).map((k) => [k, typeof docs[k] === 'string' ? docs[k] : ''])) as DatosDelPlantel
            );
        } catch (error) {
            console.error(error);
            if (!esQueNoContesta(error)) toast.error('Error al cargar la configuración');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            setSaving(true);
            // Los datos del plantel van con los de los documentos; el servidor
            // los mezcla con los de la firma (que se guardan en Académico).
            await instituteService.updateConfig({ ...formData, configuration: { documentos: plantel } } as any);
            // Las hojas que se imprimen (boleta, plan…) leen el membrete de nuevo.
            queryClient.invalidateQueries({ queryKey: membreteKey });
            queryClient.invalidateQueries({ queryKey: instituteKeys.all });
            toast.success('Configuración actualizada exitosamente');
            loadConfig(); // Recargar datos
        } catch (error: any) {
            console.error(error);
            toast.error(error?.response?.data?.error || 'Error al guardar la configuración');
        } finally {
            setSaving(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setFormData(prev => ({
            ...prev,
            [e.target.name]: e.target.value
        }));
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
                <h3 className="text-lg font-medium text-gray-900 mb-4">Información General</h3>
                <p className="text-sm text-gray-600 mb-6">
                    Configura la información básica de tu instituto que se mostrará en el sistema.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Nombre del Instituto */}
                <div className="md:col-span-2">
                    <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                        <Building2 className="inline w-4 h-4 mr-1" />
                        Nombre del Instituto *
                    </label>
                    <input
                        type="text"
                        id="name"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        required
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="Ej: Instituto Educativo Demo"
                    />
                </div>

                {/* Código */}
                <div>
                    <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-2">
                        Código/Siglas *
                    </label>
                    <input
                        type="text"
                        id="code"
                        name="code"
                        value={formData.code}
                        onChange={handleChange}
                        required
                        maxLength={20}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="Ej: IED"
                    />
                    <p className="mt-1 text-xs text-gray-500">Máximo 20 caracteres</p>
                </div>

                {/* Email */}
                <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                        <Mail className="inline w-4 h-4 mr-1" />
                        Email de Contacto *
                    </label>
                    <input
                        type="email"
                        id="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        required
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="contacto@instituto.edu"
                    />
                </div>

                {/* Teléfono */}
                <div>
                    <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                        <Phone className="inline w-4 h-4 mr-1" />
                        Teléfono
                    </label>
                    <input
                        type="tel"
                        id="phone"
                        name="phone"
                        value={formData.phone}
                        onChange={handleChange}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="+58-212-555-0100"
                    />
                </div>

                {/* Dirección */}
                <div className="md:col-span-2">
                    <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-2">
                        <MapPin className="inline w-4 h-4 mr-1" />
                        Dirección
                    </label>
                    <textarea
                        id="address"
                        name="address"
                        value={formData.address}
                        onChange={handleChange}
                        rows={3}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="Av. Principal, Ciudad, País"
                    />
                </div>
            </div>

            {/* Datos oficiales del plantel (MPPE) */}
            <section className="space-y-4 border-t border-gray-200 pt-6" aria-labelledby="datos-oficiales">
                <div>
                    <h3 id="datos-oficiales" className="flex items-center gap-2 text-lg font-medium text-gray-900">
                        <Landmark className="h-5 w-5" aria-hidden /> Datos oficiales del plantel
                    </h3>
                    <p className="mt-1 text-sm text-gray-600">
                        Los del Ministerio de Educación. Salen en la cabecera de la boleta, la constancia, el resumen
                        final y el plan de evaluación.
                    </p>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <label htmlFor="nombreOficial" className="block md:col-span-2">
                        <span className="mb-1 block text-sm font-medium text-gray-700">Nombre oficial (como en el MPPE)</span>
                        <input id="nombreOficial" className={CAMPO} maxLength={160} placeholder="U.E.N. «…»"
                            value={plantel.nombreOficial} onChange={(e) => setPlantel((p) => ({ ...p, nombreOficial: e.target.value }))} />
                    </label>
                    <label htmlFor="codigoDea" className="block">
                        <span className="mb-1 block text-sm font-medium text-gray-700">Código DEA (del plantel)</span>
                        <input id="codigoDea" className={CAMPO} maxLength={20} placeholder="OD00541105" autoCapitalize="characters"
                            value={plantel.codigoDea} onChange={(e) => setPlantel((p) => ({ ...p, codigoDea: e.target.value }))} />
                    </label>
                    <label htmlFor="codigoEstadistico" className="block">
                        <span className="mb-1 block text-sm font-medium text-gray-700">Código estadístico (6 dígitos)</span>
                        <input id="codigoEstadistico" className={CAMPO} inputMode="numeric" maxLength={8} placeholder="111299"
                            value={plantel.codigoEstadistico} onChange={(e) => setPlantel((p) => ({ ...p, codigoEstadistico: e.target.value }))} />
                    </label>
                    <label htmlFor="codigoDependencia" className="block">
                        <span className="mb-1 block text-sm font-medium text-gray-700">Código de dependencia (9 dígitos)</span>
                        <input id="codigoDependencia" className={CAMPO} inputMode="numeric" maxLength={11} placeholder="123456789"
                            value={plantel.codigoDependencia} onChange={(e) => setPlantel((p) => ({ ...p, codigoDependencia: e.target.value }))} />
                    </label>
                    <label htmlFor="codigoDelPlanDeEstudio" className="block">
                        <span className="mb-1 block text-sm font-medium text-gray-700">Código del plan de estudio</span>
                        <input id="codigoDelPlanDeEstudio" className={CAMPO} maxLength={12} placeholder="31059"
                            value={plantel.codigoDelPlanDeEstudio} onChange={(e) => setPlantel((p) => ({ ...p, codigoDelPlanDeEstudio: e.target.value }))} />
                    </label>
                    <label htmlFor="zonaEducativa" className="block">
                        <span className="mb-1 block text-sm font-medium text-gray-700">Zona educativa</span>
                        <input id="zonaEducativa" className={CAMPO} maxLength={160} placeholder="Zona Educativa del estado Carabobo"
                            value={plantel.zonaEducativa} onChange={(e) => setPlantel((p) => ({ ...p, zonaEducativa: e.target.value }))} />
                    </label>
                    <div>
                        <span className="mb-1 block text-sm font-medium text-gray-700" id="entidadFederal-label">Entidad federal</span>
                        <Lista
                            id="entidadFederal"
                            etiqueta="Entidad federal"
                            valor={plantel.entidadFederal || SIN_ENTIDAD}
                            alCambiar={(v) => setPlantel((p) => ({ ...p, entidadFederal: v === SIN_ENTIDAD ? '' : v }))}
                            opciones={[{ valor: SIN_ENTIDAD, texto: 'Sin elegir' }, ...ENTIDADES_FEDERALES.map((e) => ({ valor: e, texto: e }))]}
                        />
                    </div>
                    <label htmlFor="municipio" className="block">
                        <span className="mb-1 block text-sm font-medium text-gray-700">Municipio</span>
                        <input id="municipio" className={CAMPO} maxLength={160}
                            value={plantel.municipio} onChange={(e) => setPlantel((p) => ({ ...p, municipio: e.target.value }))} />
                    </label>
                    <label htmlFor="parroquia" className="block">
                        <span className="mb-1 block text-sm font-medium text-gray-700">Parroquia</span>
                        <input id="parroquia" className={CAMPO} maxLength={160}
                            value={plantel.parroquia} onChange={(e) => setPlantel((p) => ({ ...p, parroquia: e.target.value }))} />
                    </label>
                    <label htmlFor="textoDelMinisterio" className="block md:col-span-2">
                        <span className="mb-1 block text-sm font-medium text-gray-700">Encabezado del ministerio (una línea por renglón)</span>
                        <textarea id="textoDelMinisterio" rows={2} maxLength={300}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            placeholder={'República Bolivariana de Venezuela\nMinisterio del Poder Popular para la Educación'}
                            value={plantel.textoDelMinisterio} onChange={(e) => setPlantel((p) => ({ ...p, textoDelMinisterio: e.target.value }))} />
                        <span className="mt-1 block text-xs text-gray-500">Vacío: el del Ministerio del Poder Popular para la Educación.</span>
                    </label>
                </div>
            </section>

            {/* Botón Guardar */}
            <div className="flex justify-end pt-6 border-t border-gray-200">
                <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
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
