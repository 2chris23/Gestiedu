/**
 * =====================================================================
 * MOTOR DE ESTRATEGIAS DE ASIGNACIÓN DE SECCIÓN — Fase 3.5 Parte C
 * =====================================================================
 * Cada estrategia distribuye a los estudiantes dentro de las secciones
 * del AÑO DESTINO correspondiente (1º -> 2º, 2º -> 3º, repitentes en su mismo año).
 * Los estudiantes de 5to año (egresados) no se asignan a ninguna sección.
 */

export interface StudentForPlacement {
    id: string;
    /** Promedio final del estudiante (0-20). */
    average: number;
    /** Género: MASCULINO | FEMENINO | OTRO. */
    gender?: string | null;
    /** Letra de la sección actual (ej. 'A', 'B'). */
    currentSection?: string | null;
    /** Año actual del estudiante (1 a 6). */
    currentGrade: number;
    /** Turno actual (MANANA | TARDE | INTEGRAL). */
    currentShift?: string | null;
    /** Año destino calculado (1 a 6, o null si es egresado/retirado). */
    targetGrade: number | null;
    /** Turno destino calculado. */
    targetShift?: string | null;
    /** Indica si es el último año (egresado). */
    isLastGrade?: boolean;
    /** Nombre para mensajes (opcional). */
    name?: string;
}

export interface SectionOption {
    id: string;
    /** Letra de la sección (ej. 'A', 'B', 'C'). */
    section: string;
    /** Año al que pertenece la sección (1 a 6). */
    grade: number;
    /** Turno de la sección (MANANA | TARDE | INTEGRAL). */
    shift?: string | null;
    /** Capacidad máxima de cupos. */
    capacity?: number | null;
}

export type Assignment = { studentId: string; sectionId: string | null };

export interface AssignmentStrategy {
    key: string;
    name: string;
    description: string;
    assign: (
        students: StudentForPlacement[],
        sections: SectionOption[],
        options?: Record<string, any>
    ) => Assignment[];
}

/** Agrupa estudiantes por su targetGrade para que cada grupo se asigne únicamente en su año destino */
function assignByGradeGroup(
    students: StudentForPlacement[],
    sections: SectionOption[],
    assignFn: (groupStudents: StudentForPlacement[], gradeSections: SectionOption[]) => Assignment[]
): Assignment[] {
    const results: Assignment[] = [];

    // Estudiantes que no van a ninguna sección (egresados de 5to año o retirados)
    const noPlacementStudents = students.filter(s => s.isLastGrade || s.targetGrade === null);
    noPlacementStudents.forEach(s => {
        results.push({ studentId: s.id, sectionId: null });
    });

    // Agrupar los demás por targetGrade
    const activeStudents = students.filter(s => !s.isLastGrade && s.targetGrade !== null);
    const byGrade = new Map<number, StudentForPlacement[]>();

    activeStudents.forEach(s => {
        const g = s.targetGrade!;
        const list = byGrade.get(g) || [];
        list.push(s);
        byGrade.set(g, list);
    });

    for (const [grade, groupStudents] of byGrade.entries()) {
        const gradeSections = sections.filter(sec => sec.grade === grade);
        if (gradeSections.length === 0) {
            groupStudents.forEach(s => results.push({ studentId: s.id, sectionId: null }));
        } else {
            const groupAssignments = assignFn(groupStudents, gradeSections);
            results.push(...groupAssignments);
        }
    }

    return results;
}

/** (a) Mantener sección actual: Misma letra en el año destino correspondiente (1º A -> 2º A, 1º B -> 2º B). */
const keepCurrentSection: AssignmentStrategy = {
    key: 'keep-current-section',
    name: 'Mantener sección actual',
    description: 'Asigna a la sección con la misma letra en el año destino (ej. 1º A pasa a 2º A, 1º B a 2º B).',
    assign(students, sections) {
        return assignByGradeGroup(students, sections, (group, gradeSections) => {
            const byLetter = new Map(gradeSections.map(s => [s.section.toUpperCase(), s.id]));
            return group.map(st => {
                const currentLetter = (st.currentSection || '').toUpperCase();
                const matchedId = byLetter.get(currentLetter) || null;
                return {
                    studentId: st.id,
                    sectionId: matchedId,
                };
            });
        });
    },
};

/** (b) Por rendimiento académico: Reparte a los alumnos en el año destino según su promedio. */
const byPerformance: AssignmentStrategy = {
    key: 'by-performance',
    name: 'Por rendimiento académico',
    description: 'Distribuye a los alumnos en su año destino equilibrando el promedio de notas entre las secciones.',
    assign(students, sections, options = {}) {
        const mode: 'top' | 'balanced' = options.mode === 'top' ? 'top' : 'balanced';

        return assignByGradeGroup(students, sections, (group, gradeSections) => {
            const sorted = [...group].sort((a, b) => b.average - a.average);
            if (gradeSections.length === 0) {
                return sorted.map(s => ({ studentId: s.id, sectionId: null }));
            }

            if (mode === 'top') {
                const first = gradeSections[0].id;
                return sorted.map((st, i) => ({
                    studentId: st.id,
                    sectionId: i < Math.ceil(sorted.length / 2) ? first : gradeSections[i % gradeSections.length]?.id ?? first,
                }));
            }

            // Balanced (serpentina)
            const columns: string[][] = gradeSections.map(() => []);
            let col = 0;
            let dir = 1;
            sorted.forEach(st => {
                columns[col].push(st.id);
                if (col + dir >= gradeSections.length || col + dir < 0) dir = -dir;
                else col += dir;
            });
            const map = new Map<string, string>();
            columns.forEach((ids, i) => ids.forEach(id => map.set(id, gradeSections[i].id)));
            return group.map(st => ({ studentId: st.id, sectionId: map.get(st.id) ?? null }));
        });
    },
};

/** (c) Aleatorio balanceado por género: Mantiene la proporción de varones y hembras equitativa. */
const randomBalancedByGender: AssignmentStrategy = {
    key: 'random-balanced-gender',
    name: 'Aleatorio balanceado por género',
    description: 'Distribuye al azar en el año destino manteniendo la proporción de varones y hembras pareja.',
    assign(students, sections) {
        return assignByGradeGroup(students, sections, (group, gradeSections) => {
            if (gradeSections.length === 0) {
                return group.map(s => ({ studentId: s.id, sectionId: null }));
            }

            const groups = new Map<string, StudentForPlacement[]>();
            group.forEach(st => {
                const g = st.gender || 'OTRO';
                const list = groups.get(g) || [];
                list.push(st);
                groups.set(g, list);
            });

            const assigned = new Map<string, string>();
            let idx = 0;
            let dir = 1;
            for (const [, genderGroup] of groups.entries()) {
                const shuffled = [...genderGroup].sort(() => Math.random() - 0.5);
                shuffled.forEach(st => {
                    assigned.set(st.id, gradeSections[idx].id);
                    if (idx + dir >= gradeSections.length || idx + dir < 0) dir = -dir;
                    else idx += dir;
                });
            }
            return group.map(st => ({ studentId: st.id, sectionId: assigned.get(st.id) ?? null }));
        });
    },
};

/** (d) Manual: Deja los destinos para selección manual del administrador. */
const manual: AssignmentStrategy = {
    key: 'manual',
    name: 'Manual',
    description: 'No asigna automáticamente: permite al administrador seleccionar manualmente el año y sección para cada alumno.',
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
