
import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';

// --- Types ---

export type EvaluationType = 'prueba' | 'observacion' | 'analisis' | string; // Flexible
export type InstrumentType = 'escala' | 'lista' | 'examen' | 'guia' | string;

export interface Evaluation {
    id: string;
    type: EvaluationType; // Tecnica
    instrument: InstrumentType; // Instrumento
    points: number;
    criteria?: string[]; // e.g., ["Ortografía", "Puntualidad"]
    description?: string;
    appliedToBlockId?: string;
}

export interface TopicBlock {
    id: string;
    title: string;
    startWeek: number; // 1-based index
    duration: number; // in weeks
    parentId?: string; // If it's a subtopic
    childrenIds?: string[]; // If it's a parent topic
    evaluations?: Evaluation[];
    color?: string; // For visual distinction
}

export interface WeekData {
    id: number;
    label: string; // e.g., "02/01 - 06/01"
    isHoliday: boolean;
    holidayReason?: string;
}

export interface PlanSettings {
    startDate: Date | null;
    endDate: Date | null;
    classDays: string[]; // e.g., ["Lun", "Jue"]
    isConfigured: boolean;
}

export interface EvaluationPlanState {
    settings: PlanSettings;
    weeks: WeekData[];
    blocks: Record<string, TopicBlock>; // normalized state
    activeDragId: string | null;

    // History
    past: { blocks: Record<string, TopicBlock>, weeks: WeekData[] }[];
    future: { blocks: Record<string, TopicBlock>, weeks: WeekData[] }[];

    // Actions
    configurePlan: (start: Date, end: Date, days: string[]) => void;
    undo: () => void;
    redo: () => void;

    addTopic: (title: string, startWeek: number, duration: number) => void;
    updateBlock: (id: string, updates: Partial<TopicBlock>) => void;
    resizeBlock: (id: string, newDuration: number) => void; // NEW
    moveBlock: (id: string, newStartWeek: number) => void;
    deleteBlock: (id: string) => void;

    addSubtopics: (parentId: string, subtopicTitles: string[], mode: 'sequential' | 'parallel' | 'manual') => void;
    addEvaluation: (blockId: string, evaluation: Omit<Evaluation, 'id'>) => void;

    // Validation
    getTotalPoints: () => number;
}

// --- Helper to snapshot state ---
const saveHistory = (state: EvaluationPlanState) => {
    // We snapshot blocks and weeks. Settings usually don't change often but could.
    const snapshot = { blocks: state.blocks, weeks: state.weeks };
    const newPast = [...state.past, snapshot];
    if (newPast.length > 20) newPast.shift();
    return {
        past: newPast,
        future: []
    };
};

const calculateWeeks = (start: Date, end: Date): WeekData[] => {
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    const diff = Math.abs(end.getTime() - start.getTime());
    const weekCount = Math.ceil(diff / oneWeek) || 1;

    const weeks: WeekData[] = [];
    let current = new Date(start);

    for (let i = 0; i < weekCount; i++) {
        const weekEnd = new Date(current);
        weekEnd.setDate(current.getDate() + 4); // Mon-Fri approximation

        const label = `${current.getDate()}/${current.getMonth() + 1} - ${weekEnd.getDate()}/${weekEnd.getMonth() + 1}`;
        weeks.push({
            id: i + 1,
            label,
            isHoliday: false
        });

        current.setDate(current.getDate() + 7);
    }
    return weeks;
};

// --- Store ---

export const useEvaluationPlanStore = create<EvaluationPlanState>((set, get) => ({
    settings: {
        startDate: null,
        endDate: null,
        classDays: [],
        isConfigured: false
    },
    weeks: [],
    blocks: {},
    activeDragId: null,
    past: [],
    future: [],

    configurePlan: (start, end, days) => {
        const weeks = calculateWeeks(start, end);
        set({
            settings: { startDate: start, endDate: end, classDays: days, isConfigured: true },
            weeks,
            blocks: {},
            past: [],
            future: []
        });
    },

    undo: () => {
        set((state) => {
            if (state.past.length === 0) return state;

            const previous = state.past[state.past.length - 1];
            const newPast = state.past.slice(0, -1);

            return {
                blocks: previous.blocks,
                weeks: previous.weeks,
                past: newPast,
                future: [{ blocks: state.blocks, weeks: state.weeks }, ...state.future]
            };
        });
    },

    redo: () => {
        set((state) => {
            if (state.future.length === 0) return state;

            const next = state.future[0];
            const newFuture = state.future.slice(1);

            return {
                blocks: next.blocks,
                weeks: next.weeks,
                past: [...state.past, { blocks: state.blocks, weeks: state.weeks }],
                future: newFuture
            };
        });
    },

    addTopic: (title, startWeek, duration) => {
        const id = uuidv4();
        const newBlock: TopicBlock = {
            id,
            title,
            startWeek,
            duration,
            childrenIds: [],
        };

        set((state) => ({
            ...saveHistory(state),
            blocks: { ...state.blocks, [id]: newBlock }
        }));
    },

    updateBlock: (id, updates) => {
        set((state) => ({
            ...saveHistory(state),
            blocks: {
                ...state.blocks,
                [id]: { ...state.blocks[id], ...updates }
            }
        }));
    },

    resizeBlock: (id, newDuration) => {
        set((state) => {
            const block = state.blocks[id];
            if (!block) return state;
            if (newDuration < 1) return state; // Minimum 1 week

            return {
                ...saveHistory(state),
                blocks: {
                    ...state.blocks,
                    [id]: { ...block, duration: newDuration }
                }
            };
        });
    },

    moveBlock: (id, newStartWeek) => {
        set((state) => {
            const block = state.blocks[id];
            if (!block) return state;

            const maxStart = state.weeks.length - block.duration + 1;
            const validStart = Math.max(1, Math.min(newStartWeek, maxStart));

            if (block.startWeek === validStart) return state;

            return {
                ...saveHistory(state),
                blocks: {
                    ...state.blocks,
                    [id]: { ...block, startWeek: validStart }
                }
            };
        });
    },

    deleteBlock: (id) => {
        set((state) => {
            const { [id]: deleted, ...remaining } = state.blocks;
            return {
                ...saveHistory(state),
                blocks: remaining
            };
        });
    },

    addSubtopics: (parentId, titles, mode) => {
        set((state) => {
            const parent = state.blocks[parentId];
            if (!parent) return state;

            const newBlocks: Record<string, TopicBlock> = {};
            const childIds: string[] = [];

            if (mode === 'sequential') {
                const durationPerChild = Math.floor(parent.duration / titles.length) || 1;
                let currentWeek = parent.startWeek;

                titles.forEach((title, index) => {
                    const id = uuidv4();
                    newBlocks[id] = {
                        id,
                        title,
                        startWeek: currentWeek,
                        duration: durationPerChild,
                        parentId,
                    };
                    childIds.push(id);
                    currentWeek += durationPerChild;
                });
            } else if (mode === 'parallel') {
                titles.forEach((title) => {
                    const id = uuidv4();
                    newBlocks[id] = {
                        id,
                        title,
                        startWeek: parent.startWeek,
                        duration: parent.duration,
                        parentId,
                    };
                    childIds.push(id);
                });
            }

            return {
                ...saveHistory(state),
                blocks: {
                    ...state.blocks,
                    ...newBlocks,
                    [parentId]: { ...parent, childrenIds: childIds }
                }
            };
        });
    },

    addEvaluation: (blockId, evaluation) => {
        set((state) => {
            const block = state.blocks[blockId];
            if (!block) return state;

            const newEval: Evaluation = { ...evaluation, id: uuidv4() };
            const currentEvals = block.evaluations || [];

            return {
                ...saveHistory(state),
                blocks: {
                    ...state.blocks,
                    [blockId]: { ...block, evaluations: [...currentEvals, newEval] }
                }
            };
        });
    },

    getTotalPoints: () => {
        const state = get();
        let total = 0;
        Object.values(state.blocks).forEach(block => {
            block.evaluations?.forEach(ev => total += ev.points);
        });
        return total;
    }

}));
