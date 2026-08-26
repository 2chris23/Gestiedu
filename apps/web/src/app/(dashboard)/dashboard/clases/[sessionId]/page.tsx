'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Calendar as CalendarIcon, Clock, BookOpen, Save, FileText, CheckCircle2, AlertCircle, Users, ChevronRight } from 'lucide-react';
import { useClassSession, useUpdateClassSession } from '@/hooks/useClassSessions';
import { useStudents } from '@/hooks/useStudents';
import EvaluationPlanSection from '@/components/evaluation/EvaluationPlanSection';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import Link from 'next/link';

export default function ClassSessionPage() {
    const params = useParams();
    const router = useRouter();
    const sessionId = params.sessionId as string;

    const { data: session, isLoading, isError } = useClassSession(sessionId);
    const updateSessionMutation = useUpdateClassSession(sessionId);

    // Fetch students for this classroom (for the evaluation plan)
    const { data: classroomStudentsData } = useStudents(session?.classroomId || '', { limit: 200 });
    const classroomStudents = classroomStudentsData?.students || [];

    const [topic, setTopic] = useState('');
    const [observations, setObservations] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);

    // Initialize local state when data loads
    useEffect(() => {
        if (session) {
            setTopic(session.topic || '');
            setObservations(session.observations || '');
        }
    }, [session]);

    if (isLoading) {
        return (
            <div className="flex h-[80vh] items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    if (isError || !session) {
        return (
            <div className="flex flex-col items-center justify-center h-[50vh]">
                <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
                <h2 className="text-xl font-bold text-gray-800">Sesión no encontrada</h2>
                <p className="text-gray-500 mt-2">La sesión que intentas buscar no existe o hubo un error.</p>
                <button 
                    onClick={() => router.back()}
                    className="mt-6 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                    Volver atrás
                </button>
            </div>
        );
    }

    const handleSave = async () => {
        try {
            await updateSessionMutation.mutateAsync({
                topic,
                observations
            });
            setIsEditing(false);
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 3000);
        } catch (error) {
            console.error('Error saving session details', error);
        }
    };

    const formattedDate = format(new Date(session.date), "EEEE, d 'de' MMMM, yyyy", { locale: es });

    return (
        <div className="max-w-7xl mx-auto space-y-6 px-4 sm:px-6 lg:px-8 py-8">
            {/* Breadcrumb Navigation */}
            <nav className="flex items-center gap-2 text-sm text-gray-500 bg-white px-4 py-2 rounded-lg border border-gray-100 shadow-sm w-fit">
                <Link href="/dashboard/horarios" className="hover:text-indigo-600 transition-colors">
                    Horarios
                </Link>
                <ChevronRight size={14} />
                <Link
                    href={`/dashboard/horarios/seccion/${session.classroomId}`}
                    className="hover:text-indigo-600 transition-colors font-medium text-gray-700"
                >
                    {session.classroom?.name}
                </Link>
                <ChevronRight size={14} />
                <span className="font-semibold text-indigo-600">Sesión del {format(new Date(session.date), "dd/MM/yyyy")}</span>
            </nav>

            {/* Encabezado */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
                    <div className="flex items-start gap-4">
                        <button
                            onClick={() => router.back()}
                            className="p-2 -ml-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <span className="px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-full border border-indigo-100">
                                    {session.classroom?.name || 'Sección Desconocida'}
                                </span>
                                {session.subject && (
                                    <span 
                                        className="px-3 py-1 text-xs font-bold rounded-full"
                                        style={{ 
                                            backgroundColor: session.subject.color ? `${session.subject.color}15` : '#f3f4f6',
                                            color: session.subject.color || '#4b5563',
                                            borderColor: session.subject.color ? `${session.subject.color}30` : '#e5e7eb',
                                            borderWidth: '1px'
                                        }}
                                    >
                                        {session.subject.name}
                                    </span>
                                )}
                            </div>
                            <h1 className="text-2xl font-bold text-gray-900">
                                Detalles de Clase
                            </h1>
                            <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-gray-500 font-medium">
                                <span className="flex items-center gap-1.5">
                                    <CalendarIcon className="w-4 h-4 text-gray-400" />
                                    <span className="capitalize">{formattedDate}</span>
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <Clock className="w-4 h-4 text-gray-400" />
                                    {session.startTime || '--:--'} - {session.endTime || '--:--'}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        {isEditing ? (
                            <>
                                <button
                                    onClick={() => {
                                        setTopic(session.topic || '');
                                        setObservations(session.observations || '');
                                        setIsEditing(false);
                                    }}
                                    className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={updateSessionMutation.isPending}
                                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50"
                                >
                                    <Save className="w-4 h-4" />
                                    {updateSessionMutation.isPending ? 'Guardando...' : 'Guardar Cambios'}
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={() => setIsEditing(true)}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                            >
                                <FileText className="w-4 h-4" />
                                Editar Detalles
                            </button>
                        )}
                    </div>
                </div>

                {saveSuccess && (
                    <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3 animate-fade-in">
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                        <p className="text-sm font-medium text-green-800">Los detalles de la clase han sido actualizados correctamente.</p>
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Contenido Principal */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Tema de la Clase */}
                        <div className="bg-gray-50/50 rounded-xl border border-gray-100 p-5">
                            <div className="flex items-center gap-2 mb-4">
                                <BookOpen className="w-5 h-5 text-indigo-600" />
                                <h3 className="text-base font-bold text-gray-900">Tema de la Clase</h3>
                            </div>
                            {isEditing ? (
                                <input
                                    type="text"
                                    value={topic}
                                    onChange={(e) => setTopic(e.target.value)}
                                    placeholder="Ej: Introducción a Ecuaciones Cuadráticas..."
                                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow outline-none font-medium"
                                />
                            ) : (
                                <p className={`text-base ${session.topic ? 'text-gray-800 font-medium' : 'text-gray-400 italic'}`}>
                                    {session.topic || 'No se ha registrado un tema para esta clase.'}
                                </p>
                            )}
                        </div>

                        {/* Observaciones */}
                        <div className="bg-gray-50/50 rounded-xl border border-gray-100 p-5">
                            <div className="flex items-center gap-2 mb-4">
                                <FileText className="w-5 h-5 text-indigo-600" />
                                <h3 className="text-base font-bold text-gray-900">Observaciones y Notas</h3>
                            </div>
                            {isEditing ? (
                                <textarea
                                    value={observations}
                                    onChange={(e) => setObservations(e.target.value)}
                                    placeholder="Notas adicionales, incidentes, o recordatorios para la próxima clase..."
                                    rows={5}
                                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow outline-none resize-none"
                                />
                            ) : (
                                <div className={`text-sm whitespace-pre-wrap ${session.observations ? 'text-gray-700' : 'text-gray-400 italic'}`}>
                                    {session.observations || 'Sin observaciones registradas.'}
                                </div>
                            )}
                        </div>
                        
                        {/* Plan de Evaluación - Real Component */}
                        {session.subjectId && session.classroomId && (
                            <EvaluationPlanSection
                                classroomId={session.classroomId}
                                subjectId={session.subjectId}
                                canEdit={true}
                            />
                        )}
                    </div>

                    {/* Barra Lateral (Asistencia) */}
                    <div className="space-y-6">
                        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                            <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex flex-col items-center justify-center py-8">
                                <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4">
                                    <Users className="w-8 h-8" />
                                </div>
                                <h3 className="text-lg font-bold text-gray-900 mb-1">Control de Asistencia</h3>
                                <p className="text-sm text-gray-500 text-center px-4">
                                    Registra quién asistió a esta clase específica.
                                </p>
                            </div>
                            <div className="p-5">
                                <Link
                                    href={`/dashboard/asistencia?sessionId=${sessionId}`}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-all shadow-sm hover:shadow"
                                >
                                    Ir a Módulo de Asistencia
                                    <ArrowLeft className="w-4 h-4 rotate-180" />
                                </Link>
                                
                                <div className="mt-4 flex justify-between items-center text-sm p-3 bg-gray-50 rounded-lg">
                                    <span className="font-medium text-gray-600">Estado</span>
                                    {session.attendanceRecords && session.attendanceRecords.length > 0 ? (
                                        <span className="flex items-center gap-1.5 text-green-600 font-bold">
                                            <CheckCircle2 className="w-4 h-4" />
                                            Registrada
                                        </span>
                                    ) : (
                                        <span className="text-amber-600 font-bold">Pendiente</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
