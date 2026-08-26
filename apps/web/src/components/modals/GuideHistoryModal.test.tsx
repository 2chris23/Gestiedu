import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import GuideHistoryModal from './GuideHistoryModal';







// Mock Next.js router
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
    useRouter: () => ({
        push: mockPush,
    }),
}));



console.log('GuideHistoryModal type:', typeof GuideHistoryModal);
console.log('GuideHistoryModal value:', GuideHistoryModal);
// Mock imported icons from local adapter
jest.mock('@/components/icons', () => {
    const MockIcon = (props: any) => <div data-testid="lucide-icon" {...props} />;
    return {
        __esModule: true,
        X: MockIcon,
        Calendar: MockIcon,
        ChevronRight: MockIcon,
        User: MockIcon,
        History: MockIcon, // Fixes missing export crash
        // Add others if needed
    };
});

describe('GuideHistoryModal', () => {
    const mockGuideSections = [
        {
            academicYearId: 'year-2024',
            academicYearName: '2024',
            academicYearStatus: 'ACTIVE',
            classroomId: 'class-1',
            classroomName: '4to Año A',
            classroomSlug: '4to-ano-a',
            grade: 4,
            section: 'A',
        },
        {
            academicYearId: 'year-2023',
            academicYearName: '2023',
            academicYearStatus: 'COMPLETED',
            classroomId: 'class-2',
            classroomName: '3er Año B',
            classroomSlug: '3er-ano-b',
            grade: 3,
            section: 'B',
        },
    ];

    const mockOnClose = jest.fn();

    it('should not render when isOpen is false', () => {
        render(
            <GuideHistoryModal
                isOpen={false}
                onClose={mockOnClose}
                guideSections={mockGuideSections}
                teacherName="Juan Perez"
            />
        );

        expect(screen.queryByText('Historial de Secciones Guía')).not.toBeInTheDocument();
    });

    it('should render correct content when isOpen is true', () => {
        render(
            <GuideHistoryModal
                isOpen={true}
                onClose={mockOnClose}
                guideSections={mockGuideSections}
                teacherName="Juan Perez"
            />
        );

        expect(screen.getByText('Historial de Secciones Guía')).toBeInTheDocument();
        expect(screen.getByText('Año Académico 2024')).toBeInTheDocument();
        expect(screen.getByText('4to Año A')).toBeInTheDocument();
        expect(screen.getByText('Año Académico 2023')).toBeInTheDocument();
        expect(screen.getByText('3er Año B')).toBeInTheDocument();
    });

    it('should call onClose when close button is clicked', () => {
        render(
            <GuideHistoryModal
                isOpen={true}
                onClose={mockOnClose}
                guideSections={mockGuideSections}
                teacherName="Juan Perez"
            />
        );

        const closeButton = screen.getByLabelText('Cerrar modal');
        fireEvent.click(closeButton);

        expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
});
