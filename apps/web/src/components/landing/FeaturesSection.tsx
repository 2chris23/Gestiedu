'use client';

import { 
    Clock, 
    GraduationCap, 
    Award, 
    Users, 
    CreditCard, 
    ShieldCheck, 
    Calendar,
    BookOpen,
    FileSpreadsheet,
    CheckCircle2
} from 'lucide-react';

const FEATURES = [
    {
        icon: Clock,
        title: 'Doble Turno Integrado',
        subtitle: 'Turnos Mañana y Tarde',
        description: 'Gestión simultánea de secciones en turno matutino (7:00 AM - 12:45 PM) y vespertino (1:00 PM - 6:00 PM). Asignación inteligente de profesores y aulas sin solapamientos.',
        badge: 'Nuevo en 2026',
        color: 'blue',
    },
    {
        icon: GraduationCap,
        title: 'Educación Media Técnica (6to Año)',
        subtitle: 'Media General y Técnica',
        description: 'Soporte completo para especialidades y menciones técnicas (Informática, Contabilidad, Salud, Agropecuaria). Ciclo de promoción automática y gestión de pasantías.',
        badge: 'Conforme MPPE',
        color: 'indigo',
    },
    {
        icon: Award,
        title: 'Calificaciones por Lapsos Oficiales',
        subtitle: 'Escala 01 a 20 Puntos',
        description: 'Estructuración en tres lapsos académicos venezolanos. Ponderación por planes de evaluación, cálculo instantáneo de definitivas y actas oficiales de notas.',
        badge: 'Normativa Oficial',
        color: 'blue',
    },
    {
        icon: Users,
        title: 'Control de Asistencia y Matrícula',
        subtitle: 'Asistencia Diaria o por Hora',
        description: 'Registro de asistencia en tiempo real con vinculación a cédulas escolares, representantes legales y alertas automáticas por porcentaje de inasistencias.',
        badge: 'Tiempo Real',
        color: 'indigo',
    },
    {
        icon: CreditCard,
        title: 'Módulo de Pagos y Mensualidades',
        subtitle: 'Tasa BCV y Multidivisa',
        description: 'Registro ágil de mensualidades, abonos y cuotas escolares en bolívares y divisas con conversión oficial automática, historial y comprobantes digitales.',
        badge: 'Administración',
        color: 'blue',
    },
    {
        icon: ShieldCheck,
        title: 'Aislamiento Multi-Liceo y Auditoría',
        subtitle: 'Bases de Datos Dedicadas',
        description: 'Arquitectura multi-inquilino de alta seguridad. Cada colegio posee su base de datos independiente, garantizando aislamiento estricto de estudiantes y notas.',
        badge: 'Seguridad',
        color: 'indigo',
    },
];

export function FeaturesSection() {
    return (
        <section id="funciones" className="py-24 px-4 sm:px-6 lg:px-8 bg-white relative">
            <div className="max-w-7xl mx-auto">
                {/* Cabecera */}
                <div className="text-center max-w-3xl mx-auto mb-16">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold uppercase tracking-wider mb-3 border border-blue-100">
                        <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                        Módulos Académicos
                    </span>
                    <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
                        Específicamente adaptado a las <br className="hidden sm:inline" />
                        <span className="text-blue-600">normas del sistema educativo venezolano</span>
                    </h2>
                    <p className="mt-4 text-base sm:text-lg text-slate-600 leading-relaxed">
                        Cada función fue desarrollada con base en la estructura ministerial de evaluación por lapsos, la doble jornada de liceos y la formación media técnica.
                    </p>
                </div>

                {/* Cuadrícula de características */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {FEATURES.map((feature, idx) => {
                        const Icon = feature.icon;
                        return (
                            <div
                                key={idx}
                                className="group relative bg-white rounded-2xl p-7 border border-slate-200/90 shadow-sm hover:shadow-xl hover:border-blue-300 transition-all duration-300 flex flex-col justify-between"
                            >
                                <div>
                                    <div className="flex items-center justify-between mb-5">
                                        <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors duration-300">
                                            <Icon className="w-6 h-6" />
                                        </div>
                                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                                            {feature.badge}
                                        </span>
                                    </div>

                                    <h3 className="text-xl font-bold text-slate-900 mb-1 group-hover:text-blue-600 transition-colors duration-200">
                                        {feature.title}
                                    </h3>
                                    <h4 className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-3">
                                        {feature.subtitle}
                                    </h4>

                                    <p className="text-sm text-slate-600 leading-relaxed">
                                        {feature.description}
                                    </p>
                                </div>

                                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center text-xs font-medium text-blue-600 gap-1">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />
                                    <span>Habilitado de fábrica</span>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Bloque destacado de Doble Turno & 6to Año */}
                <div className="mt-16 bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-900 rounded-3xl p-8 sm:p-12 text-white shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
                    
                    <div className="relative z-10 max-w-3xl">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/20 text-blue-200 text-xs font-semibold uppercase tracking-wider mb-4 border border-blue-400/30">
                            <Calendar className="w-3.5 h-3.5 text-blue-300" />
                            Flexibilidad Horaria y Académica
                        </span>
                        <h3 className="text-2xl sm:text-3xl font-extrabold text-white mb-3">
                            ¿Tu liceo opera en la mañana y en la tarde?
                        </h3>
                        <p className="text-blue-100 text-sm sm:text-base leading-relaxed mb-6">
                            GestiEdu permite configurar bloques de horario independientes para cada turno, garantizando que un docente con horas en ambos turnos tenga su agenda sincronizada sin choques. Además, admite alumnos de 6to año técnico con planes de evaluación diferenciados.
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-medium text-blue-200">
                            <div className="flex items-center gap-2 bg-white/10 px-4 py-2.5 rounded-xl backdrop-blur-sm border border-white/10">
                                <Clock className="w-4 h-4 text-blue-300 shrink-0" />
                                <span>Turno Mañana: 7:00 AM a 12:45 PM</span>
                            </div>
                            <div className="flex items-center gap-2 bg-white/10 px-4 py-2.5 rounded-xl backdrop-blur-sm border border-white/10">
                                <Clock className="w-4 h-4 text-blue-300 shrink-0" />
                                <span>Turno Tarde: 1:00 PM a 6:00 PM</span>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </section>
    );
}
