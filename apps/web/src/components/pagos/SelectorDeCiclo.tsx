'use client';

import * as React from 'react';
import { Lock } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { CicloDePagos } from '@/hooks/usePagos';

/**
 * QUÉ CICLO SE MIRA (2026-10-01)
 *
 * Cristian: «se debe elegir por ciclo escolar para ver pagos pasados». El de
 * en curso primero; los cerrados llevan un candado: se ven, no se tocan.
 */
const ACTUAL = '__actual';

export function SelectorDeCiclo({
    ciclos,
    valor,
    alCambiar,
}: {
    ciclos: CicloDePagos[];
    /** El id del ciclo, o `null` para el que está en curso. */
    valor: string | null;
    alCambiar: (id: string | null) => void;
}) {
    const enCurso = ciclos.find((c) => c.status === 'ACTIVE');
    const elegido = valor ?? ACTUAL;
    return (
        <Select value={elegido} onValueChange={(v) => alCambiar(v === ACTUAL || v === enCurso?.id ? null : v)}>
            <SelectTrigger aria-label="Ciclo escolar que se mira" className="h-11 w-auto min-w-[12rem] gap-2 rounded-xl bg-white text-sm font-semibold text-gray-800">
                <span className="font-medium text-gray-500">Ciclo:</span>
                <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="end" className="rounded-xl bg-white p-1">
                {enCurso && (
                    <SelectItem value={ACTUAL} className="min-h-[44px] rounded-lg text-sm font-semibold">
                        {enCurso.name} · en curso
                    </SelectItem>
                )}
                {ciclos
                    .filter((c) => c.id !== enCurso?.id)
                    .map((c) => (
                        <SelectItem key={c.id} value={c.id} className="min-h-[44px] rounded-lg text-sm">
                            <span className="inline-flex items-center gap-1.5">
                                {c.closed && <Lock className="h-3.5 w-3.5 text-gray-500" aria-hidden />}
                                {c.name}
                                {c.closed ? ' · cerrado' : c.status === 'UPCOMING' ? ' · próximo' : ''}
                            </span>
                        </SelectItem>
                    ))}
            </SelectContent>
        </Select>
    );
}

export default SelectorDeCiclo;
