'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api from '@/lib/axios';
import { esQueNoContesta } from '@/lib/estado-del-servidor';
import { escalonar, esperaQuePide } from '@/lib/azar';
import { pedirQueNoSeBorre } from '@/lib/base-del-telefono';
import { toast } from 'sonner';
import { useConexion } from '@/hooks/useConexion';
import { elDuenoDeAhora } from '@/lib/el-dueno';
import {
    EVENTO_ENCOLADO,
    actualizarCambio,
    esperaTras,
    laCola,
    pendientesDeOtros,
    quitarCambio,
    tirarLosDe,
    type CambioPendiente,
} from '@/lib/por-enviar';

/**
 * LO PENDIENTE SUBE SOLO AL VOLVER LA CONEXIÓN (como WhatsApp)
 *
 * Lo que se hizo sin conexión (`lib/por-enviar.ts`) sale de aquí: al volver la
 * conexión, al volver a la app, al dejar algo nuevo en la cola y cada 30 s
 * mientras quede algo. En orden: plan → crear → cambiar → borrar al final.
 *
 * Lo que contesta el servidor, cada cosa a su sitio, y nada se pierde en
 * silencio:
 *   - llegó → fuera de la cola, y la pantalla se refresca;
 *   - 409 «cambió mientras tanto» → «hay que decidir» (la persona elige);
 *   - 202 «espera a otro» → se enseña a quién espera;
 *   - otro «no» (ya no das esa clase…) → «no se pudo», con el motivo;
 *   - sin red → se para y se vuelve a intentar, cada vez más espaciado.
 *
 * Solo con la sesión de quien lo hizo: lo de otra persona en este teléfono no
 * se manda con la sesión de esta (y se tira: se le avisó al entrar).
 */

type Resultado = 'ok' | 'sin-red' | 'sin-sesion';

/** Lo que pidió esperar el servidor (429 con `Retry-After`), si lo pidió. */
let esperaPedida: number | null = null;

async function mandar(c: CambioPendiente): Promise<Resultado> {
    try {
        const r = await api.request({
            method: c.metodo,
            url: c.url,
            params: c.params,
            data: c.datos,
            headers: { 'X-Cambio': c.id, 'X-Hecho-En': c.hechoEn },
        });
        if (r.status === 202) {
            await actualizarCambio(c.id, { estado: 'en-espera', motivo: r.data?.error, choque: r.data });
        } else {
            await quitarCambio(c.id);
        }
        return 'ok';
    } catch (e: any) {
        if (esQueNoContesta(e)) return 'sin-red';
        const status = e?.response?.status;
        const data = e?.response?.data;
        if (status === 401) return 'sin-sesion';
        // «Demasiadas a la vez»: no es un no, es un «ahora no». Antes se
        // marcaba como rechazado y el cambio se perdía en la lista de «no se
        // pudo» justo cuando más teléfonos subían a la vez (vuelve la luz).
        if (status === 429) {
            esperaPedida = esperaQuePide(e?.response?.headers?.['retry-after']);
            return 'sin-red';
        }
        if (status === 409 && data?.code === 'CAMBIO_EN_CURSO') return 'sin-red';
        // El plan o el instrumento se guardaron desde otro sitio mientras
        // tanto: se pregunta si queda lo de uno (pisando) o lo del otro.
        if (status === 409 && (data?.code === 'PLAN_CAMBIADO_EN_OTRO_SITIO' || data?.code === 'INSTRUMENTO_CAMBIADO')) {
            await actualizarCambio(c.id, { estado: 'hay-que-decidir', motivo: data?.error, choque: { ...data, que: 'VERSION' } });
            return 'ok';
        }
        // Lo que en línea se confirma con una pregunta (el horario nuevo deja
        // clases fuera de la rejilla) se pregunta igual al llegar.
        if (status === 409 && data?.code === 'HORARIO_DEJA_CLASES_FUERA') {
            await actualizarCambio(c.id, { estado: 'hay-que-decidir', motivo: data?.error, choque: { ...data, que: 'CONFIRMAR' } });
            return 'ok';
        }
        if (status === 409 && data?.code === 'CAMBIO_MIENTRAS_TANTO') {
            await actualizarCambio(c.id, { estado: 'hay-que-decidir', motivo: data?.error, choque: data });
            return 'ok';
        }
        await actualizarCambio(c.id, {
            estado: 'rechazado',
            motivo: data?.error || data?.message || `El servidor no lo aceptó (${status ?? 'sin respuesta'})`,
            choque: data,
        });
        return 'ok';
    }
}

/**
 * Sube la cola de `dueno` en orden. Devuelve si llegó algo. Un cambio que el
 * servidor no acepta (400: la forma cambió en una versión nueva, ya no da esa
 * clase…) pasa a «no se pudo» y NO detiene a los de detrás: un solo cambio
 * envenenado no puede atascar todo lo demás (SINCON-13). Solo la falta de red
 * (o un «ahora no», 429) para la cola, para no desordenar.
 */
export async function subirLaCola(dueno: string): Promise<boolean> {
    let llego = false;
    // Lo de otra persona en este teléfono no se manda con esta sesión.
    if ((await pendientesDeOtros(dueno)).length) {
        for (const o of new Set((await pendientesDeOtros(dueno)).map((c) => c.dueno))) await tirarLosDe(o);
    }
    for (const c of await laCola(dueno)) {
        if (c.estado !== 'pendiente') continue;
        // Uno que espera tras un fallo de red detiene a los de detrás:
        // el orden (borrar al final) importa más que la prisa.
        if (c.noAntesDe && Date.now() < c.noAntesDe) break;
        const r = await mandar(c);
        if (r === 'sin-red') {
            const espera = Math.max(esperaTras(c.intentos + 1), esperaPedida ?? 0);
            esperaPedida = null;
            await actualizarCambio(c.id, { intentos: c.intentos + 1, noAntesDe: Date.now() + espera });
            break;
        }
        if (r === 'sin-sesion') break;
        llego = true;
    }
    return llego;
}

export function EnviarLoPendiente() {
    const { hayConexion } = useConexion();
    const cliente = useQueryClient();
    const enviando = useRef(false);
    const otraVez = useRef(false);

    const enviar = useCallback(async () => {
        const dueno = elDuenoDeAhora();
        if (!dueno) return;
        if (enviando.current) {
            otraVez.current = true;
            return;
        }
        enviando.current = true;
        let llego = false;
        try {
            llego = await subirLaCola(dueno);
        } finally {
            enviando.current = false;
            if (llego) void cliente.invalidateQueries({ refetchType: 'active' });
            if (otraVez.current) {
                otraVez.current = false;
                void enviar();
            }
        }
    }, [cliente]);

    // Al abrir, en el acto; al VOLVER la conexión, cada teléfono en su
    // momento (0–4 s): vuelve la luz y vuelven todos a la vez.
    const habiaConexion = useRef(hayConexion);
    useEffect(() => {
        void laCola(elDuenoDeAhora());
        const volvio = hayConexion && !habiaConexion.current;
        habiaConexion.current = hayConexion;
        if (!hayConexion) return;
        if (!volvio) {
            void enviar();
            return;
        }
        const t = window.setTimeout(() => void enviar(), escalonar(4000));
        return () => window.clearTimeout(t);
    }, [hayConexion, enviar]);

    // Que el navegador no tire lo pendiente cuando le falte sitio; y si queda
    // poco, avisarlo una vez (en un teléfono lleno lo hecho sin conexión no cabe).
    useEffect(() => {
        void pedirQueNoSeBorre().then(({ libre }) => {
            if (libre !== null && libre < 15 * 1024 * 1024) {
                toast.warning('Queda poco espacio en este teléfono: lo que hagas sin conexión podría no guardarse.', { id: 'poco-espacio' });
            }
        });
    }, []);

    useEffect(() => {
        const ya = () => void enviar();
        const alVolver = () => document.visibilityState === 'visible' && void enviar();
        document.addEventListener(EVENTO_ENCOLADO, ya);
        document.addEventListener('visibilitychange', alVolver);
        const cada = window.setInterval(ya, 30_000);
        return () => {
            document.removeEventListener(EVENTO_ENCOLADO, ya);
            document.removeEventListener('visibilitychange', alVolver);
            window.clearInterval(cada);
        };
    }, [enviar]);

    return null;
}

export default EnviarLoPendiente;
