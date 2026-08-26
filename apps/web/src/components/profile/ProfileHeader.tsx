
import React from 'react';
import { MapPin, Edit2, User, GraduationCap, Briefcase } from 'lucide-react';
import UserAvatar from '@/components/ui/UserAvatar';

export type UserRole = 'student' | 'teacher' | 'admin' | 'tutor';

export interface UserProfile {
    name: string;
    cedula: string;
    role: 'student' | 'teacher' | 'admin' | 'tutor';
    email: string;
    phone?: string;
    photoUrl?: string | null;
    address?: string; // Dirección del usuario
}

interface Props {
    user: UserProfile;
    onEdit?: () => void;
}

export default function ProfileHeader({ user, onEdit }: Props) {
    const isStudent = user.role === 'student';

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center gap-6 relative overflow-hidden">

            {/* Background Decoration */}
            <div className={`absolute top-0 left-0 w-full h-2 ${isStudent ? 'bg-blue-500' : 'bg-purple-600'}`}></div>

            {/* Avatar */}
            <div className="relative group shrink-0">
                <div className={`relative w-24 h-24 md:w-32 md:h-32 rounded-full border-4 ${isStudent ? 'border-blue-50' : 'border-purple-50'} shadow-lg overflow-hidden`}>
                    <UserAvatar
                        name={user.name}
                        src={user.photoUrl}
                        className="w-full h-full rounded-full"
                        initialsClassName="text-2xl md:text-3xl"
                    />
                </div>
                <div className="absolute bottom-1 right-1 bg-white rounded-full p-1.5 shadow-md border border-gray-100">
                    <User size={16} className={isStudent ? 'text-blue-500' : 'text-purple-600'} />
                </div>
            </div>

            {/* Main Info */}
            <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-3 mb-2">
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 truncate">{user.name}</h1>
                    <RoleBadge role={user.role} />
                </div>
            </div>

            {/* Actions */}
            <div className="absolute top-6 right-6 md:relative md:top-auto md:right-auto self-start">
                <button
                    onClick={onEdit}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-600 font-medium hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm active:scale-95"
                >
                    <Edit2 size={16} />
                    <span className="hidden md:inline">Editar Perfil</span>
                </button>
            </div>
        </div>
    );
}

function RoleBadge({ role }: { role: UserRole }) {
    if (role === 'student') {
        return (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold border border-blue-100 uppercase tracking-wider">
                <GraduationCap size={14} /> Estudiante
            </span>
        );
    }
    if (role === 'teacher') {
        return (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-50 text-purple-700 text-xs font-bold border border-purple-100 uppercase tracking-wider">
                <Briefcase size={14} /> Profesor
            </span>
        );
    }
    return (
        <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-bold border border-gray-200">
            {role}
        </span>
    );
}
