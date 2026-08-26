import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Lock } from "lucide-react";

interface RemoveStudentSecureModalProps {
    isOpen: boolean;
    onClose: () => void;
    studentId: string | null;
    studentName: string;
    onConfirm: (password: string) => Promise<void>;
}

export default function RemoveStudentSecureModal({
    isOpen,
    onClose,
    studentId,
    studentName,
    onConfirm
}: RemoveStudentSecureModalProps) {
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const reset = () => {
        setPassword('');
        setError(null);
        setLoading(false);
    };

    const handleClose = () => {
        reset();
        onClose();
    };

    const handleRemove = async () => {
        if (!studentId || !password) return;

        setLoading(true);
        setError(null);

        try {
            await onConfirm(password);
            handleClose();
        } catch (err) {
            console.error('Error en modal:', err);

            // Manejar diferentes tipos de errores
            const errorMessage = err instanceof Error ? err.message : String(err);

            if (errorMessage.includes('Contraseña incorrecta') || errorMessage.includes('INVALID_PASSWORD')) {
                setError('Contraseña incorrecta');
            } else if (errorMessage.includes('Token') || errorMessage.includes('sesión')) {
                setError('Tu sesión ha expirado. Por favor, inicia sesión nuevamente.');
            } else {
                setError(errorMessage || 'Error al eliminar el estudiante de la sección.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 mb-4">
                        <AlertTriangle className="h-6 w-6 text-red-600" />
                    </div>
                    <DialogTitle className="text-center">
                        Eliminar Estudiante
                    </DialogTitle>
                    <DialogDescription className="text-center">
                        ¿Estás seguro de que deseas eliminar a <strong>{studentName}</strong> de esta sección?
                        <br /><br />
                        El estudiante será removido de la sección pero no se eliminará del sistema.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <label htmlFor="remove-student-password" className="text-sm font-medium text-gray-700">
                            Contraseña de Administrador
                        </label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                            <Input
                                id="remove-student-password"
                                type="password"
                                placeholder="Ingresa tu contraseña"
                                className="pl-9"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoComplete="new-password"
                                name="admin-password-confirm"
                            />
                        </div>
                        <p className="text-xs text-slate-500">
                            Se requiere verificación de seguridad para esta operación.
                        </p>
                    </div>

                    {error && (
                        <div className="p-3 rounded-md text-sm font-medium bg-red-50 text-red-700">
                            {error}
                        </div>
                    )}
                </div>

                <DialogFooter className="flex-col sm:flex-row gap-2">
                    <Button variant="outline" onClick={handleClose} disabled={loading} className="w-full sm:w-auto">
                        Cancelar
                    </Button>
                    <Button
                        variant="destructive"
                        className="w-full sm:w-auto"
                        onClick={handleRemove}
                        disabled={!password || loading}
                    >
                        {loading ? 'Eliminando...' : 'Eliminar'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
