'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useQuienSoy } from '@/hooks/useQuienSoy';
import { useConexion } from '@/hooks/useConexion';
import { usePagosActivos } from '@/hooks/usePagos';
import { usePaeActivo } from '@/hooks/usePae';
import { elMenuDe } from '@/lib/el-menu';
import { elDuenoDeAhora } from '@/lib/el-dueno';
import { escalonar } from '@/lib/azar';
import { guardarEstasPaginas } from '@/lib/paginas-guardadas';
import { lasPorGuardar } from '@/lib/pantallas-sin-guardar';
import { bajarTodo, estaCompleta, ponerseAlDia, seEnsenaLaPrecarga } from '@/lib/precarga';
import { EVENTO_DATOS_CAMBIARON } from '@/providers/TiempoRealProvider';

/**
 * LA COPIA DEL TELÉFONO, AL DÍA SOLA (como WhatsApp)
 *
 * Después de la primera descarga (`PrecargaAlEntrar`), nunca más se baja todo
 * ni se abre pantalla alguna: se pregunta qué cambió (`ponerseAlDia`) y se
 * baja solo eso. Cuándo:
 *
 *   · al abrir la app y al volver a ella;
 *   · al volver la conexión, cada teléfono a su hora (`escalonar`);
 *   · con la app abierta, cuando el tiempo real avisa de un cambio;
 *   · cada 30 min, por si se perdió algún aviso.
 *
 * Si el servidor dice «demasiado viejo» (`todo`), la pasada entera, de fondo
 * y sin pantalla. Nada si el teléfono pide ahorrar datos.
 *
 * Con la app CERRADA del todo, el aviso silencioso de Firebase la despierta
 * para lo mismo (`docs/APP-MOVIL.md`).
 */

const CADA = 30 * 60 * 1000;
const AL_VOLVER = 2 * 60 * 1000;
/** Varios avisos seguidos (una tanda de notas) se juntan en una pasada. */
const JUNTAR_AVISOS = 4000;

function ahorrandoDatos(): boolean {
    const conexion = (navigator as unknown as { connection?: { saveData?: boolean } }).connection;
    return Boolean(conexion?.saveData);
}

export function DescargaEnSegundoPlano() {
    const { yo } = useQuienSoy();
    const { hayConexion } = useConexion();
    const { data: pagos, isFetched: pagosSabido } = usePagosActivos();
    const { data: comedor, isFetched: comedorSabido } = usePaeActivo(yo?.role === 'ADMIN');
    // El menú depende de los módulos del liceo: hasta saberlos, no se pide nada
    // (si no, Pagos o Comedor quedaban fuera de lo descargado).
    const menuSabido = pagosSabido && (yo?.role !== 'ADMIN' || comedorSabido);
    const menu = useMemo(
        () => elMenuDe(yo?.role, Boolean(pagos?.enabled), Boolean(comedor?.enabled)).map((d) => d.href),
        [yo?.role, pagos?.enabled, comedor?.enabled]
    );
    const estado = useRef({ hayConexion, menu, menuSabido });
    useEffect(() => {
        estado.current = { hayConexion, menu, menuSabido };
    }, [hayConexion, menu, menuSabido]);
    const corriendo = useRef(false);
    const ultima = useRef(0);
    const bajarYa = useRef<((minimo: number) => Promise<void>) | null>(null);

    useEffect(() => {
        if (!yo?.id || !yo.role) return;

        const bajar = async (minimo: number) => {
            const dueno = elDuenoDeAhora();
            if (corriendo.current || !estado.current.hayConexion || !estado.current.menuSabido || !dueno || ahorrandoDatos()) return;
            // La primera descarga la lleva `PrecargaAlEntrar` (con su pantalla, en la app).
            if (seEnsenaLaPrecarga() && !estaCompleta(dueno)) return;
            if (Date.now() - ultima.current < minimo) return;
            corriendo.current = true;
            try {
                // Las pantallas que alguien tocó sin conexión y no estaban.
                const porGuardar = lasPorGuardar();
                if (porGuardar.length) guardarEstasPaginas(porGuardar);
                const r = await ponerseAlDia(dueno, estado.current.menu, () => estado.current.hayConexion);
                if (r === 'todo') {
                    await bajarTodo({
                        dueno,
                        menu: estado.current.menu,
                        hayConexion: () => estado.current.hayConexion,
                        // De fondo no se espera a la conexión para siempre: la próxima vez.
                        cancelada: () => !estado.current.hayConexion || elDuenoDeAhora() !== dueno,
                    });
                }
                ultima.current = Date.now();
            } catch {
                /* sin conexión o sin permiso: la próxima vez */
            } finally {
                corriendo.current = false;
            }
        };
        bajarYa.current = bajar;

        const primera = window.setTimeout(() => void bajar(0), 5_000);
        const cada = window.setInterval(() => void bajar(CADA), CADA);
        const alVolver = () => {
            if (document.visibilityState === 'visible') void bajar(AL_VOLVER);
        };
        let juntando: number | undefined;
        const alCambiar = () => {
            window.clearTimeout(juntando);
            juntando = window.setTimeout(() => void bajar(0), JUNTAR_AVISOS);
        };
        document.addEventListener('visibilitychange', alVolver);
        window.addEventListener(EVENTO_DATOS_CAMBIARON, alCambiar);
        return () => {
            window.clearTimeout(primera);
            window.clearTimeout(juntando);
            window.clearInterval(cada);
            document.removeEventListener('visibilitychange', alVolver);
            window.removeEventListener(EVENTO_DATOS_CAMBIARON, alCambiar);
            bajarYa.current = null;
        };
    }, [yo?.id, yo?.role]);

    // Al volver la conexión, sin esperar: cada teléfono a su hora (de 5 s a 1 min).
    const antes = useRef(hayConexion);
    useEffect(() => {
        const volvio = hayConexion && !antes.current;
        antes.current = hayConexion;
        if (!volvio) return;
        const t = window.setTimeout(() => void bajarYa.current?.(0), 5_000 + escalonar(55_000));
        return () => window.clearTimeout(t);
    }, [hayConexion]);

    return null;
}

export default DescargaEnSegundoPlano;
