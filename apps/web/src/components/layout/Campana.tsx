'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bell, BellRing, CheckCheck } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { apuntarEsteTelefono, estadoDelPermiso, preferenciasDeAvisos, type EstadoDelPermiso } from '@/lib/avisos-al-telefono';
import api from '@/lib/axios';
import { cn } from '@/lib/utils';

/**
 * LA CAMPANA: LOS AVISOS DE ESTA PERSONA
 *
 * Una citación, y lo que venga (`services/avisos.service.ts`). Con la app
 * abierta llegan al instante por el tiempo real (`aviso:nuevo`) y salen
 * también arriba un momento; con la app cerrada llegan al teléfono
 * (`lib/avisos-al-telefono.ts`). Tocar uno lo marca leído y lleva adonde diga.
 *
 * Dentro, si este teléfono aún no recibe avisos, se ofrece activarlo: el
 * permiso del teléfono se pide solo tras tocar el botón, nunca de golpe.
 */

interface Aviso {
    id: string;
    titulo: string;
    mensaje: string;
    enlace: string | null;
    leido: boolean;
    creadoEl: string;
}

const cuando = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('es-VE', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
};

export function Campana({ className }: { className?: string }) {
    const router = useRouter();
    const cola = useQueryClient();
    const [abierta, setAbierta] = React.useState(false);
    const { data } = useQuery<{ avisos: Aviso[]; sinLeer: number }>({
        queryKey: ['avisos'],
        queryFn: async () => (await api.get('/avisos')).data.data,
        refetchInterval: 5 * 60_000,
    });
    const leer = useMutation({
        mutationFn: async (id?: string) => (await api.patch(id ? `/avisos/${id}/leido` : '/avisos/leidos')).data.data,
        onSuccess: (nuevo) => cola.setQueryData(['avisos'], nuevo),
    });

    // Lo que llega con la app abierta se dice un momento arriba.
    React.useEffect(() => {
        const alLlegar = (e: Event) => {
            const titulo = (e as CustomEvent<{ titulo?: string }>).detail?.titulo;
            if (titulo) toast(titulo, { icon: <BellRing className="h-4 w-4" aria-hidden /> });
        };
        window.addEventListener('gestiedu:aviso', alLlegar);
        return () => window.removeEventListener('gestiedu:aviso', alLlegar);
    }, []);

    const sinLeer = data?.sinLeer ?? 0;
    const abrir = (a: Aviso) => {
        if (!a.leido) leer.mutate(a.id);
        setAbierta(false);
        if (a.enlace) router.push(a.enlace);
    };

    return (
        <Popover open={abierta} onOpenChange={setAbierta}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label={sinLeer ? `Avisos: ${sinLeer} sin leer` : 'Avisos'}
                    className={cn(
                        'relative inline-flex h-11 w-11 items-center justify-center rounded-full text-gray-700 transition-colors hover:bg-gray-100 active:bg-gray-100',
                        className
                    )}
                >
                    <Bell className="h-5 w-5" aria-hidden />
                    {sinLeer > 0 && (
                        <span className="absolute right-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-xs font-bold text-white" aria-hidden>
                            {sinLeer > 9 ? '9+' : sinLeer}
                        </span>
                    )}
                </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl p-0">
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
                    <p className="text-sm font-semibold text-gray-900">Avisos</p>
                    {sinLeer > 0 && (
                        <button
                            type="button"
                            onClick={() => leer.mutate(undefined)}
                            className="inline-flex min-h-[44px] items-center gap-1 text-xs font-semibold text-indigo-700 hover:underline"
                        >
                            <CheckCheck className="h-4 w-4" aria-hidden /> Marcar todos
                        </button>
                    )}
                </div>
                <ActivarEnEsteTelefono />
                {!data || data.avisos.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-gray-600">No tienes avisos.</p>
                ) : (
                    <ul className="max-h-[60dvh] overflow-y-auto" aria-label="Lista de avisos">
                        {data.avisos.map((a) => (
                            <li key={a.id}>
                                <button
                                    type="button"
                                    onClick={() => abrir(a)}
                                    className={cn('block w-full border-b border-gray-50 px-4 py-3 text-left hover:bg-gray-50', !a.leido && 'bg-indigo-50/60')}
                                >
                                    <span className="flex items-start gap-2">
                                        {!a.leido && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-indigo-600" aria-label="Sin leer" />}
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-sm font-semibold text-gray-900">{a.titulo}</span>
                                            <span className="block text-sm text-gray-700">{a.mensaje}</span>
                                            <span className="mt-0.5 block text-xs text-gray-500">{cuando(a.creadoEl)}</span>
                                        </span>
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </PopoverContent>
        </Popover>
    );
}

/**
 * LOS AVISOS AL TELÉFONO, DESDE LA CAMPANA
 *
 * Activarlos en este teléfono (el permiso se pide al tocar), o apagarlos y
 * encenderlos para todos los teléfonos de la persona (la campana sigue).
 */
function ActivarEnEsteTelefono() {
    const [estado, setEstado] = React.useState<EstadoDelPermiso | null>(null);
    const [alTelefono, setAlTelefono] = React.useState(true);
    const [ocupado, setOcupado] = React.useState(false);
    React.useEffect(() => {
        let vivo = true;
        preferenciasDeAvisos()
            .then(async (p) => {
                const e = await estadoDelPermiso(p);
                if (!vivo) return;
                setAlTelefono(p.alTelefono);
                setEstado(e);
            })
            .catch(() => vivo && setEstado('no-se-puede'));
        return () => {
            vivo = false;
        };
    }, []);
    if (!estado || estado === 'no-se-puede') return null;

    const ponerAlTelefono = async (si: boolean) => {
        setOcupado(true);
        try {
            await api.put('/avisos/preferencias', { alTelefono: si });
            setAlTelefono(si);
            toast.success(si ? 'Avisos al teléfono encendidos' : 'Avisos al teléfono apagados; siguen en la campana');
        } catch {
            toast.error('No se pudo cambiar');
        } finally {
            setOcupado(false);
        }
    };
    const boton = 'mt-2 inline-flex min-h-[44px] items-center gap-2 rounded-lg px-3 text-sm font-semibold disabled:opacity-60';

    if (estado === 'denegado') {
        return (
            <p className="border-b border-gray-100 px-4 py-2 text-xs text-gray-600">
                Este teléfono tiene los avisos bloqueados para Gestiedu. Se activan en los ajustes del teléfono (o del navegador).
            </p>
        );
    }
    if (!alTelefono) {
        return (
            <div className="border-b border-gray-100 px-4 py-3">
                <p className="text-sm text-gray-800">Los avisos al teléfono están apagados: solo salen aquí.</p>
                <button type="button" disabled={ocupado} onClick={() => ponerAlTelefono(true)} className={`${boton} bg-indigo-600 text-white hover:bg-indigo-700`}>
                    <BellRing className="h-4 w-4" aria-hidden /> Encender avisos al teléfono
                </button>
            </div>
        );
    }
    if (estado === 'concedido') {
        return (
            <div className="border-b border-gray-100 px-4 py-1">
                <button type="button" disabled={ocupado} onClick={() => ponerAlTelefono(false)} className={`${boton} mt-0 text-gray-700 hover:bg-gray-50`}>
                    Apagar los avisos al teléfono
                </button>
            </div>
        );
    }
    return (
        <div className="border-b border-gray-100 px-4 py-3">
            <p className="text-sm text-gray-800">Recibe los avisos del liceo en este teléfono, aunque la app esté cerrada.</p>
            <button
                type="button"
                disabled={ocupado}
                onClick={async () => {
                    setOcupado(true);
                    try {
                        const e = await apuntarEsteTelefono(true);
                        setEstado(e);
                        if (e === 'concedido') toast.success('Listo: los avisos llegarán a este teléfono');
                    } catch {
                        toast.error('No se pudo activar en este teléfono');
                    } finally {
                        setOcupado(false);
                    }
                }}
                className={`${boton} bg-indigo-600 text-white hover:bg-indigo-700`}
            >
                <BellRing className="h-4 w-4" aria-hidden /> Activar avisos
            </button>
        </div>
    );
}

/**
 * Al abrir la app con el permiso ya dado, se vuelve a apuntar el teléfono (en
 * silencio): así, si otra persona entra en el mismo teléfono, los avisos pasan
 * a ser suyos y no del anterior.
 */
export function ApuntarElTelefonoAlEntrar() {
    React.useEffect(() => {
        void apuntarEsteTelefono(false).catch(() => undefined);
    }, []);
    return null;
}

export default Campana;

const YA_SE_OFRECIO = 'gestiedu:avisos-ofrecidos';

/**
 * AL ENTRAR, UNA VEZ: «¿TE AVISAMOS EN EL TELÉFONO?»
 *
 * Con una explicación antes del aviso del sistema, que sin contexto se
 * rechaza por reflejo (y rechazado ya no se puede volver a preguntar). Si dice
 * «Ahora no», no se vuelve a ofrecer aquí; sigue en la campana.
 */
export function OfrecerAvisos() {
    const [ver, setVer] = React.useState(false);
    const [ocupado, setOcupado] = React.useState(false);
    React.useEffect(() => {
        let vivo = true;
        let ofrecido = false;
        try {
            ofrecido = localStorage.getItem(YA_SE_OFRECIO) === '1';
        } catch {
            ofrecido = true; // sin almacenamiento no se puede recordar: mejor no insistir
        }
        if (ofrecido) return;
        preferenciasDeAvisos()
            .then((p) => (p.alTelefono ? estadoDelPermiso(p) : ('no-se-puede' as const)))
            .then((e) => vivo && setVer(e === 'sin-preguntar'))
            .catch(() => undefined);
        return () => {
            vivo = false;
        };
    }, []);
    const cerrar = () => {
        try {
            localStorage.setItem(YA_SE_OFRECIO, '1');
        } catch {
            /* nada */
        }
        setVer(false);
    };
    if (!ver) return null;
    return (
        <section aria-label="Avisos en el teléfono" className="mb-4 flex flex-col gap-3 rounded-2xl border border-indigo-100 bg-indigo-50 p-4 sm:flex-row sm:items-center print:hidden">
            <BellRing className="h-6 w-6 shrink-0 text-indigo-700" aria-hidden />
            <p className="flex-1 text-sm text-gray-800">
                ¿Te avisamos en el teléfono cuando el liceo te necesite (una citación, por ejemplo), aunque la app esté cerrada?
            </p>
            <div className="flex gap-2">
                <button type="button" onClick={cerrar} className="min-h-[44px] rounded-lg px-3 text-sm font-semibold text-gray-700 hover:bg-white">
                    Ahora no
                </button>
                <button
                    type="button"
                    disabled={ocupado}
                    onClick={async () => {
                        setOcupado(true);
                        try {
                            const e = await apuntarEsteTelefono(true);
                            if (e === 'concedido') toast.success('Listo: los avisos llegarán a este teléfono');
                        } catch {
                            toast.error('No se pudo activar en este teléfono');
                        } finally {
                            setOcupado(false);
                            cerrar();
                        }
                    }}
                    className="min-h-[44px] rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                    Sí, avisarme
                </button>
            </div>
        </section>
    );
}
