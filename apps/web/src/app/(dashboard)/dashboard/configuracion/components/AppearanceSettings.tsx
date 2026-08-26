'use client';

import { useState } from 'react';
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
import { toast } from 'sonner';

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

    // Actualizar colores cuando se carga la config
    useState(() => {
        if (config) {
            setPrimaryColor(config.primaryColor || '#4F46E5');
            setSecondaryColor(config.secondaryColor || '#3B82F6');
        }
    });

    const handleFaviconUpload = (file: File) => {
        uploadLogosMutation.mutate({ favicon: file });
    };

    const handleLogoUpload = (file: File) => {
        uploadLogosMutation.mutate({ logo: file });
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
                <h3 className="text-lg font-medium text-gray-900 mb-4">Logos del Instituto</h3>
                <p className="text-sm text-gray-600 mb-6">
                    Personaliza los logos de tu instituto para el sistema
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Favicon */}
                    <ImageUpload
                        label="Favicon (16x16 o 32x32)"
                        currentImage={config?.favicon}
                        onUpload={handleFaviconUpload}
                        accept="image/png,image/x-icon"
                        maxSize={1}
                    />

                    {/* Logo Principal */}
                    <ImageUpload
                        label="Escudo del Instituto (200x200 mínimo)"
                        currentImage={config?.logo}
                        onUpload={handleLogoUpload}
                        accept="image/png,image/jpeg,image/jpg"
                        maxSize={2}
                    />
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
