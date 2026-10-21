import { cn } from '@/lib/utils';

/**
 * LA CARGA HORARIA DE UN PROFESOR, EN LA PANTALLA
 *
 * La regla es la del servidor (`personal.service.ts → estadoDeLaCarga`),
 * copiada aquí solo para la proyección en vivo al asignar: con sus horas del
 * cargo, «en rango» es tenerlas completas (le falta menos de una hora) y
 * «sobrecarga» pasarlas; sin ellas, el rango del liceo. `MAPA` §1e.
 */
export type EstadoDeLaCarga = 'SOBRECARGA' | 'EN_RANGO' | 'POR_DEBAJO';

export function estadoDeLaCarga(total: number, reglas: { minimo: number; maximo: number }, horasDelCargo: number | null | undefined): EstadoDeLaCarga {
    if (horasDelCargo != null && horasDelCargo > 0) {
        if (total > horasDelCargo + 0.001) return 'SOBRECARGA';
        return horasDelCargo - total < 1 ? 'EN_RANGO' : 'POR_DEBAJO';
    }
    return total > reglas.maximo ? 'SOBRECARGA' : total >= reglas.minimo ? 'EN_RANGO' : 'POR_DEBAJO';
}

/** 37.5 → «37,5»; 36 → «36». */
export const horas = (n: number) => `${Math.round(n * 10) / 10}`.replace('.', ',');

/** Verde completo, ámbar le faltan, rojo se pasa. */
export function colorDeLaCarga(estado: EstadoDeLaCarga) {
    if (estado === 'SOBRECARGA') return { barra: 'bg-red-500', texto: 'text-red-700', fondo: 'bg-red-50 text-red-800' };
    if (estado === 'EN_RANGO') return { barra: 'bg-emerald-500', texto: 'text-emerald-700', fondo: 'bg-emerald-50 text-emerald-800' };
    return { barra: 'bg-amber-400', texto: 'text-amber-800', fondo: 'bg-amber-50 text-amber-900' };
}

export const NOMBRE_DEL_ESTADO: Record<EstadoDeLaCarga, string> = {
    SOBRECARGA: 'Se pasa',
    EN_RANGO: 'Completo',
    POR_DEBAJO: 'Le faltan horas',
};

/** La barra de sus horas frente a las de su cargo (llena hasta el cargo; lo que pasa, rojo). */
export function BarraDeCarga({ total, cargo, estado, className }: { total: number; cargo: number; estado: EstadoDeLaCarga; className?: string }) {
    const lleno = cargo > 0 ? Math.min(100, (total / cargo) * 100) : 0;
    return (
        <span
            role="meter"
            aria-label="Horas de clase"
            aria-valuemin={0}
            aria-valuemax={cargo}
            aria-valuenow={total}
            aria-valuetext={`${horas(total)} de ${cargo} horas`}
            className={cn('block h-1.5 w-full overflow-hidden rounded-full bg-gray-100', className)}
        >
            <span className={cn('block h-full rounded-full transition-[width]', colorDeLaCarga(estado).barra)} style={{ width: `${lleno}%` }} />
        </span>
    );
}
