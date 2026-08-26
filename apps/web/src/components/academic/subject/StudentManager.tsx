'use client';

import { useState } from 'react';
import { ClipboardList, AlertTriangle, Search, Filter, MoreHorizontal, Check, X, Clock } from 'lucide-react';
import { toast } from 'sonner';

// Mock Data
const MOCK_STUDENTS = [
    { id: '1', name: 'Ana Mendoza', avatar: 'AM', average: 18.5, status: 'regular' },
    { id: '2', name: 'Carlos Ruiz', avatar: 'CR', average: 14.2, status: 'regular' },
    { id: '3', name: 'Diana Lopez', avatar: 'DL', average: 9.8, status: 'risk' },
    { id: '4', name: 'Eduardo Gil', avatar: 'EG', average: 16.0, status: 'regular' },
    { id: '5', name: 'Fernando Paz', avatar: 'FP', average: 11.5, status: 'warning' },
    { id: '6', name: 'Gabriela Sol', avatar: 'GS', average: 19.0, status: 'regular' },
    { id: '7', name: 'Hugo Chavez', avatar: 'HC', average: 8.5, status: 'risk' },
    { id: '8', name: 'Irene Diaz', avatar: 'ID', average: 15.5, status: 'regular' },
    { id: '9', name: 'Juan Perez', avatar: 'JP', average: 13.0, status: 'regular' },
    { id: '10', name: 'Karla Silva', avatar: 'KS', average: 17.5, status: 'regular' },
];

type AttendanceStatus = 'P' | 'A' | 'R' | null;

interface StudentManagerProps {
    subjectName: string;
}

export default function StudentManager({ subjectName }: StudentManagerProps) {
    const [isAttendanceMode, setIsAttendanceMode] = useState(false);
    const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});

    const handleAttendance = (studentId: string, status: AttendanceStatus) => {
        setAttendance(prev => ({
            ...prev,
            [studentId]: status
        }));
    };

    const getAttendanceCount = (status: 'P' | 'A' | 'R') => {
        return Object.values(attendance).filter(s => s === status).length;
    };

    const saveAttendance = () => {
        toast.success("Asistencia guardada correctamente");
        setIsAttendanceMode(false);
        setAttendance({});
    };

    return (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col relative">
            {/* Header & Command Bar */}
            <div className="p-5 border-b border-gray-100 bg-gray-50/50">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h3 className="font-bold text-lg text-gray-900">Listado de Estudiantes</h3>
                        <p className="text-sm text-gray-500">{MOCK_STUDENTS.length} estudiantes inscritos</p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setIsAttendanceMode(!isAttendanceMode)}
                            className={`
                                flex items-center gap-2 px-4 py-2.5 rounded-lg font-bold text-sm transition-all
                                ${isAttendanceMode
                                    ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                    : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm hover:shadow-indigo-200'}
                            `}
                        >
                            <ClipboardList className="w-4 h-4" />
                            {isAttendanceMode ? 'Cancelar Asistencia' : 'Pasar Asistencia'}
                        </button>

                        {!isAttendanceMode && (
                            <button className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 text-amber-700 border border-amber-100 rounded-lg font-bold text-sm hover:bg-amber-100 transition-colors">
                                <AlertTriangle className="w-4 h-4" />
                                Crear Observación
                            </button>
                        )}
                    </div>
                </div>

                {/* Filters (Visual only for now) */}
                {!isAttendanceMode && (
                    <div className="mt-4 flex items-center gap-3">
                        <div className="relative flex-1 max-w-xs">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar estudiante..."
                                className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300"
                            />
                        </div>
                        <button className="p-2 border border-gray-200 rounded-lg bg-white text-gray-500 hover:text-indigo-600 hover:border-indigo-200">
                            <Filter className="w-4 h-4" />
                        </button>
                    </div>
                )}
            </div>

            {/* Student List */}
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-50/50 border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wider">
                            <th className="px-6 py-4 font-medium">Estudiante</th>
                            <th className="px-6 py-4 font-medium text-center">Promedio {subjectName}</th>
                            {isAttendanceMode ? (
                                <th className="px-6 py-4 font-medium text-center bg-indigo-50/30 text-indigo-800">
                                    Asistencia
                                </th>
                            ) : (
                                <th className="px-6 py-4 font-medium text-right">Acciones</th>
                            )}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {MOCK_STUDENTS.map((student) => (
                            <tr key={student.id} className="group hover:bg-gray-50/50 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center font-bold text-xs text-gray-600">
                                            {student.avatar}
                                        </div>
                                        <div>
                                            <p className="font-semibold text-gray-900 text-sm">{student.name}</p>
                                            <p className="text-xs text-gray-400">ID: {student.id.padStart(4, '0')}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <div className={`
                                        inline-flex items-center px-2.5 py-0.5 rounded text-sm font-bold
                                        ${student.average >= 18 ? 'bg-green-50 text-green-700' :
                                            student.average >= 10 ? 'bg-gray-100 text-gray-700' :
                                                'bg-red-50 text-red-700'}
                                    `}>
                                        {student.average.toFixed(1)}
                                    </div>
                                </td>
                                {isAttendanceMode ? (
                                    <td className="px-6 py-4 bg-indigo-50/10">
                                        <div className="flex items-center justify-center gap-2">
                                            <button
                                                onClick={() => handleAttendance(student.id, 'P')}
                                                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${attendance[student.id] === 'P' ? 'bg-green-500 text-white shadow-md scale-110' : 'bg-gray-100 text-gray-400 hover:bg-green-100 hover:text-green-600'}`}
                                                title="Presente"
                                            >
                                                <Check className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleAttendance(student.id, 'A')}
                                                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${attendance[student.id] === 'A' ? 'bg-red-500 text-white shadow-md scale-110' : 'bg-gray-100 text-gray-400 hover:bg-red-100 hover:text-red-600'}`}
                                                title="Ausente"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleAttendance(student.id, 'R')}
                                                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${attendance[student.id] === 'R' ? 'bg-amber-400 text-white shadow-md scale-110' : 'bg-gray-100 text-gray-400 hover:bg-amber-100 hover:text-amber-600'}`}
                                                title="Retraso"
                                            >
                                                <Clock className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                ) : (
                                    <td className="px-6 py-4 text-right">
                                        <button className="p-1.5 rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                                            <MoreHorizontal className="w-4 h-4" />
                                        </button>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Sticky Footer for Attendance Mode */}
            {isAttendanceMode && (
                <div className="sticky bottom-0 left-0 right-0 p-4 bg-white border-t border-indigo-100 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] animate-in slide-in-from-bottom duration-300 z-10">
                    <div className="max-w-3xl mx-auto flex items-center justify-between">
                        <div className="flex items-center gap-6 text-sm">
                            <span className="font-bold text-gray-900">Resumen:</span>
                            <div className="flex items-center gap-2 text-green-600">
                                <Check className="w-4 h-4" />
                                <span className="font-medium">{getAttendanceCount('P')} Presentes</span>
                            </div>
                            <div className="flex items-center gap-2 text-red-600">
                                <X className="w-4 h-4" />
                                <span className="font-medium">{getAttendanceCount('A')} Ausentes</span>
                            </div>
                            <div className="flex items-center gap-2 text-amber-600">
                                <Clock className="w-4 h-4" />
                                <span className="font-medium">{getAttendanceCount('R')} Retrasos</span>
                            </div>
                        </div>
                        <button
                            onClick={saveAttendance}
                            className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-indigo-700 shadow-md transition-all active:scale-95"
                        >
                            Guardar Asistencia
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
