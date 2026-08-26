import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Lock, Trash2, Archive } from "lucide-react";
import { toast } from 'sonner';
import { academicYearService } from '@/services/academic-year.service';

interface SecureDeleteModalProps {
    isOpen: boolean;
    onClose: () => void;
    yearId: string | null;
    yearName: string;
    onSuccess: () => void;
}

export default function SecureDeleteModal({ isOpen, onClose, yearId, yearName, onSuccess }: SecureDeleteModalProps) {
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [mustArchive, setMustArchive] = useState(false);

    const reset = () => {
        setPassword('');
        setError(null);
        setMustArchive(false);
        setLoading(false);
    };

    const handleClose = () => {
        reset();
        onClose();
    };

    const handleDelete = async () => {
        if (!yearId || !password) return;

        setLoading(true);
        setError(null);

        try {
            await academicYearService.deleteAcademicYear(yearId, password);
            toast.success('Ciclo escolar eliminado correctamente');
            onSuccess();
            handleClose();
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error(err);
            // Detectar el error específico de actividad académica
            if (errorMessage.includes('actividad académica') || errorMessage.includes('Must archive')) {
                setMustArchive(true);
                setError('Este ciclo escolar no se puede eliminar porque tiene calificaciones registradas. Solo se permite archivarlo para preservar el historial académico.');
            } else if (errorMessage.includes('Contraseña')) {
                setError('La contraseña es incorrecta.');
            } else {
                setError(errorMessage || 'Error al eliminar el ciclo escolar.');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleArchive = async () => {
        // TODO: Implementar lógica de archivado si existe endpoint,
        // o simplemente cerrar e indicar al usuario que cambie el estado a COMPLETED.
        // Por ahora, asumiremos que "Archivar" = cambiar status a COMPLETED.
        if (!yearId) return;

        setLoading(true);
        try {
            await academicYearService.changeStatus(yearId, 'COMPLETED');
            toast.success('Ciclo escolar archivado (finalizado) correctamente.');
            onSuccess();
            handleClose();
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            toast.error(errorMessage || 'Error al archivar el ciclo.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${mustArchive ? 'bg-amber-100' : 'bg-red-100'} mb-4`}>
                        {mustArchive ? <Archive className="h-6 w-6 text-amber-600" /> : <AlertTriangle className="h-6 w-6 text-red-600" />}
                    </div>
                    <DialogTitle className="text-center">
                        {mustArchive ? 'Acción Requerida: Archivar Ciclo' : 'Eliminar Ciclo Escolar'}
                    </DialogTitle>
                    <DialogDescription className="text-center">
                        {mustArchive
                            ? `El ciclo ${yearName} contiene registros académicos históricos activos. Por seguridad e integridad de datos, no puede ser eliminado permanentemente.`
                            : `Estás a punto de eliminar el ciclo escolar ${yearName}. Esta acción no se puede deshacer y eliminará todas las aulas y asignaciones asociadas.`
                        }
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Si no estamos forzados a archivar, pedimos password para borrar */}
                    {!mustArchive && (
                        <div className="space-y-2">
                            <label htmlFor="delete-year-password" className="text-sm font-medium text-gray-700">
                                Contraseña de Administrador
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                                <Input
                                    id="delete-year-password"
                                    type="password"
                                    placeholder="Ingresa tu contraseña"
                                    className="pl-9"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                            </div>
                            <p className="text-xs text-slate-500">
                                Se requiere verificación de seguridad para esta operación destructiva.
                            </p>
                        </div>
                    )}

                    {error && (
                        <div className={`p-3 rounded-md text-sm font-medium ${mustArchive ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-700'}`}>
                            {error}
                        </div>
                    )}
                </div>

                <DialogFooter className="flex-col sm:flex-row gap-2">
                    <Button variant="outline" onClick={handleClose} disabled={loading} className="w-full sm:w-auto">
                        Cancelar
                    </Button>

                    {mustArchive ? (
                        <Button
                            variant="default"
                            className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700"
                            onClick={handleArchive}
                            disabled={loading}
                        >
                            <Archive className="w-4 h-4 mr-2" />
                            Archivar Ciclo
                        </Button>
                    ) : (
                        <Button
                            variant="destructive"
                            className="w-full sm:w-auto"
                            onClick={handleDelete}
                            disabled={!password || loading}
                        >
                            {loading ? 'Procesando...' : (
                                <>
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Eliminar Definitivamente
                                </>
                            )}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
