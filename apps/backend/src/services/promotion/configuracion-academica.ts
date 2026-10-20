import { ReglasDelCuadro } from '../reglas-del-cuadro';
import { type ReglasDeGrupos } from '../reglas-de-grupos';
import {
    ReglasDeRevision,
    ReglasDePendientes,
    ReglasDeLaborSocial,
    PendienteNoAprobada,
} from './reglas-del-fin-de-ano';
import { esReglasDelCuadro, limpiarReglasDelCuadro, REGLAS_DEL_CUADRO_POR_DEFECTO } from '../reglas-del-cuadro';
import { REGLAS_DE_GRUPOS_POR_DEFECTO, esReglasDeGrupos, limpiarReglasDeGrupos } from '../reglas-de-grupos';
import { platformPrisma } from '../../config/database';
import { APRECIACIONES_POR_DEFECTO, esListaDeApreciaciones } from '../apreciaciones.service';
import {
    LABOR_SOCIAL_POR_DEFECTO,
    esReglasDeLaborSocial,
    UltimoAnoConPendientes,
    REVISION_POR_DEFECTO,
    PENDIENTES_POR_DEFECTO,
    esReglasDeRevision,
    limpiarReglasDeRevision,
    esUltimoAnoConPendientes,
    esPendienteNoAprobada,
    esReglasDePendientes,
    completarPendientes,
    completarLaborSocial,
} from './reglas-del-fin-de-ano';

export const REDONDEOS_DE_DEFINITIVAS: RedondeoDeDefinitivas[] = ['MPPE', 'NINGUNO'];

export function esRedondeoValido(valor: unknown): valor is RedondeoDeDefinitivas {
    return typeof valor === 'string' && (REDONDEOS_DE_DEFINITIVAS as string[]).includes(valor);
}

export const DEFAULT_ACADEMIC_CONFIG: AcademicConfig = {
    notaMinimaAprobatoria: 10,
    maxMateriasPendientesParaPromover: 2,
    permitePendientesEnUltimoAno: false,
    asistenciaMinima: 80,
    modalidad: 'MEDIA_GENERAL',
    maxGradeLevel: 5,
    turnosHabilitados: ['MANANA', 'TARDE'],
    redondeoDeDefinitivas: 'MPPE',
    apreciaciones: APRECIACIONES_POR_DEFECTO,
    revision: REVISION_POR_DEFECTO,
    ultimoAnoConPendientes: 'REPITE',
    pendienteNoAprobada: 'REPITE',
    pendientes: PENDIENTES_POR_DEFECTO,
    laborSocial: LABOR_SOCIAL_POR_DEFECTO,
    cuadroDeHonor: REGLAS_DEL_CUADRO_POR_DEFECTO,
};

/** El porcentaje de asistencia va de 0 a 100 y no admite otra cosa. */
export function esAsistenciaMinimaValida(valor: unknown): valor is number {
    return typeof valor === 'number' && Number.isFinite(valor) && valor >= 0 && valor <= 100;
}

/** Lo del último año, leyendo también la forma vieja (el booleano). */
function ultimoAnoDe(raw: Record<string, unknown>): UltimoAnoConPendientes {
    if (esUltimoAnoConPendientes(raw.ultimoAnoConPendientes)) return raw.ultimoAnoConPendientes;
    return raw.permitePendientesEnUltimoAno === true ? 'EGRESA' : 'REPITE';
}

export async function getAcademicConfig(instituteId: string): Promise<AcademicConfig> {
    const inst = await platformPrisma.institute.findUnique({ where: { id: instituteId }, select: { academicConfig: true } });
    if (!inst) return { ...DEFAULT_ACADEMIC_CONFIG };
    const raw = (inst.academicConfig || {}) as Partial<AcademicConfig> & Record<string, unknown>;
    const modalidad = raw.modalidad === 'MEDIA_TECNICA' ? 'MEDIA_TECNICA' : 'MEDIA_GENERAL';
    const defaultMax = modalidad === 'MEDIA_TECNICA' ? 6 : 5;
    const ultimoAnoConPendientes = ultimoAnoDe(raw);
    return {
        notaMinimaAprobatoria: typeof raw.notaMinimaAprobatoria === 'number' ? raw.notaMinimaAprobatoria : DEFAULT_ACADEMIC_CONFIG.notaMinimaAprobatoria,
        maxMateriasPendientesParaPromover: typeof raw.maxMateriasPendientesParaPromover === 'number' ? raw.maxMateriasPendientesParaPromover : DEFAULT_ACADEMIC_CONFIG.maxMateriasPendientesParaPromover,
        permitePendientesEnUltimoAno: ultimoAnoConPendientes !== 'REPITE',
        asistenciaMinima: esAsistenciaMinimaValida(raw.asistenciaMinima) ? raw.asistenciaMinima : DEFAULT_ACADEMIC_CONFIG.asistenciaMinima,
        modalidad,
        maxGradeLevel: typeof raw.maxGradeLevel === 'number' ? raw.maxGradeLevel : defaultMax,
        turnosHabilitados: Array.isArray(raw.turnosHabilitados) ? raw.turnosHabilitados : DEFAULT_ACADEMIC_CONFIG.turnosHabilitados,
        redondeoDeDefinitivas: esRedondeoValido(raw.redondeoDeDefinitivas) ? raw.redondeoDeDefinitivas : DEFAULT_ACADEMIC_CONFIG.redondeoDeDefinitivas,
        apreciaciones: esListaDeApreciaciones(raw.apreciaciones) ? raw.apreciaciones.map((v) => v.trim()) : [...APRECIACIONES_POR_DEFECTO],
        revision: esReglasDeRevision(raw.revision) ? limpiarReglasDeRevision(raw.revision) : REVISION_POR_DEFECTO,
        ultimoAnoConPendientes,
        pendienteNoAprobada: esPendienteNoAprobada(raw.pendienteNoAprobada) ? raw.pendienteNoAprobada : DEFAULT_ACADEMIC_CONFIG.pendienteNoAprobada,
        pendientes: esReglasDePendientes(raw.pendientes) ? completarPendientes(raw.pendientes) : PENDIENTES_POR_DEFECTO,
        laborSocial: esReglasDeLaborSocial(raw.laborSocial)
            ? completarLaborSocial(raw.laborSocial)
            : { ...LABOR_SOCIAL_POR_DEFECTO, grados: [typeof raw.maxGradeLevel === 'number' ? raw.maxGradeLevel : defaultMax] },
        cuadroDeHonor: esReglasDelCuadro(raw.cuadroDeHonor) ? limpiarReglasDelCuadro(raw.cuadroDeHonor) : REGLAS_DEL_CUADRO_POR_DEFECTO,
        gruposEstables: esReglasDeGrupos(raw.gruposEstables) ? limpiarReglasDeGrupos(raw.gruposEstables) : REGLAS_DE_GRUPOS_POR_DEFECTO,
    };
}

export async function updateAcademicConfig(instituteId: string, patch: Partial<AcademicConfig>): Promise<AcademicConfig> {
    const current = await getAcademicConfig(instituteId);
    // La configuración académica guarda MÁS cosas que estas reglas (la escala
    // de notas, el horario, la asistencia por QR…). Se escribían solo estas y
    // lo demás se perdía: guardar las reglas de promoción borraba la escala.
    const entera =
        ((await platformPrisma.institute.findUnique({ where: { id: instituteId }, select: { academicConfig: true } }))
            ?.academicConfig as Record<string, unknown> | null) || {};
    const modalidad = patch.modalidad ?? current.modalidad;
    const defaultMax = modalidad === 'MEDIA_TECNICA' ? 6 : 5;
    // El booleano viejo, si llega solo, sigue mandando (se traduce).
    const ultimoAnoConPendientes = esUltimoAnoConPendientes(patch.ultimoAnoConPendientes)
        ? patch.ultimoAnoConPendientes
        : typeof patch.permitePendientesEnUltimoAno === 'boolean'
          ? patch.permitePendientesEnUltimoAno
              ? 'EGRESA'
              : 'REPITE'
          : current.ultimoAnoConPendientes;
    const next: AcademicConfig = {
        notaMinimaAprobatoria: patch.notaMinimaAprobatoria ?? current.notaMinimaAprobatoria,
        maxMateriasPendientesParaPromover: patch.maxMateriasPendientesParaPromover ?? current.maxMateriasPendientesParaPromover,
        permitePendientesEnUltimoAno: ultimoAnoConPendientes !== 'REPITE',
        asistenciaMinima: esAsistenciaMinimaValida(patch.asistenciaMinima) ? patch.asistenciaMinima : current.asistenciaMinima,
        modalidad,
        maxGradeLevel: patch.maxGradeLevel ?? current.maxGradeLevel ?? defaultMax,
        turnosHabilitados: patch.turnosHabilitados ?? current.turnosHabilitados,
        redondeoDeDefinitivas: esRedondeoValido(patch.redondeoDeDefinitivas) ? patch.redondeoDeDefinitivas : current.redondeoDeDefinitivas,
        apreciaciones: esListaDeApreciaciones(patch.apreciaciones) ? patch.apreciaciones.map((v) => v.trim()) : current.apreciaciones,
        revision: esReglasDeRevision(patch.revision) ? limpiarReglasDeRevision(patch.revision) : current.revision,
        ultimoAnoConPendientes,
        pendienteNoAprobada: esPendienteNoAprobada(patch.pendienteNoAprobada) ? patch.pendienteNoAprobada : current.pendienteNoAprobada,
        pendientes: esReglasDePendientes(patch.pendientes) ? completarPendientes(patch.pendientes) : current.pendientes,
        laborSocial: esReglasDeLaborSocial(patch.laborSocial) ? completarLaborSocial(patch.laborSocial) : current.laborSocial,
        cuadroDeHonor: esReglasDelCuadro(patch.cuadroDeHonor) ? limpiarReglasDelCuadro(patch.cuadroDeHonor) : current.cuadroDeHonor,
        gruposEstables: esReglasDeGrupos(patch.gruposEstables) ? limpiarReglasDeGrupos(patch.gruposEstables) : current.gruposEstables,
    };
    await platformPrisma.institute.update({
        where: { id: instituteId },
        data: { academicConfig: { ...entera, ...next } as any },
    });
    return next;
}

export interface AcademicConfig {
    /** Los grupos estables: elegir una vez al año o en cada lapso, y si está abierta. */
    gruposEstables?: ReglasDeGrupos;
    notaMinimaAprobatoria: number;
    maxMateriasPendientesParaPromover: number;
    /**
     * La forma vieja de `ultimoAnoConPendientes`: `true` se lee como EGRESA
     * (lo que hacía), `false` como REPITE. Se sigue devolviendo para las
     * pantallas que la leen.
     */
    permitePendientesEnUltimoAno: boolean;
    /**
     * A partir de qué porcentaje de asistencia se deja de avisar al representante.
     */
    asistenciaMinima: number;
    modalidad?: 'MEDIA_GENERAL' | 'MEDIA_TECNICA';
    maxGradeLevel?: number;
    turnosHabilitados?: ('MANANA' | 'TARDE' | 'INTEGRAL')[];
    /**
     * Cómo se redondean las notas DEFINITIVAS (la del lapso y la de la materia
     * al cerrar el ciclo). 'MPPE': una fracción de 0,50 o más sube al entero
     * inmediato superior (Reglamento General de la LOE), cada lapso y luego la
     * definitiva. 'NINGUNO': a dos decimales, sin redondear al entero.
     */
    redondeoDeDefinitivas?: RedondeoDeDefinitivas;
    /**
     * Las palabras con que se evalúan las materias cualitativas (Orientación,
     * Grupos de Creación…), de mejor a peor. Por defecto: Consolidado, En
     * proceso, Iniciado.
     */
    apreciaciones?: string[];
    /** Las reglas del fin del año (`reglas-del-fin-de-ano.ts`). */
    revision: ReglasDeRevision;
    ultimoAnoConPendientes: UltimoAnoConPendientes;
    pendienteNoAprobada: PendienteNoAprobada;
    pendientes: ReglasDePendientes;
    laborSocial: ReglasDeLaborSocial;
    /** Los pesos del cuadro de honor (`reglas-del-cuadro.ts`). */
    cuadroDeHonor: ReglasDelCuadro;
}

export type RedondeoDeDefinitivas = 'MPPE' | 'NINGUNO';
