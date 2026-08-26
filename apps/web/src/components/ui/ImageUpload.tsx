'use client';

import { Upload, X, Image as ImageIcon } from 'lucide-react';
import { useRef, useState, useEffect } from 'react';
import { BACKEND_URL } from '@/config/env';

interface ImageUploadProps {
    currentImage?: string;
    onUpload: (file: File) => void;
    onRemove?: () => void;
    label?: string;
    accept?: string;
    maxSize?: number; // MB
    className?: string;
}

export function ImageUpload({
    currentImage,
    onUpload,
    onRemove,
    label,
    accept = 'image/png,image/jpeg,image/jpg',
    maxSize = 2,
    className = ''
}: ImageUploadProps) {
    const [preview, setPreview] = useState<string | null>(currentImage || null);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Actualizar preview cuando currentImage cambia
    useEffect(() => {
        if (currentImage) {
            // Si la imagen es una ruta relativa (empieza con /uploads), agregar la URL del backend
            const imageUrl = currentImage.startsWith('/uploads')
                ? `${BACKEND_URL}${currentImage}`
                : currentImage;
            setPreview(imageUrl);
        } else {
            setPreview(null);
        }
    }, [currentImage]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validar tamaño
        if (file.size > maxSize * 1024 * 1024) {
            setError(`El archivo debe ser menor a ${maxSize}MB`);
            return;
        }

        // Validar tipo
        if (!accept.split(',').some(type => file.type === type.trim())) {
            setError('Tipo de archivo no permitido');
            return;
        }

        setError(null);

        // Crear preview
        const reader = new FileReader();
        reader.onloadend = () => {
            setPreview(reader.result as string);
        };
        reader.readAsDataURL(file);

        // Llamar callback
        onUpload(file);
    };

    const handleRemove = () => {
        setPreview(null);
        setError(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
        onRemove?.();
    };

    return (
        <div className={`space-y-2 ${className}`}>
            {label && (
                <label className="block text-sm font-medium text-gray-700">
                    {label}
                </label>
            )}

            <div className="flex items-start gap-4">
                {/* Preview o placeholder */}
                <div className="relative">
                    {preview ? (
                        <div className="relative group">
                            {/* eslint-disable-next-line @next/next/no-img-element -- previa local (blob/data URL) no optimizable por next/image */}
                            <img
                                src={preview}
                                alt="Preview"
                                className="w-32 h-32 object-cover rounded-lg border-2 border-gray-200"
                            />
                            {onRemove && (
                                <button
                                    type="button"
                                    onClick={handleRemove}
                                    className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="w-32 h-32 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50">
                            <ImageIcon className="w-12 h-12 text-gray-400" />
                        </div>
                    )}
                </div>

                {/* Botón de upload */}
                <div className="flex-1 space-y-2">
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 text-sm font-medium text-gray-700"
                    >
                        <Upload className="w-4 h-4" />
                        {preview ? 'Cambiar imagen' : 'Subir imagen'}
                    </button>

                    <p className="text-xs text-gray-500">
                        {accept.split(',').map(t => t.split('/')[1].toUpperCase()).join(', ')} • Máx {maxSize}MB
                    </p>

                    {error && (
                        <p className="text-xs text-red-600">{error}</p>
                    )}
                </div>

                <input
                    ref={fileInputRef}
                    type="file"
                    accept={accept}
                    onChange={handleFileChange}
                    className="hidden"
                />
            </div>
        </div>
    );
}
