'use client';

import { useState, useEffect } from 'react';
import { useConfirm } from '@/hooks/useConfirm';
import { Plus, Palette as PaletteIcon } from 'lucide-react';
import { Ajustes, BotonGuardar, CargandoAjustes, Grupo } from '@/components/configuracion/ajustes';
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

    if (isLoading) return <CargandoAjustes />;

    return (
        <Ajustes className="max-w-3xl">
            <Grupo
                id="logos"
                titulo="Logos del liceo"
                pie={
                    hasPendingLogos
                        ? 'Tienes imágenes elegidas: «Guardar logos» para ponerlas.'
                        : 'Los logos guardados se actualizan automáticamente en la barra lateral y en el favicon de la pestaña.'
                }
            >
                <div className="grid grid-cols-1 divide-y divide-gray-100 md:grid-cols-2 md:divide-x md:divide-y-0">
                    <ImageUpload
                        label="Favicon de la Pestaña (16×16 o 32×32)"
                        description="El icono cuadrado de la pestaña del navegador."
                        currentImage={config?.favicon}
                        selectedFile={pendingFavicon}
                        onFileSelect={(file) => setPendingFavicon(file)}
                        accept="image/png,image/x-icon,.ico"
                        maxSize={1}
                    />
                    <ImageUpload
                        label="Escudo del liceo (200×200 mínimo)"
                        description="En la barra lateral, las boletas y los documentos."
                        currentImage={config?.logo}
                        selectedFile={pendingLogo}
                        onFileSelect={(file) => setPendingLogo(file)}
                        accept="image/png,image/jpeg,image/jpg"
                        maxSize={2}
                    />
                </div>
            </Grupo>
            {hasPendingLogos && (
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                    <button
                        type="button"
                        onClick={handleDiscardLogos}
                        disabled={uploadLogosMutation.isPending}
                        className="min-h-[48px] rounded-full px-5 text-sm font-medium text-gray-700 hover:bg-gray-100"
                    >
                        Descartar
                    </button>
                    <BotonGuardar type="button" texto="Guardar Logos" onClick={handleSaveLogos} guardando={uploadLogosMutation.isPending} />
                </div>
            )}

            <Grupo id="colores" titulo="Colores del Sistema" pie="El sistema saca solo los tonos claros y oscuros de este color.">
                <div className="p-4">
                    <ColorPicker label="Color Primario" value={primaryColor} onChange={setPrimaryColor} />
                </div>
            </Grupo>
            <BotonGuardar type="button" texto="Guardar Colores" onClick={handleSaveColors} guardando={updateColorsMutation.isPending} />

            <Grupo id="paleta" titulo="Paleta de Colores para Materias" descripcion="Los colores que se le pueden dar a cada materia.">
                {palette.length === 0 ? (
                    <div className="flex flex-col items-center px-4 py-8 text-center">
                        <PaletteIcon className="h-10 w-10 text-gray-400" aria-hidden />
                        <p className="mt-2 text-[15px] text-gray-900">Todavía no hay colores</p>
                        <p className="text-sm text-gray-600">Añade los que quieras usar en las materias.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-3 gap-4 p-4 sm:grid-cols-5 md:grid-cols-6">
                        {palette.map((color, index) => (
                            <ColorCard key={index} color={color} onEdit={() => handleEditColor(index)} onDelete={() => handleDeleteColor(index)} />
                        ))}
                    </div>
                )}
                <button
                    type="button"
                    onClick={handleAddColor}
                    disabled={addColorMutation.isPending}
                    className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-[15px] font-medium text-indigo-700 hover:bg-gray-50 disabled:opacity-50"
                >
                    <Plus className="h-5 w-5" aria-hidden />
                    Añadir Color
                </button>
            </Grupo>

            {/* Modal de Edición de Color */}
            {editingColorIndex !== null && (
                <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Editar color">
                    <div className="flex items-center justify-center min-h-full p-4 text-center">
                        <div
                            className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
                            onClick={() => setEditingColorIndex(null)}
                            aria-hidden="true"
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditingColorIndex(null); } }}
                        />

                        <div className="relative w-full max-w-lg bg-white rounded-2xl text-left overflow-hidden shadow-xl transform transition-all">
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
        </Ajustes>
    );
}
