'use client';

import { Upload, X, Image as ImageIcon, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { useRef, useState, useEffect } from 'react';
import { BACKEND_URL } from '@/config/env';

interface ImageUploadProps {
    currentImage?: string | null;
    selectedFile?: File | null;
    onFileSelect?: (file: File | null) => void;
    onUpload?: (file: File) => void;
    onRemove?: () => void;
    label?: string;
    description?: string;
    accept?: string;
    maxSize?: number; // MB
    className?: string;
}

export function ImageUpload({
    currentImage,
    selectedFile,
    onFileSelect,
    onUpload,
    onRemove,
    label,
    description,
    accept = 'image/png,image/jpeg,image/jpg',
    maxSize = 2,
    className = ''
}: ImageUploadProps) {
    const [preview, setPreview] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Actualizar preview cuando cambia selectedFile o currentImage
    useEffect(() => {
        if (selectedFile) {
            const objectUrl = URL.createObjectURL(selectedFile);
            setPreview(objectUrl);
            return () => URL.revokeObjectURL(objectUrl);
        } else if (currentImage) {
            const imageUrl = currentImage.startsWith('/uploads')
                ? `${BACKEND_URL}${currentImage}`
                : currentImage;
            setPreview(imageUrl);
        } else {
            setPreview(null);
        }
    }, [selectedFile, currentImage]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validar tamaño
        if (file.size > maxSize * 1024 * 1024) {
            setError(`El archivo debe ser menor a ${maxSize}MB`);
            return;
        }

        // Validar tipo (soportar tipos mime y extensiones comunes)
        const allowedTypes = accept.split(',').map(t => t.trim().toLowerCase());
        const fileType = file.type.toLowerCase();
        const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();

        const isAllowed = allowedTypes.some(type => {
            if (type.startsWith('.')) return type === fileExt;
            if (type.includes('*')) return fileType.startsWith(type.replace('*', ''));
            return fileType === type;
        });

        if (!isAllowed && file.type) {
            setError('Tipo de archivo no permitido');
            return;
        }

        setError(null);

        // Notificar selección
        if (onFileSelect) {
            onFileSelect(file);
        }
        if (onUpload) {
            onUpload(file);
        }
    };

    const handleDiscardSelected = () => {
        setError(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
        if (onFileSelect) {
            onFileSelect(null);
        }
    };

    const handleRemoveCurrent = () => {
        setError(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
        if (onFileSelect) {
            onFileSelect(null);
        }
        onRemove?.();
    };

    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    };

    return (
        <div className={`p-5 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow transition-shadow space-y-4 ${className}`}>
            <div>
                <div className="flex items-center justify-between gap-2">
                    {label && (
                        <h4 className="text-sm font-semibold text-gray-900">
                            {label}
                        </h4>
                    )}
                    {selectedFile ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
                            <Clock className="w-3 h-3 text-amber-600" />
                            Pendiente de guardar
                        </span>
                    ) : currentImage ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Guardado
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                            Sin imagen
                        </span>
                    )}
                </div>
                {description && (
                    <p className="text-xs text-gray-500 mt-1">
                        {description}
                    </p>
                )}
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-5">
                {/* Visualizador de imagen */}
                <div className="relative flex-shrink-0">
                    <div className="w-28 h-28 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center p-2 relative group shadow-inner">
                        {preview ? (
                            <>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={preview}
                                    alt={label || 'Preview'}
                                    className="max-w-full max-h-full object-contain drop-shadow-sm transition-transform group-hover:scale-105"
                                />
                                {selectedFile && (
                                    <button
                                        type="button"
                                        onClick={handleDiscardSelected}
                                        title="Descartar nueva imagen seleccionada"
                                        className="absolute top-1 right-1 p-1 bg-gray-900/80 text-white rounded-full hover:bg-red-600 transition-colors"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center text-gray-400">
                                <ImageIcon className="w-8 h-8 mb-1 opacity-60" />
                                <span className="text-[10px] text-gray-400">Sin archivo</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Acciones y detalles */}
                <div className="flex-1 w-full space-y-3">
                    {selectedFile ? (
                        <div className="bg-amber-50/70 border border-amber-200/80 rounded-lg p-2.5 text-xs text-amber-900 space-y-1">
                            <p className="font-medium truncate max-w-[240px]">
                                {selectedFile.name}
                            </p>
                            <p className="text-amber-700 text-[11px]">
                                Tamaño: {formatFileSize(selectedFile.size)}
                            </p>
                        </div>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 hover:border-gray-400 transition-all shadow-sm"
                        >
                            <Upload className="w-3.5 h-3.5 text-indigo-600" />
                            {preview ? 'Cambiar imagen' : 'Seleccionar imagen'}
                        </button>

                        {selectedFile ? (
                            <button
                                type="button"
                                onClick={handleDiscardSelected}
                                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg text-gray-600 hover:text-red-700 hover:bg-red-50 transition-colors"
                            >
                                <X className="w-3.5 h-3.5" />
                                Descartar
                            </button>
                        ) : currentImage && onRemove ? (
                            <button
                                type="button"
                                onClick={handleRemoveCurrent}
                                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg text-gray-600 hover:text-red-700 hover:bg-red-50 transition-colors"
                            >
                                <X className="w-3.5 h-3.5" />
                                Quitar
                            </button>
                        ) : null}
                    </div>

                    <p className="text-[11px] text-gray-500">
                        {accept.replace(/image\//g, '').toUpperCase()} • Máx. {maxSize}MB
                    </p>

                    {error && (
                        <div className="flex items-center gap-1.5 text-xs text-red-600">
                            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                            <span>{error}</span>
                        </div>
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
