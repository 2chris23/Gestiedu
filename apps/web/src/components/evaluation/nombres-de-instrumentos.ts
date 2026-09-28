import type { TipoDeInstrumento } from '@/lib/instrumentos';

/** Cómo se llama cada tipo de instrumento en pantalla y en el papel. */
export const NOMBRE_DEL_TIPO: Record<TipoDeInstrumento, string> = {
    COTEJO: 'Lista de cotejo',
    ESCALA: 'Escala de estimación',
    RUBRICA: 'Rúbrica',
    PUNTOS: 'Por puntos (Ser, Hacer, Conocer, Convivir)',
};
