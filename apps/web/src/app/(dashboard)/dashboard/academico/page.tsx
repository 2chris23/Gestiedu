'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useAcademicYears } from '@/hooks/useAcademicYears';
import AcademicYearModal from '@/components/academic/AcademicYearModal';
import AcademicTimeline from '@/components/academic/AcademicTimeline';
import { toast } from 'sonner';

export default function AcademicPage() {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const queryClient = useQueryClient();

    // Con caché: al volver a esta pantalla los ciclos aparecen al instante y se
    // refrescan por detrás. Antes se pedían a mano en cada entrada y había que
    // esperar al esqueleto de carga todas las veces.
    const { data: years = [], isLoading: loading, error } = useAcademicYears();

    if (error) toast.error('Error al cargar años escolares');

    const loadYears = () => queryClient.invalidateQueries({ queryKey: ['academicYears'] });

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center px-4 md:px-0">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Línea de Tiempo Escolar</h1>
                    <p className="text-sm text-gray-500">Historial y gestión de ciclos académicos</p>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors shadow-sm"
                >
                    <Plus className="w-5 h-5 mr-2" />
                    Nuevo Ciclo
                </button>
            </div>

            {/* Timeline View */}
            <AcademicTimeline years={years} loading={loading} onRefresh={loadYears} />

            <AcademicYearModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                existingYears={years}
                onSuccess={() => {
                    loadYears();
                    setIsModalOpen(false);
                    toast.success('Año escolar creado correctamente');
                }}
            />
        </div>
    );
}
