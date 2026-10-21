'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Loader2, Fingerprint } from 'lucide-react';
import MisSesiones from '@/components/configuracion/MisSesiones';
import { Ajustes, BotonGuardar, FilaCampo, FilaInterruptor, Grupo } from '@/components/configuracion/ajustes';
import BloquearAlVolver from '@/components/layout/BloquearAlVolver';
import api from '@/lib/axios';
import { getApiErrorMessage } from '@/lib/utils';
import { elLiceoDeLaCookie } from '@/lib/la-puerta-del-liceo';
import { guardarLaLlave, hayHuella, hayLlaveGuardada, laLlaveGuardada, olvidarLaLlave } from '@/lib/la-huella';

/**
 * «CONTRASEÑA Y ACCESO», EN CONFIGURACIÓN (como la «Seguridad» de Rial)
 *
 * Vivía en la ficha de Mi cuenta, que se había llenado de todo (Cristian,
 * 14-oct-2026: «tiene demasiadas configuraciones»). Ahora la ficha trae solo
 * Configuración y Cerrar sesión, y esto es un apartado de Configuración:
 * cambiar mi contraseña, la huella de este teléfono, cuándo bloquear la app
 * y dónde tengo la sesión abierta.
 */

export function ContrasenaYAcceso({ nombreCompleto }: { nombreCompleto: string }) {
    return (
        <Ajustes>
            <FormularioDeClave />
            {/* Lo de este teléfono: la huella y el candado (solo en la app). */}
            <Grupo id="este-telefono" titulo="En este teléfono" className="has-[>div:empty]:hidden">
                <LaHuellaDeEsteTelefono visible correo={nombreCompleto} />
                <BloquearAlVolver />
            </Grupo>
            <MisSesiones />
        </Ajustes>
    );
}

/**
 * ENTRAR CON LA HUELLA EN ESTE TELÉFONO
 *
 * Solo aparece dentro de la app del liceo y solo si el teléfono tiene huella
 * configurada. En un navegador no sale: no hay dónde guardar una llave detrás
 * de una huella, y ofrecerlo sería fingir una seguridad que no está.
 *
 * Lo que se guarda es una llave que emite el servidor, en el almacén de claves
 * del propio Android. La huella abre ese cajón; no entra al sistema. Al
 * apagarlo, la llave se anula en el servidor y se borra del teléfono.
 */
function LaHuellaDeEsteTelefono({ visible, correo }: { visible: boolean; correo: string }) {
    const [sePuede, setSePuede] = React.useState(false);
    const [encendida, setEncendida] = React.useState(false);
    const [trabajando, setTrabajando] = React.useState(false);

    const liceo = React.useMemo(() => elLiceoDeLaCookie(), []);

    React.useEffect(() => {
        if (!visible || !liceo) return;
        let vivo = true;
        (async () => {
            const puede = await hayHuella();
            if (!vivo) return;
            setSePuede(puede);
            if (puede) setEncendida(await hayLlaveGuardada(liceo));
        })();
        return () => {
            vivo = false;
        };
    }, [visible, liceo]);

    if (!sePuede || !liceo) return null;

    const cambiar = async (encender: boolean) => {
        setTrabajando(true);
        try {
            if (encender) {
                const r = await fetch('/api/auth/llave-del-telefono', { method: 'POST' });
                if (!r.ok) throw new Error('No se pudo guardar la llave');
                const { llave } = await r.json();
                const guardada = await guardarLaLlave(liceo, correo, llave);
                if (!guardada) throw new Error('El teléfono no dejó guardar la llave');
                setEncendida(true);
                toast.success('Listo: la próxima vez entras con la huella');
            } else {
                const llave = await laLlaveGuardada(liceo);
                await olvidarLaLlave(liceo);
                await fetch('/api/auth/llave-del-telefono', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ llave }),
                });
                setEncendida(false);
                toast.success('Ya no se entra con la huella en este teléfono');
            }
        } catch (error) {
            toast.error(getApiErrorMessage(error, 'No se pudo cambiar'));
        } finally {
            setTrabajando(false);
        }
    };

    return (
        <div className="relative">
            <FilaInterruptor
                icono={Fingerprint}
                titulo="Entrar con la huella"
                descripcion="La primera vez siempre es con contraseña."
                checked={encendida}
                disabled={trabajando}
                onChange={(v) => void cambiar(v)}
            />
            {trabajando && <Loader2 className="absolute right-20 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-gray-400" aria-hidden />}
        </div>
    );
}

/** El formulario de la contraseña. El servidor exige 8; aquí se dice antes. */
function FormularioDeClave() {
    const [actual, setActual] = React.useState('');
    const [nueva, setNueva] = React.useState('');
    const [repetida, setRepetida] = React.useState('');
    const [enviando, setEnviando] = React.useState(false);

    const enviar = async (e: React.FormEvent) => {
        e.preventDefault();
        if (nueva.length < 8) {
            toast.error('La contraseña nueva necesita al menos 8 caracteres');
            return;
        }
        if (nueva !== repetida) {
            toast.error('Las dos contraseñas nuevas no son iguales');
            return;
        }
        try {
            setEnviando(true);
            await api.post('/auth/change-password', { currentPassword: actual, newPassword: nueva });
            toast.success('Contraseña cambiada');
            setActual('');
            setNueva('');
            setRepetida('');
        } catch (error) {
            toast.error(getApiErrorMessage(error, 'No se pudo cambiar la contraseña'));
        } finally {
            setEnviando(false);
        }
    };

    return (
        <form onSubmit={enviar} className="space-y-4">
            <Grupo id="mi-contrasena" titulo="Cambiar mi contraseña" pie="Mínimo 8 caracteres. Al cambiarla, sigues dentro en este aparato.">
                <FilaCampo etiqueta="Actual" type="password" autoComplete="current-password" value={actual} onChange={(e) => setActual(e.target.value)} placeholder="Contraseña actual" required />
                <FilaCampo etiqueta="Nueva" type="password" autoComplete="new-password" value={nueva} onChange={(e) => setNueva(e.target.value)} placeholder="Contraseña nueva (mínimo 8)" required />
                <FilaCampo etiqueta="Repetir" type="password" autoComplete="new-password" value={repetida} onChange={(e) => setRepetida(e.target.value)} placeholder="Repite la contraseña nueva" required />
            </Grupo>
            <BotonGuardar guardando={enviando} texto="Guardar la contraseña nueva" />
        </form>
    );
}

export default ContrasenaYAcceso;
