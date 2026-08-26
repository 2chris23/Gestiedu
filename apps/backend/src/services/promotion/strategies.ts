/**
 * =====================================================================
 * MOTOR DE ESTRATEGIAS DE ASIGNACIÓN DE SECCIÓN — Fase 3.5 Parte C
 * =====================================================================
 * Sistema de plugins: cada estrategia es una función/clase independiente que
 * recibe la lista de estudiantes promocionados de un año y las secciones
 * disponibles del año siguiente, y devuelve una asignación SUGERIDA.
 *
 * Para agregar una QUINTA estrategia en el futuro:
 *   1. Implementa el contrato `AssignmentStrategy` (una función).
 *   2. Regístrala en `STRATEGIES` con su key/nombre/descripción.
 *   3. Queda disponible en la pantalla de revisión y en el API
 *      (listStrategies) sin rediseñar nada más.
 *
 * NINGUNA estrategia asigna de forma definitiva: el resultado es SIEMPRE
 * editable estudiante por estudiante antes de confirmar el cierre.
 */

export interface StudentForPlacement {
    id: string;
    /** Promedio final del estudiante (0-20, de mayor a menor importa en "rendimiento"). */
    average: number;
    /** Género opcional (para el balance por género; ausente = 'X' desconocido). */
    gender?: string | null;
    /** Letra de la sección actual (ej. 'A') para "mantener sección". */
    currentSection?: string | null;
    /** Nombre para mensajes (opcional). */
    name?: string;
}

export interface SectionOption {
    id: string;
    /** Letra de la sección (ej. 'A', 'B'). */
    section: string;
}

export type Assignment = { studentId: string; sectionId: string | null };

export interface AssignmentStrategy {
    key: string;
    name: string;
    description: string;
    /** Devuelve una asignación SUGERIDA (nunca definitiva). */
    assign: (
        students: StudentForPlacement[],
        sections: SectionOption[],
        options?: Record<string, any>
    ) => Assignment[];
}

/** (a) Mantener sección actual: misma letra en el año siguiente; si no existe, queda sin asignar. */
const keepCurrentSection: AssignmentStrategy = {
    key: 'keep-current-section',
    name: 'Mantener sección actual',
    description: 'Asigna a la sección con la misma letra del año siguiente; si no existe, queda sin asignar.',
    assign(students, sections) {
        const byLetter = new Map(sections.map(s => [s.section, s.id]));
        return students.map(st => ({
            studentId: st.id,
            sectionId: (st.currentSection && byLetter.get(st.currentSection)) || null,
        }));
    },
};

/** (b) Por rendimiento académico: reparto por promedio con 2 modos. */
const byPerformance: AssignmentStrategy = {
    key: 'by-performance',
    name: 'Por rendimiento académico',
    description:
        'Ordena por promedio final (de mayor a menor). Modo "top": los mejores juntos en la primera sección; modo "balanced" (serpentina): reparto equilibrado para nivel parejo entre secciones.',
    assign(students, sections, options = {}) {
        const mode: 'top' | 'balanced' = options.mode === 'balanced' ? 'balanced' : 'top';
        const sorted = [...students].sort((a, b) => b.average - a.average);
        const out: Assignment[] = [];
        if (sections.length === 0) {
            return sorted.map(s => ({ studentId: s.id, sectionId: null }));
        }

        if (mode === 'top') {
            // Los mejores todos juntos en la primera sección; el resto en las demás
            // repartido secuencialmente.
            const first = sections[0].id;
            sorted.forEach((st, i) => {
                out.push({
                    studentId: st.id,
                    sectionId: i < Math.ceil(sorted.length / 2) ? first : sections[i % sections.length]?.id ?? first,
                });
            });
            return out;
        }

        // Balanced: serpentina (nivel promedio parejo entre secciones)
        const columns: string[][] = sections.map(() => []);
        let col = 0;
        let dir = 1;
        sorted.forEach(st => {
            columns[col].push(st.id);
            if (col + dir >= sections.length || col + dir < 0) dir = -dir;
            else col += dir;
        });
        const map = new Map<string, string>();
        columns.forEach((ids, i) => ids.forEach(id => map.set(id, sections[i].id)));
        return students.map(st => ({ studentId: st.id, sectionId: map.get(st.id) ?? null }));
    },
};

/** (c) Aleatorio balanceado por género: reparto aleatorio manteniendo la proporción de género pareja. */
const randomBalancedByGender: AssignmentStrategy = {
    key: 'random-balanced-gender',
    name: 'Aleatorio balanceado por género',
    description: 'Distribuye al azar manteniendo la proporción de estudiantes por género lo más pareja posible entre secciones.',
    assign(students, sections) {
        const out: Assignment[] = [];
        if (sections.length === 0) {
            return students.map(s => ({ studentId: s.id, sectionId: null }));
        }
        // Agrupar por género (desconocido como grupo 'X')
        const groups = new Map<string, StudentForPlacement[]>();
        students.forEach(st => {
            const g = st.gender || 'X';
            const list = groups.get(g) || [];
            list.push(st);
            groups.set(g, list);
        });
        // Barajar cada grupo y repartir en serpentina sobre las secciones
        const assigned = new Map<string, string>();
        let idx = 0;
        let dir = 1;
        for (const [, group] of groups.entries()) {
            const shuffled = [...group].sort(() => Math.random() - 0.5);
            shuffled.forEach(st => {
                assigned.set(st.id, sections[idx].id);
                if (idx + dir >= sections.length || idx + dir < 0) dir = -dir;
                else idx += dir;
            });
        }
        return students.map(st => ({ studentId: st.id, sectionId: assigned.get(st.id) ?? null }));
    },
};

/** (d) Manual: no asigna nada automáticamente — el admin asigna en la revisión. */
const manual: AssignmentStrategy = {
    key: 'manual',
    name: 'Manual',
    description: 'No asigna nada automáticamente: genera la lista de promocionados sin sección para que el admin asigne uno por uno.',
    assign(students) {
        return students.map(st => ({ studentId: st.id, sectionId: null }));
    },
};

export const STRATEGIES: AssignmentStrategy[] = [
    keepCurrentSection,
    byPerformance,
    randomBalancedByGender,
    manual,
];

export function getStrategy(key: string): AssignmentStrategy {
    return STRATEGIES.find(s => s.key === key) || manual;
}

export function listStrategies(): Array<{ key: string; name: string; description: string }> {
    return STRATEGIES.map(({ key, name, description }) => ({ key, name, description }));
}
