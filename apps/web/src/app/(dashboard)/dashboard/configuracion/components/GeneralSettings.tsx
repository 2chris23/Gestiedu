'use client';

import { useState, useEffect } from 'react';
import { Landmark } from 'lucide-react';
import { Ajustes, BotonGuardar, CargandoAjustes, EN_LA_FILA, Fila, FilaCampo, FilaInterruptor, FilaTexto, Grupo } from '@/components/configuracion/ajustes';
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
    circuitoEducativo: '',
    textoDelMinisterio: '',
    /** «NO» = sin el logo del Ministerio en los documentos. */
    logoDelMinisterio: '',
};
type DatosDelPlantel = typeof DATOS_VACIOS;

import { instituteService, type InstituteConfig } from '@/services/institute.service';
import { toast } from 'sonner';
import { esPendiente } from '@/lib/por-enviar';
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
            const r = await instituteService.updateConfig({ ...formData, configuration: { documentos: plantel } } as any);
            if (esPendiente(r)) {
                // Lo escrito se queda en el formulario: es lo que va a subir.
                toast('Sin conexión: el cambio quedó pendiente ⏱ y se guarda solo al volver.', { id: 'pendiente' });
                return;
            }
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

    if (loading) return <CargandoAjustes />;

    const cambiarPlantel = (k: keyof DatosDelPlantel) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setPlantel((p) => ({ ...p, [k]: e.target.value }));

    return (
        <form onSubmit={handleSubmit}>
            <Ajustes>
                <Grupo id="el-liceo" titulo="El liceo" descripcion="Cómo se llama y cómo se le contacta. Sale en el sistema y en los avisos.">
                    <FilaCampo etiqueta="Nombre *" id="name" name="name" value={formData.name} onChange={handleChange} required placeholder="U.E. Liceo Bolívar" />
                    <FilaCampo etiqueta="Siglas *" id="code" name="code" value={formData.code} onChange={handleChange} required maxLength={20} placeholder="IED" />
                    <FilaCampo etiqueta="Correo *" type="email" id="email" name="email" value={formData.email} onChange={handleChange} required placeholder="contacto@liceo.edu.ve" />
                    <FilaCampo etiqueta="Teléfono" type="tel" id="phone" name="phone" value={formData.phone} onChange={handleChange} placeholder="0241 555 0100" />
                    <FilaTexto etiqueta="Dirección" id="address" name="address" value={formData.address} onChange={handleChange} rows={2} placeholder="Av. Principal, Ciudad" />
                </Grupo>

                <Grupo
                    id="datos-oficiales"
                    titulo="Datos oficiales del plantel"
                    descripcion="Los del Ministerio de Educación. Salen en la cabecera de la boleta, la constancia, el resumen final y el plan de evaluación."
                >
                    <FilaCampo etiqueta="Nombre oficial" id="nombreOficial" maxLength={160} placeholder="U.E.N. «…»" value={plantel.nombreOficial} onChange={cambiarPlantel('nombreOficial')} />
                    <FilaCampo etiqueta="Código DEA" id="codigoDea" maxLength={20} placeholder="OD00541105" autoCapitalize="characters" value={plantel.codigoDea} onChange={cambiarPlantel('codigoDea')} />
                    <FilaCampo etiqueta="Código estadístico" id="codigoEstadistico" inputMode="numeric" maxLength={8} placeholder="6 dígitos" value={plantel.codigoEstadistico} onChange={cambiarPlantel('codigoEstadistico')} />
                    <FilaCampo etiqueta="Código de dependencia" id="codigoDependencia" inputMode="numeric" maxLength={11} placeholder="9 dígitos" value={plantel.codigoDependencia} onChange={cambiarPlantel('codigoDependencia')} />
                    <FilaCampo etiqueta="Plan de estudio" id="codigoDelPlanDeEstudio" maxLength={12} placeholder="31059" value={plantel.codigoDelPlanDeEstudio} onChange={cambiarPlantel('codigoDelPlanDeEstudio')} />
                    <FilaCampo etiqueta="Zona educativa" id="zonaEducativa" maxLength={160} placeholder="Carabobo" value={plantel.zonaEducativa} onChange={cambiarPlantel('zonaEducativa')} />
                    <Fila etiqueta="Entidad federal" etiquetaId="entidadFederal-label">
                        <Lista
                            id="entidadFederal"
                            etiqueta="Entidad federal"
                            valor={plantel.entidadFederal || SIN_ENTIDAD}
                            alCambiar={(v) => setPlantel((p) => ({ ...p, entidadFederal: v === SIN_ENTIDAD ? '' : v }))}
                            opciones={[{ valor: SIN_ENTIDAD, texto: 'Sin elegir' }, ...ENTIDADES_FEDERALES.map((e) => ({ valor: e, texto: e }))]}
                            className={EN_LA_FILA}
                        />
                    </Fila>
                    <FilaCampo etiqueta="Municipio" id="municipio" maxLength={160} value={plantel.municipio} onChange={cambiarPlantel('municipio')} />
                    <FilaCampo etiqueta="Parroquia" id="parroquia" maxLength={160} value={plantel.parroquia} onChange={cambiarPlantel('parroquia')} />
                    <FilaCampo etiqueta="Circuito educativo" id="circuitoEducativo" maxLength={160} placeholder="N.º 2" value={plantel.circuitoEducativo} onChange={cambiarPlantel('circuitoEducativo')} />
                </Grupo>

                <Grupo id="membrete" titulo="El membrete">
                    <FilaTexto
                        etiqueta="Encabezado del ministerio"
                        id="textoDelMinisterio"
                        rows={2}
                        maxLength={300}
                        placeholder={'República Bolivariana de Venezuela\nMinisterio del Poder Popular para la Educación'}
                        value={plantel.textoDelMinisterio}
                        onChange={cambiarPlantel('textoDelMinisterio')}
                        ayuda="Una línea por renglón. Vacío: el del Ministerio del Poder Popular para la Educación."
                    />
                    <FilaInterruptor
                        id="logoDelMinisterio"
                        icono={Landmark}
                        titulo="Logo del Ministerio"
                        descripcion="A la izquierda de los documentos; el del liceo, a la derecha."
                        checked={plantel.logoDelMinisterio !== 'NO'}
                        onChange={(v) => setPlantel((p) => ({ ...p, logoDelMinisterio: v ? '' : 'NO' }))}
                    />
                </Grupo>

                <BotonGuardar guardando={saving} />
            </Ajustes>
        </form>
    );
}
