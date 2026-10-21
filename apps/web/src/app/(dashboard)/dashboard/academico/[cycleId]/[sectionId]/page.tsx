'use client';

import { useLaSeccion } from '@/components/seccion/useLaSeccion';
import { VentanasDeLaSeccion } from '@/components/seccion/VentanasDeLaSeccion';
import { PestanasDeLaSeccion } from '@/components/seccion/PestanasDeLaSeccion';

import {
    Users,
    FileText,
    IdCard,
} from 'lucide-react';
import AcademicStats from '@/components/academic/AcademicStats';
import StudentScheduleSection from '@/components/schedule/StudentScheduleSection';
import LapsoSelector from '@/components/academic/LapsoSelector'; // Fase 3.5 — filtro por lapso
import CargandoSeccion from './loading';
import { BotonDeDocumentos, CabezaDeLaClase } from '@/components/academic/CabezaDeLaClase';

// Params refactored: year -> cycleId, slug -> sectionId
export default function SectionPage({ params }: { params: Promise<{ cycleId: string, sectionId: string }> }) {
    const c = useLaSeccion({ params });
    const {
        cycleId,
        sectionId,
        setIsAssignTeacherModalOpen,
        classroom,
        classroomId,
        lapsoId,
        setLapsoId,
        classroomStats,
        yo,
        scheduleBlocks,
    } = c;

    // Show loading state while classroom data is being fetched
    if (!classroom) {
        return <CargandoSeccion />;
    }

    return (
        /*
            SIN CAJA GRIS PROPIA

            La página iba metida en una caja de otro gris (#F3F4F6) con 24 px
            de margen, dentro del fondo del panel, que es otro: en el teléfono
            se veía un rectángulo de otro color con un marco claro alrededor.
            Ahora usa el fondo y el margen del panel, como las demás.
        */
        <div className="space-y-5 text-slate-800">
            <header className="flex flex-col gap-4">
                <CabezaDeLaClase
                    volverA={`/dashboard/academico/${cycleId}`}
                    rotuloVolver="Volver al año escolar"
                    titulo={classroom.name}
                    subtitulo={classroom.academicYear?.name}
                    profesor={{
                        rotulo: 'Profesor guía',
                        nombre: classroom.teacher ? `${classroom.teacher.firstName} ${classroom.teacher.lastName}` : null,
                        avatar: (classroom.teacher as any)?.avatar,
                        alCambiar: yo?.role === 'ADMIN' ? () => setIsAssignTeacherModalOpen(true) : undefined,
                    }}
                >
                    <LapsoSelector
                        periods={((classroom as any)?.academicYear?.periods || []).map((p: any) => ({ id: p.id, name: p.name }))}
                        value={lapsoId}
                        onChange={setLapsoId}
                        compact
                    />
                    {classroomId && (
                        <BotonDeDocumentos
                            titulo="Documentos de la sección"
                            documentos={[
                                // El resumen final: el admin y el guía de la sección (lo decide el servidor).
                                ...((yo?.role === 'ADMIN' || (yo?.role === 'TEACHER' && ((classroom as any)?.teacherId ?? (classroom?.teacher as any)?.id) === yo?.id))
                                    ? [{ href: `/dashboard/resumen-final/${encodeURIComponent(classroomId)}`, titulo: 'Resumen final', detalle: 'Las notas definitivas del año, para el Ministerio', icono: FileText }]
                                    : []),
                                // El consejo de sección: lo escriben el admin y el guía; lo leen los profesores de la sección.
                                ...(yo?.role === 'ADMIN' || yo?.role === 'TEACHER'
                                    ? [{ href: `/dashboard/consejo/${encodeURIComponent(classroomId)}`, titulo: 'Consejo de sección', detalle: 'El acta de cada lapso, alumno por alumno', icono: Users }]
                                    : []),
                                ...(yo?.role === 'ADMIN'
                                    ? [{ href: `/dashboard/carnets?seccion=${encodeURIComponent(classroomId)}`, titulo: 'Carnets', detalle: 'Los carnets de los estudiantes, para imprimir', icono: IdCard }]
                                    : []),
                            ]}
                        />
                    )}
                </CabezaDeLaClase>

                {/* Estadísticas Académicas de la Sección */}
                <div>
                    <AcademicStats
                        stats={classroomStats}
                        averageTitle="Promedio Sección"
                        inicioDelLapso={((classroom as any)?.academicYear?.periods || []).find((p: any) => p.id === lapsoId)?.startDate}
                    />
                </div>
            </header>

            {/* Vista Rápida del Horario */}
            <div className="relative">
                <StudentScheduleSection
                    schedule={scheduleBlocks}
                    role={yo?.role === 'TEACHER' || yo?.role === 'ADMIN' ? 'teacher' : 'student'}
                    showActions={true}
                    classroomId={classroomId}
                    // El horario lo arma el admin (el servidor lo exige): al profesor el lápiz
                    // le abría un editor que no podía guardar.
                    editUrl={yo?.role === 'ADMIN' ? `/dashboard/horario/${cycleId}/${sectionId}` : undefined}
                    titulo={classroom?.name ? `Horario · ${classroom.name}` : 'Horario de la sección'}
                />
            </div>

            <PestanasDeLaSeccion c={c} />

            <VentanasDeLaSeccion c={c} />
        </div>
    );
}
