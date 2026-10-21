import React from 'react';
import { SkeletonLiveClass } from '@/components/ui/skeleton/SkeletonLiveClass';

/**
 * Precarga de alta fidelidad para la clase en vivo:
 * Reemplaza los spinners por la estructura visual real del aula y pase de asistencia (CLS = 0).
 */
export default function CargandoClaseEnVivo() {
  return <SkeletonLiveClass studentCount={10} />;
}
