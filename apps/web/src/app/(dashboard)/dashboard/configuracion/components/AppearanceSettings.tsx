'use client';

import { useState, useEffect } from 'react';
import { useConfirm } from '@/hooks/useConfirm';
import { Save, Plus, Palette as PaletteIcon } from 'lucide-react';
import { ColorPicker, ColorCard, ImageUpload } from '@/components/ui';
import {
    useInstituteConfig,
    useUploadLogos,
    useUpdateColors,
    useSubjectPalette,
    useAddColorToPalette,
    useRemoveColorFromPalette,
    useUpdateColorInPalette
} from '@/hooks/useInstitute';

export function AppearanceSettings() {
    const confirmDialog = useConfirm();
    const { data: config, isLoading } = useInstituteConfig();
    const { data: palette = [] } = useSubjectPalette();

    const uploadLogosMutation = useUploadLogos();
    const updateColorsMutation = useUpdateColors();
    const addColorMutation = useAddColorToPalette();
    const removeColorMutation = useRemoveColorFromPalette();
    const updateColorMutation = useUpdateColorInPalette();

    const [primaryColor, setPrimaryColor] = useState(config?.primaryColor || '#4F46E5');
    const [secondaryColor, setSecondaryColor] = useState(config?.secondaryColor || '#3B82F6');
    const [editingColorIndex, setEditingColorIndex] = useState<number | null>(null);
    const [editingColor, setEditingColor] = useState('');

    // Archivos seleccionados pendientes de guardar
    const [pendingFavicon, setPendingFavicon] = useState<File | null>(null);
    const [pendingLogo, setPendingLogo] = useState<File | null>(null);

    // Actualizar colores cuando se carga la config
    useEffect(() => {
        if (config) {
            if (config.primaryColor) setPrimaryColor(config.primaryColor);
            if (config.secondaryColor) setSecondaryColor(config.secondaryColor);
        }
    }, [config]);

    const hasPendingLogos = !!pendingFavicon || !!pendingLogo;

    const handleSaveLogos = async () => {
        if (!hasPendingLogos) return;

        try {
            await uploadLogosMutation.mutateAsync({
                favicon: pendingFavicon || undefined,
                logo: pendingLogo || undefined,
            });
            setPendingFavicon(null);
            setPendingLogo(null);
        } catch (error) {
            console.error('Error al guardar logos:', error);
        }
    };

    const handleDiscardLogos = () => {
        setPendingFavicon(null);
        setPendingLogo(null);
    };

    const handleSaveColors = () => {
        updateColorsMutation.mutate({ primaryColor, secondaryColor });
    };

    const handleAddColor = () => {
        const newColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
        addColorMutation.mutate(newColor);
    };

    const handleEditColor = (index: number) => {
        setEditingColorIndex(index);
        setEditingColor(palette[index]);
    };

    const handleSaveEditColor = () => {
        if (editingColorIndex !== null) {
            updateColorMutation.mutate({ index: editingColorIndex, color: editingColor });
            setEditingColorIndex(null);
        }
    };

    const handleDeleteColor = async (index: number) => {
        if (await confirmDialog({ title: '¿Estás seguro de eliminar este color?' })) {
            removeColorMutation.mutate(index);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Cargando configuración...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Logos del Instituto */}
            <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900">Logos del Instituto</h3>
                        <p className="text-sm text-gray-600 mt-0.5">
                            Personaliza el escudo escolar y el favicon visible en las pestañas del navegador
                        </p>
                    </div>

                    {hasPendingLogos && (
                        <button
                            type="button"
                            onClick={handleDiscardLogos}
                            disabled={uploadLogosMutation.isPending}
                            className="text-xs text-gray-600 hover:text-red-700 bg-gray-100 hover:bg-red-50 px-3 py-1.5 rounded-lg border border-gray-200 transition-colors self-start sm:self-auto"
                        >
                            Descartar cambios pendientes
                        </button>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Favicon */}
                    <ImageUpload
                        label="Favicon de la Pestaña (16×16 o 32×32)"
                        description="Icono cuadrado mostrado en la pestaña y marcadores del navegador"
                        currentImage={config?.favicon}
                        selectedFile={pendingFavicon}
                        onFileSelect={(file) => setPendingFavicon(file)}
                        accept="image/png,image/x-icon,.ico"
                        maxSize={1}
                    />

                    {/* Logo Principal */}
                    <ImageUpload
                        label="Escudo del Instituto (200×200 mínimo)"
                        description="Insignia oficial mostrada en la barra lateral, boletines y reportes"
                        currentImage={config?.logo}
                        selectedFile={pendingLogo}
                        onFileSelect={(file) => setPendingLogo(file)}
                        accept="image/png,image/jpeg,image/jpg"
                        maxSize={2}
                    />
                </div>

                {/* Botón para Guardar Logos */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-6 pt-4 border-t border-gray-200">
                    <div className="text-xs text-gray-500">
                        {hasPendingLogos ? (
                            <span className="inline-flex items-center gap-1.5 text-amber-800 font-medium bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
                                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                                Tienes imágenes seleccionadas. Haz clic en &quot;Guardar Logos&quot; para aplicarlas.
                            </span>
                        ) : (
                            <span>
                                Los logos guardados se actualizan automáticamente en la barra lateral y en el favicon de la pestaña.
                            </span>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={handleSaveLogos}
                        disabled={!hasPendingLogos || uploadLogosMutation.isPending}
                        className="inline-flex items-center justify-center px-6 py-2.5 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        {uploadLogosMutation.isPending ? (
                            <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                Guardando logos...
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4 mr-2" />
                                Guardar Logos
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Colores del Sistema */}
            <div className="pt-8 border-t border-gray-200">
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                    <PaletteIcon className="inline w-5 h-5 mr-2" />
                    Colores del Sistema
                </h3>
                <p className="text-sm text-gray-600 mb-6">
                    Personaliza el color principal del sistema. El sistema generará automáticamente todas las variaciones necesarias.
                </p>

                <div className="max-w-md">
                    <ColorPicker
                        label="Color Primario"
                        value={primaryColor}
                        onChange={setPrimaryColor}
                    />
                </div>

                <div className="flex justify-end mt-6">
                    <button
                        onClick={handleSaveColors}
                        disabled={updateColorsMutation.isPending}
                        className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                    >
                        {updateColorsMutation.isPending ? (
                            <>
                                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                                Guardando...
                            </>
                        ) : (
                            <>
                                <Save className="w-5 h-5 mr-2" />
                                Guardar Colores
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Paleta de Colores para Materias */}
            <div className="pt-8 border-t border-gray-200">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="text-lg font-medium text-gray-900">Paleta de Colores para Materias</h3>
                        <p className="text-sm text-gray-600 mt-1">
                            Crea una paleta de colores reutilizable para asignar a las materias
                        </p>
                    </div>
                    <button
                        onClick={handleAddColor}
                        disabled={addColorMutation.isPending}
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Añadir Color
                    </button>
                </div>

                {palette.length === 0 ? (
                    <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                        <PaletteIcon className="mx-auto h-12 w-12 text-gray-400" />
                        <h3 className="mt-2 text-sm font-medium text-gray-900">No hay colores en la paleta</h3>
                        <p className="mt-1 text-sm text-gray-500">
                            Comienza agregando colores para usar en tus materias
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-6">
                        {palette.map((color, index) => (
                            <ColorCard
                                key={index}
                                color={color}
                                onEdit={() => handleEditColor(index)}
                                onDelete={() => handleDeleteColor(index)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Modal de Edición de Color */}
            {editingColorIndex !== null && (
                <div className="fixed inset-0 z-50 overflow-y-auto">
                    <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
                        <div
                            className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
                            onClick={() => setEditingColorIndex(null)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditingColorIndex(null); } }}
                        />

                        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                            <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                                <h3 className="text-lg font-medium text-gray-900 mb-4">Editar Color</h3>

                                <ColorPicker
                                    value={editingColor}
                                    onChange={setEditingColor}
                                />
                            </div>

                            <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse gap-2">
                                <button
                                    onClick={handleSaveEditColor}
                                    disabled={updateColorMutation.isPending}
                                    className="w-full sm:w-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                                >
                                    {updateColorMutation.isPending ? 'Guardando...' : 'Guardar'}
                                </button>
                                <button
                                    onClick={() => setEditingColorIndex(null)}
                                    className="w-full sm:w-auto mt-3 sm:mt-0 px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 rounded-lg font-medium transition-colors"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
