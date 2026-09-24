'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useAcademicYears } from '@/hooks/useAcademicYears';
import AcademicYearModal from '@/components/academic/AcademicYearModal';
import AcademicTimeline from '@/components/academic/AcademicTimeline';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { EncabezadoDePantalla } from '@/components/ui/encabezado-de-pantalla';
import { esQueNoContesta } from '@/lib/estado-del-servidor';

export default function AcademicPage() {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const queryClient = useQueryClient();

    // Con caché: al volver a esta pantalla los ciclos aparecen al instante y se
    // refrescan por detrás. Antes se pedían a mano en cada entrada y había que
    // esperar al esqueleto de carga todas las veces.
    const { data: years = [], isLoading: loading, error } = useAcademicYears();

    // En un efecto y una vez: dentro del render salía un aviso por cada
    // repintado. Y sin conexión no se avisa aquí: ya lo dice la franja de
    // arriba, y los ciclos guardados se siguen viendo.
    useEffect(() => {
        if (error && !esQueNoContesta(error)) toast.error('Error al cargar años escolares');
    }, [error]);

    const loadYears = () => queryClient.invalidateQueries({ queryKey: ['academicYears'] });

    return (
        <div className="space-y-6">
            {/* Sin `px-4` propio: el contenedor de la pantalla ya lo pone, y con
                los dos el título empezaba 16 px más adentro que todo lo demás. */}
            <EncabezadoDePantalla
                titulo="Línea de Tiempo Escolar"
                descripcion="Historial y gestión de ciclos académicos"
                acciones={
                    <Button onClick={() => setIsModalOpen(true)}>
                        <Plus aria-hidden />
                        Nuevo Ciclo
                    </Button>
                }
            />

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
