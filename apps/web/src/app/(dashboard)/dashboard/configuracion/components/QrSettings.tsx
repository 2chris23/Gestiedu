'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { QrCode } from 'lucide-react';
import { Ajustes, BotonGuardar, CargandoAjustes, Fila, FilaCampo, FilaInterruptor, Grupo, Opciones } from '@/components/configuracion/ajustes';
import { asistenciaQr, elMotivo, type ConfigAsistenciaQr } from '@/lib/asistencia-qr';

/**
 * ASISTENCIA POR QR: LAS REGLAS DE ESTE LICEO
 *
 * Nada de esto está escrito en el código: cada liceo decide el radio, si lejos
 * se rechaza o solo se avisa, cuánto es «a tiempo» y hasta cuándo se corrige.
 * Lo que sale de fábrica es lo que se propuso en el diseño
 * (`docs/PROXIMAS-FUNCIONES.md`).
 */

export function QrSettings() {
    const cola = useQueryClient();
    const { data, isLoading } = useQuery({ queryKey: ['asistencia-qr', 'config'], queryFn: asistenciaQr.config });
    const [c, setC] = useState<ConfigAsistenciaQr | null>(null);
    const [guardando, setGuardando] = useState(false);

    useEffect(() => {
        if (data) setC(data);
    }, [data]);

    if (isLoading || !c) return <CargandoAjustes />;

    const poner = <K extends keyof ConfigAsistenciaQr>(k: K, v: ConfigAsistenciaQr[K]) => setC((x) => (x ? { ...x, [k]: v } : x));

    const guardar = async () => {
        setGuardando(true);
        try {
            const nueva = await asistenciaQr.guardarConfig(c);
            cola.setQueryData(['asistencia-qr', 'config'], nueva);
            toast.success('Reglas de la asistencia por QR guardadas');
        } catch (e) {
            toast.error(elMotivo(e, 'No se pudo guardar'));
        } finally {
            setGuardando(false);
        }
    };

    return (
        <Ajustes>
            <Grupo
                id="qr-activa"
                descripcion="El profesor abre un QR en su clase y los alumnos lo escanean desde su app. Pasar lista a mano sigue funcionando siempre."
            >
                <FilaInterruptor
                    icono={QrCode}
                    titulo="Usar la asistencia por QR"
                    descripcion="Apagada, el botón del QR no aparece en las clases."
                    checked={c.activa}
                    onChange={(v) => poner('activa', v)}
                    comoInterruptor
                />
            </Grupo>

            <fieldset disabled={!c.activa} className="min-w-0 space-y-7 disabled:opacity-60">
                <Grupo id="qr-faro" titulo="Qué tan cerca">
                    <FilaCampo
                        id="qr-radio"
                        etiqueta="Distancia máxima"
                        sufijo="m"
                        ayuda="Al teléfono del profesor cuando abre el QR, esté donde esté la clase."
                        type="number"
                        inputMode="numeric"
                        min={10}
                        max={5000}
                        value={c.radioMetros}
                        onChange={(e) => poner('radioMetros', Number(e.target.value))}
                    />
                    <Fila etiqueta="Si el alumno está más lejos" descripcion="«Por confirmar»: el profesor lo aprueba de un toque. Sin GPS, siempre es por confirmar." apilada>
                        <Opciones
                            etiqueta="Si el alumno está más lejos"
                            valor={c.fueraDelRadio}
                            alCambiar={(v) => poner('fueraDelRadio', v)}
                            opciones={[
                                { valor: 'confirmar', texto: 'Entra por confirmar' },
                                { valor: 'bloquear', texto: 'No se registra' },
                            ]}
                        />
                    </Fila>
                </Grupo>

                <Grupo id="qr-tiempos" titulo="Tiempos">
                    <FilaCampo
                        id="qr-tiempo"
                        etiqueta="Para llegar a tiempo"
                        sufijo="min"
                        ayuda="Desde que el profesor abre el QR. Quien escanea después entra como «tarde»."
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={120}
                        value={c.minutosATiempo}
                        onChange={(e) => poner('minutosATiempo', Number(e.target.value))}
                    />
                    <FilaCampo
                        id="qr-dias"
                        etiqueta="Se puede corregir"
                        sufijo="días atrás"
                        ayuda="Para marcar a quien se olvidó un día pasado. Nunca más allá del cierre del lapso."
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={365}
                        value={c.diasParaCorregir}
                        onChange={(e) => poner('diasParaCorregir', Number(e.target.value))}
                    />
                </Grupo>

                <Grupo id="qr-telefono" titulo="Contra firmar por otro">
                    <FilaInterruptor
                        titulo="Un teléfono por alumno"
                        descripcion="El primero desde el que pasa asistencia queda suyo. Si lo cambia, lo desbloqueas desde su perfil."
                        checked={c.unTelefonoPorAlumno}
                        onChange={(v) => poner('unTelefonoPorAlumno', v)}
                        disabled={!c.activa}
                        comoInterruptor
                    />
                </Grupo>
            </fieldset>

            <BotonGuardar type="button" texto="Guardar" onClick={guardar} guardando={guardando} />
        </Ajustes>
    );
}

export default QrSettings;
