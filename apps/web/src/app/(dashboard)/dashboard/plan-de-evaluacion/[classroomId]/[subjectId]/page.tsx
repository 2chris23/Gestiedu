'use client';

import { use } from 'react';
import { useSearchParams } from 'next/navigation';
import { HojaImprimible } from '@/components/documentos/HojaImprimible';
import PlanImpreso from '@/components/evaluation/PlanImpreso';

/**
 * EL PLAN DE EVALUACIÓN, PARA IMPRIMIR
 *
 * `?lapso=1|2|3`. Carta apaisada, sin el armazón de la app
 * (`lib/documentos.ts`). Lo ven el profesor de la materia y el admin: el
 * servidor lo comprueba (`evaluation-plan.controller.ts`).
 */
export default function PlanDeEvaluacionImpresoPage({ params }: { params: Promise<{ classroomId: string; subjectId: string }> }) {
    const { classroomId, subjectId } = use(params);
    const lapso = useSearchParams().get('lapso') || '1';
    return (
        // El plan del MPPE lleva el membrete dentro de su tabla (PlanImpreso).
        <HojaImprimible etiqueta="Plan de evaluación" papel="carta-apaisada" paginas sinMembrete nombreDelArchivo="Plan de evaluación">
            <PlanImpreso classroomId={decodeURIComponent(classroomId)} subjectId={decodeURIComponent(subjectId)} lapso={lapso} />
        </HojaImprimible>
    );
}
