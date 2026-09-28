/**
 * LAS PANTALLAS QUE SON UN PAPEL
 *
 * Una constancia, la boleta, el plan de evaluación impreso… se ven SOLAS, sin
 * la cabecera, la barra lateral ni la barra de abajo de la app: en pantalla, la
 * hoja con «Volver» e «Imprimir»; en el papel, solo la hoja.
 *
 * Antes se imprimían dentro del armazón y salían sucias (Cristian, 2026-09-27):
 * la cabecera del teléfono («PA ProfesorAdmin» y la campana) en la primera
 * hoja, la barra de abajo en todas, y una hoja en blanco al final. El corte
 * `lateral:` (1024 px) se mide contra el ancho del PAPEL, así que en carta se
 * imprimía la versión de teléfono.
 *
 * Toda pantalla nueva de papel va aquí; `documentos.test.ts` recorre las que
 * imprimen y exige que estén.
 */
const RUTAS_DE_PAPEL: RegExp[] = [
    /^\/dashboard\/(boleta|constancia|certificacion|acta-de-compromiso|carga-horaria|constancia-de-trabajo|planilla-de-inscripcion|notas-parciales|resumen-final|citaciones)\/[^/]+$/,
    /^\/dashboard\/carnets$/,
    /^\/dashboard\/acta-del-consejo\/[^/]+\/[^/]+$/,
    /^\/dashboard\/academico\/[^/]+\/(graduandos|matricula)$/,
    /^\/dashboard\/(plan-de-evaluacion|acta-de-socializacion|instrumentos-de-evaluacion)\/[^/]+\/[^/]+$/,
    /^\/dashboard\/comedor\/resumen$/,
];

export function esDocumento(pathname: string | null | undefined): boolean {
    if (!pathname) return false;
    // El portal del liceo antepone /instituto/<liceo>.
    const ruta = pathname.replace(/^\/instituto\/[^/]+(?=\/dashboard)/, '').replace(/\/$/, '');
    return RUTAS_DE_PAPEL.some((r) => r.test(ruta));
}
