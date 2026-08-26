'use client';

import { useSubjectPalette } from '@/hooks/useInstitute';
import { Palette } from 'lucide-react';

interface PaletteColorSelectorProps {
    id?: string;
    selectedColor: string;
    onSelectColor: (color: string) => void;
}

export function PaletteColorSelector({ id, selectedColor, onSelectColor }: PaletteColorSelectorProps) {
    const { data: palette = [], isLoading } = useSubjectPalette();

    if (isLoading) {
        return <div className="text-sm text-gray-500">Cargando paleta...</div>;
    }

    if (palette.length === 0) {
        return (
            <div className="text-sm text-gray-500 italic flex items-center gap-2">
                <Palette className="w-4 h-4" />
                No hay colores en la paleta. Configúralos en Apariencia.
            </div>
        );
    }

    return (
        <div id={id}>
            <p className="text-xs text-gray-600 mb-2">Selecciona un color de la paleta:</p>
            <div className="grid grid-cols-6 gap-2">
                {palette.map((color, index) => (
                    <button
                        key={index}
                        type="button"
                        onClick={() => onSelectColor(color)}
                        className={`
                            w-10 h-10 rounded-full border-2 transition-all
                            ${selectedColor === color
                                ? 'border-indigo-600 ring-2 ring-indigo-200 scale-110'
                                : 'border-gray-300 hover:border-gray-400 hover:scale-105'
                            }
                        `}
                        style={{ backgroundColor: color }}
                        title={color}
                    />
                ))}
            </div>
        </div>
    );
}
