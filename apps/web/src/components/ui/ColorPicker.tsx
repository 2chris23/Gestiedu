'use client';

import { useState } from 'react';

interface ColorPickerProps {
    value: string;
    onChange: (color: string) => void;
    label?: string;
    className?: string;
}

export function ColorPicker({ value, onChange, label, className = '' }: ColorPickerProps) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className={`space-y-2 ${className}`}>
            {label && (
                <label className="block text-sm font-medium text-gray-700">
                    {label}
                </label>
            )}

            <div className="flex items-center gap-3">
                {/* Círculo de color */}
                <div className="relative">
                    <button
                        type="button"
                        onClick={() => setIsOpen(!isOpen)}
                        className="w-16 h-16 rounded-full border-4 border-gray-200 shadow-md hover:shadow-lg transition-shadow cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                        style={{ backgroundColor: value }}
                        aria-label="Seleccionar color"
                    />

                    {/* Input de color oculto */}
                    <input
                        type="color"
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                </div>
            </div>
        </div>
    );
}
