/** Lo que trae a un alumno al consejo de sección (`services/consejo.service.ts`). */
export interface Motivos {
    reprobadas?: Array<{ materia: string; nota: number }>;
    asistencia?: number | null;
    observaciones?: number;
    aMano?: boolean;
}

/** «Reprobó Matemática (07) · asistencia 40 % · 1 observación» */
export function motivosLegibles(m: Motivos | null | undefined): string {
    if (!m) return '';
    const partes: string[] = [];
    if (m.reprobadas?.length) partes.push(`Reprobó ${m.reprobadas.map((r) => `${r.materia} (${String(Math.round(r.nota)).padStart(2, '0')})`).join(', ')}`);
    if (m.asistencia != null) partes.push(`asistencia ${m.asistencia} %`);
    if (m.observaciones) partes.push(m.observaciones === 1 ? '1 observación' : `${m.observaciones} observaciones`);
    if (m.aMano && partes.length === 0) partes.push('añadido en el consejo');
    return partes.join(' · ');
}
