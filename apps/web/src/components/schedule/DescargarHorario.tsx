'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Download, FileImage, FileText, Loader2 } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ScheduleBlock } from '@/components/schedule/UniversalScheduleViewer';
import { useSchedulePeriods } from '@/hooks/useSchedulePeriods';
import { useSchoolToday } from '@/hooks/useSchoolTime';

/**
 * EL BOTÓN DE DESCARGAR HORARIO
 *
 * Reemplaza a dos botones de "imprimir" que **no imprimían nada**: solo sacaban
 * un aviso de "impresión disponible". Este sí entrega el archivo.
 *
 * El código que dibuja se carga al pulsar, no al abrir la pantalla: quien nunca
 * descarga el horario no paga por él.
 */
export function DescargarHorario({
    bloques,
    titulo,
    subtitulo,
}: {
    bloques: ScheduleBlock[];
    titulo: string;
    subtitulo?: string;
}) {
    const { periods } = useSchedulePeriods();
    const hoy = useSchoolToday();
    const [haciendo, setHaciendo] = React.useState<null | 'png' | 'pdf'>(null);

    const descargar = async (formato: 'png' | 'pdf') => {
        if (haciendo) return;
        setHaciendo(formato);
        try {
            const m = await import('@/lib/horario-en-archivo');
            const datos = { bloques, periodos: periods, titulo, subtitulo, fecha: hoy };
            const blob = formato === 'png' ? await m.horarioComoPng(datos) : await m.horarioComoPdf(datos);
            const r = await m.entregarArchivo(blob, m.nombreDeArchivo(titulo, formato));
            if (r === 'descargado') toast.success(formato === 'png' ? 'Imagen descargada' : 'PDF descargado');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'No se pudo generar el horario');
        } finally {
            setHaciendo(null);
        }
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    aria-label="Descargar horario"
                    title="Descargar horario"
                    disabled={!!haciendo}
                    className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-50"
                >
                    {haciendo ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => descargar('png')}>
                    <FileImage size={14} className="mr-2" /> Imagen (PNG)
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => descargar('pdf')}>
                    <FileText size={14} className="mr-2" /> PDF para imprimir
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
