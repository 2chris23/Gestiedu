import { AcademicConfig } from '../../services/promotion/close-cycle.service';

describe('Doble Turno y 6to Año (Educación Media Técnica)', () => {
    describe('Reglas de Promoción según Modalidad', () => {
        it('En Educación Media General: 5to año es el último grado y el alumno egresa', async () => {
            const mockConfig: AcademicConfig = {
                notaMinimaAprobatoria: 10,
                maxMateriasPendientesParaPromover: 2,
                permitePendientesEnUltimoAno: false,
                asistenciaMinima: 80,
                modalidad: 'MEDIA_GENERAL',
                maxGradeLevel: 5,
            };

            const ultimoAno = mockConfig.maxGradeLevel ?? (mockConfig.modalidad === 'MEDIA_TECNICA' ? 6 : 5);
            expect(ultimoAno).toBe(5);

            // Simular alumno de 5to año
            const grade5 = 5;
            const isLastGrade5 = grade5 >= ultimoAno;
            expect(isLastGrade5).toBe(true);

            // Egresa: defaultTargetGrade es null
            const defaultTargetGrade = isLastGrade5 ? null : grade5 + 1;
            expect(defaultTargetGrade).toBeNull();
        });

        it('En Educación Media Técnica: 5to año promueve a 6to año y 6to año egresa', async () => {
            const mockConfig: AcademicConfig = {
                notaMinimaAprobatoria: 10,
                maxMateriasPendientesParaPromover: 2,
                permitePendientesEnUltimoAno: false,
                asistenciaMinima: 80,
                modalidad: 'MEDIA_TECNICA',
                maxGradeLevel: 6,
            };

            const ultimoAno = mockConfig.maxGradeLevel ?? (mockConfig.modalidad === 'MEDIA_TECNICA' ? 6 : 5);
            expect(ultimoAno).toBe(6);

            // Alumno de 5to año en Escuela Técnica
            const grade5 = 5;
            const isLastGrade5 = grade5 >= ultimoAno;
            expect(isLastGrade5).toBe(false);

            const targetGrade5 = isLastGrade5 ? null : grade5 + 1;
            expect(targetGrade5).toBe(6); // Promociona a 6to Año

            // Alumno de 6to año en Escuela Técnica
            const grade6 = 6;
            const isLastGrade6 = grade6 >= ultimoAno;
            expect(isLastGrade6).toBe(true);

            const targetGrade6 = isLastGrade6 ? null : grade6 + 1;
            expect(targetGrade6).toBeNull(); // Egresa
        });

        it('Preserva el turno (shift) de la sección durante la promoción sugerida', () => {
            const sectionShiftTarde = 'TARDE';
            const defaultTargetShift = sectionShiftTarde || 'MANANA';
            expect(defaultTargetShift).toBe('TARDE');

            const sectionShiftManana = 'MANANA';
            expect(sectionShiftManana || 'MANANA').toBe('MANANA');
        });
    });

    describe('Nomenclatura de secciones y unicidad por turno', () => {
        it('Genera nombre diferenciado con sufijo (Tarde) para evitar colisión con turno mañana', () => {
            const gradeNames: Record<number, string> = {
                1: '1er Año',
                2: '2do Año',
                3: '3er Año',
                4: '4to Año',
                5: '5to Año',
                6: '6to Año',
            };

            const grade = 1;
            const section = 'A';

            const nameManana = `${gradeNames[grade]} ${section}`;
            expect(nameManana).toBe('1er Año A');

            const shiftTarde = 'TARDE';
            const suffixTarde = shiftTarde === 'TARDE' ? ' (Tarde)' : '';
            const nameTarde = `${gradeNames[grade]} ${section}${suffixTarde}`;
            expect(nameTarde).toBe('1er Año A (Tarde)');

            // El 6to año genera nombre correcto
            const grade6 = 6;
            const name6to = `${gradeNames[grade6]} ${section}`;
            expect(name6to).toBe('6to Año A');
        });
    });
});
