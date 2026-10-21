import React from 'react';
import { SkeletonAuth } from '@/components/ui/skeleton/SkeletonAuth';

/**
 * Precarga instantanea para la pantalla de inicio de sesion (Login):
 * Renderizado inmediato vía streaming SSR con pulsacion suave para transicion sin saltos visuales (CLS = 0).
 */
export default function CargandoLogin() {
  return <SkeletonAuth />;
}
