'use client';

import { Edit, Trash2 } from 'lucide-react';
import { useState } from 'react';

interface ColorCardProps {
    color: string;
    onEdit: () => void;
    onDelete: () => void;
}

export function ColorCard({ color, onEdit, onDelete }: ColorCardProps) {
    const [isHovered, setIsHovered] = useState(false);

    return (
        <div
            className="relative group"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Círculo de color */}
            <div className="flex flex-col items-center gap-2">
                <div
                    className="w-20 h-20 rounded-full border-4 border-gray-200 shadow-md transition-all duration-200 group-hover:shadow-lg group-hover:scale-105"
                    style={{ backgroundColor: color }}
                />

                {/* Código hex */}
                <span className="text-xs font-mono text-gray-600 font-medium">
                    {color}
                </span>
            </div>

            {/* Botones de acción (aparecen en hover) */}
            {isHovered && (
                <div className="absolute -top-2 -right-2 flex gap-1 bg-white rounded-lg shadow-lg p-1 border border-gray-200">
                    <button
                        onClick={onEdit}
                        className="p-1.5 text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                        title="Editar color"
                    >
                        <Edit className="w-4 h-4" />
                    </button>
                    <button
                        onClick={onDelete}
                        className="p-1.5 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Eliminar color"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            )}
        </div>
    );
}
