'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CalendarDays, Loader2, Palmtree, Plus, Save, Search, UserPlus, Users } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import UserAvatar from '@/components/ui/UserAvatar';
import { campo } from '@/components/finanzas/CampoDeDinero';
import { FichaDePersonal } from '@/components/finanzas/FichaDePersonal';
import {
    FRECUENCIA,
    useAplicarATodos,
    useCrearPersona,
    useFichaDePersonal,
    useGuardarNomina,
    usePersonal,
    type FrecuenciaDelPersonal,
    type ListaDelPersonal,
    type PersonaDelPersonal,
} from '@/hooks/useFinanzas';
import { dinero, errorDe } from '@/hooks/usePagos';
import { mesesDelCiclo, nombreDelMes } from '@/lib/calendario-del-ciclo';
import { cn } from '@/lib/utils';

/**
 * EL PERSONAL: A QUIÉN SE LE PAGA (2026-10-01)
 *
 * Cristian: «controlar también los pagos a los profesores y al personal…
 * poder fijar fecha de pago, para todos o personalizado para cada profesor…
 * los profesores se les pagan vacaciones… otro personal: crear un nombre, si
 * es un pago único, mensual, quincenal… y que guarde ese personal para los
 * próximos ciclos».
 *
 * Arriba lo de todos (el día de pago, las vacaciones, el bono). Luego quien
 * aún no tiene sueldo, con un botón para ponerles el mismo a varios. Y la
 * lista: cada persona con lo acordado, su próximo pago y si algo está atrasado.
 */

const fechaCorta = (ymd: string) => ymd.split('-').reverse().join('/');

export function VistaDelPersonal({ ciclo }: { ciclo: string | null }) {
    const { data, isLoading } = usePersonal(true, ciclo);
    const [abierta, setAbierta] = React.useState<string | null>(null);
    const [agregando, setAgregando] = React.useState(false);
    const [ajustando, setAjustando] = React.useState(false);
    const [busqueda, setBusqueda] = React.useState('');

    if (isLoading || !data) {
        return (
            <div className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-600" aria-label="Cargando el personal" />
            </div>
        );
    }
    const fmt = (n: string | number) => dinero(n, data.currency);
    const texto = busqueda.trim().toLowerCase();
    const visibles = data.personas.filter((p) => !texto || `${p.nombre} ${p.cargo} ${p.cedula ?? ''}`.toLowerCase().includes(texto));
    const sinSueldo = data.personas.filter((p) => p.activo && !p.acuerdo);
    const n = data.nomina;

    return (
        <div className="space-y-6">
            {data.traidos.traidos > 0 && (
                <p className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
                    Se trajeron {data.traidos.traidos} {data.traidos.traidos === 1 ? 'persona' : 'personas'} del ciclo {data.traidos.desde}, con lo mismo acordado. Revisa si
                    a alguien le cambió el sueldo.
                </p>
            )}

            <section className="rounded-2xl border border-gray-200 bg-white p-4" aria-labelledby="titulo-para-todos">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h2 id="titulo-para-todos" className="text-lg font-bold text-gray-900">
                            Para todos
                        </h2>
                        <ul className="mt-1 space-y-1 text-sm text-gray-700">
                            <li className="flex items-center gap-2">
                                <CalendarDays className="h-4 w-4 text-indigo-600" aria-hidden />
                                Se paga {n.diaDePago >= 31 ? 'el último día de cada mes' : `el día ${n.diaDePago} de cada mes`} (las quincenas, el 15 y el último)
                            </li>
                            <li className="flex items-center gap-2">
                                <Palmtree className="h-4 w-4 text-amber-700" aria-hidden />
                                Vacaciones: {n.mesesDeVacaciones.length ? n.mesesDeVacaciones.map(nombreDelMes).join(', ') : 'ningún mes marcado'} ·{' '}
                                {n.cobraEnVacaciones ? 'se cobran' : 'no se cobran'}
                                {Number(n.bonoVacacional) > 0 ? ` · bono de ${fmt(n.bonoVacacional)}` : ''}
                            </li>
                        </ul>
                        <p className="mt-1 text-xs text-gray-600">Cada persona puede tener lo suyo: se cambia en su ficha.</p>
                    </div>
                    {!data.closed && (
                        <Button variant="contorno" onClick={() => setAjustando(true)}>
                            Cambiar para todos
                        </Button>
                    )}
                </div>
            </section>

            {!data.closed && sinSueldo.length > 0 && <SinSueldo personas={sinSueldo} ciclo={ciclo} moneda={data.currency} />}

            <section aria-labelledby="titulo-personal" className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 id="titulo-personal" className="text-lg font-bold text-gray-900">
                        Personal ({data.personas.filter((p) => p.activo).length})
                    </h2>
                    {!data.closed && (
                        <Button onClick={() => setAgregando(true)}>
                            <UserPlus aria-hidden />
                            Agregar persona
                        </Button>
                    )}
                </div>
                <div className="relative">
                    <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" aria-hidden />
                    <input
                        type="search"
                        aria-label="Buscar en el personal"
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        placeholder="Buscar por nombre, cargo o cédula"
                        className="min-h-[44px] w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                    />
                </div>
                <ul className="grid gap-2 lg:grid-cols-2">
                    {visibles.map((p) => (
                        <li key={p.id}>
                            <TarjetaDePersona persona={p} fmt={fmt} alAbrir={() => setAbierta(p.id)} />
                        </li>
                    ))}
                </ul>
                {visibles.length === 0 && <p className="py-6 text-center text-sm text-gray-700">Nadie coincide con «{busqueda}».</p>}
            </section>

            {abierta && <DialogoDePersona id={abierta} ciclo={ciclo} alCerrar={() => setAbierta(null)} />}
            {agregando && <AgregarPersona alCerrar={(id) => { setAgregando(false); if (id) setAbierta(id); }} />}
            {ajustando && <AjustesDeNomina lista={data} ciclo={ciclo} alCerrar={() => setAjustando(false)} />}
        </div>
    );
}

function TarjetaDePersona({ persona: p, fmt, alAbrir }: { persona: PersonaDelPersonal; fmt: (n: string | number) => string; alAbrir: () => void }) {
    const a = p.acuerdo;
    const r = p.resumen;
    const atrasado = r && Number(r.vencido) > 0;
    return (
        <button
            type="button"
            onClick={alAbrir}
            className={cn('flex w-full items-center gap-3 rounded-2xl border bg-white p-3 text-left hover:bg-gray-50', p.activo ? 'border-gray-200' : 'border-dashed border-gray-300 opacity-70')}
        >
            <UserAvatar name={p.nombre} className="h-10 w-10" initialsClassName="text-sm" />
            <span className="min-w-0 flex-1">
                <span className="block break-words text-sm font-semibold text-gray-900">{p.nombre}</span>
                <span className="block text-xs text-gray-600">
                    {p.cargo}
                    {!p.conCuenta && ' · sin cuenta'}
                    {!p.activo && ' · ya no trabaja aquí'}
                </span>
                <span className="mt-0.5 block text-xs text-gray-700">
                    {a ? (
                        <>
                            {fmt(a.monto)} · {FRECUENCIA[a.frecuencia].toLowerCase()}
                            {r?.proximo ? ` · próximo el ${fechaCorta(r.proximo.fecha)}` : r ? ' · todo pagado' : ''}
                        </>
                    ) : (
                        <span className="font-semibold text-amber-800">Sin sueldo fijado</span>
                    )}
                </span>
            </span>
            {atrasado && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-800">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                    Atrasado {fmt(r!.vencido)}
                </span>
            )}
        </button>
    );
}

function DialogoDePersona({ id, ciclo, alCerrar }: { id: string; ciclo: string | null; alCerrar: () => void }) {
    const { data, isLoading } = useFichaDePersonal(id, ciclo);
    return (
        <Dialog open onOpenChange={(v) => !v && alCerrar()}>
            <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{data?.persona.nombre ?? 'Personal'}</DialogTitle>
                    <DialogDescription>{data ? `${data.persona.cargo} · ciclo ${data.academicYear.name}` : ''}</DialogDescription>
                </DialogHeader>
                {isLoading || !data ? (
                    <div className="flex justify-center py-10">
                        <Loader2 className="h-6 w-6 animate-spin text-indigo-600" aria-label="Cargando" />
                    </div>
                ) : (
                    <FichaDePersonal key={data.persona.id} ficha={data} ciclo={ciclo} />
                )}
            </DialogContent>
        </Dialog>
    );
}

function SinSueldo({ personas, ciclo, moneda }: { personas: PersonaDelPersonal[]; ciclo: string | null; moneda: string }) {
    const aplicar = useAplicarATodos(ciclo);
    const [elegidas, setElegidas] = React.useState<Set<string>>(new Set(personas.map((p) => p.id)));
    const [monto, setMonto] = React.useState('');
    const [frecuencia, setFrecuencia] = React.useState<FrecuenciaDelPersonal>('MENSUAL');
    React.useEffect(() => setElegidas(new Set(personas.map((p) => p.id))), [personas]);
    const enviar = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const r = await aplicar.mutateAsync({ monto, frecuencia, personalIds: [...elegidas] });
            toast.success(`Sueldo puesto a ${r.aplicados} ${r.aplicados === 1 ? 'persona' : 'personas'}`);
        } catch (err) {
            toast.error(errorDe(err, 'No se pudo aplicar'));
        }
    };
    return (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4" aria-labelledby="titulo-sin-sueldo">
            <h2 id="titulo-sin-sueldo" className="flex items-center gap-2 text-base font-bold text-amber-900">
                <Users className="h-5 w-5" aria-hidden />
                {personas.length} sin sueldo fijado
            </h2>
            <p className="mt-1 text-sm text-amber-900">Ponles el mismo sueldo de una vez; luego, a quien sea distinto, se le cambia en su ficha.</p>
            <ul className="mt-3 flex flex-wrap gap-2">
                {personas.map((p) => (
                    <li key={p.id}>
                        <label className="flex min-h-[44px] items-center gap-2 rounded-full border border-amber-300 bg-white px-3 text-sm text-gray-800">
                            <input
                                type="checkbox"
                                checked={elegidas.has(p.id)}
                                onChange={() =>
                                    setElegidas((s) => {
                                        const n = new Set(s);
                                        n.has(p.id) ? n.delete(p.id) : n.add(p.id);
                                        return n;
                                    })
                                }
                                className="h-4 w-4 accent-indigo-600"
                            />
                            {p.nombre}
                        </label>
                    </li>
                ))}
            </ul>
            <form onSubmit={enviar} className="mt-3 flex flex-wrap items-end gap-2">
                <label className="text-sm font-medium text-gray-800">
                    Cuánto ({moneda === 'USD' ? '$' : 'Bs'})
                    <input required type="number" min="0.01" step="0.01" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} className={cn(campo, 'w-36')} />
                </label>
                <div className="flex gap-2" role="radiogroup" aria-label="Cada cuánto">
                    {(['MENSUAL', 'QUINCENAL'] as FrecuenciaDelPersonal[]).map((f) => (
                        <button
                            key={f}
                            type="button"
                            role="radio"
                            aria-checked={frecuencia === f}
                            onClick={() => setFrecuencia(f)}
                            className={cn('min-h-[44px] rounded-lg border px-3 text-sm', frecuencia === f ? 'border-indigo-600 bg-indigo-600 font-semibold text-white' : 'border-gray-300 bg-white text-gray-800')}
                        >
                            {FRECUENCIA[f]}
                        </button>
                    ))}
                </div>
                <Button type="submit" disabled={aplicar.isPending || !monto || elegidas.size === 0}>
                    {aplicar.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
                    Ponerles este sueldo ({elegidas.size})
                </Button>
            </form>
        </section>
    );
}

function AgregarPersona({ alCerrar }: { alCerrar: (id?: string) => void }) {
    const crear = useCrearPersona();
    const [nombre, setNombre] = React.useState('');
    const [cargo, setCargo] = React.useState('');
    const [cedula, setCedula] = React.useState('');
    const [seQueda, setSeQueda] = React.useState(true);
    const [problema, setProblema] = React.useState<string | null>(null);
    const enviar = async (e: React.FormEvent) => {
        e.preventDefault();
        setProblema(null);
        try {
            const r = await crear.mutateAsync({ nombre, cargo, cedula: cedula || null, seQuedaParaProximosCiclos: seQueda });
            toast.success(`${nombre} agregado: ahora ponle su sueldo`);
            alCerrar(r.persona.id);
        } catch (err) {
            setProblema(errorDe(err, 'No se pudo agregar'));
        }
    };
    return (
        <Dialog open onOpenChange={(v) => !v && alCerrar()}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Agregar persona</DialogTitle>
                    <DialogDescription>Personal sin cuenta en el sistema (limpieza, vigilancia, cocina…). Los profesores con cuenta ya aparecen solos.</DialogDescription>
                </DialogHeader>
                <form onSubmit={enviar} className="space-y-3">
                    <label className="block text-sm font-medium text-gray-800">
                        Nombre y apellido
                        <input required minLength={3} maxLength={120} value={nombre} onChange={(e) => setNombre(e.target.value)} className={campo} />
                    </label>
                    <label className="block text-sm font-medium text-gray-800">
                        Cargo
                        <input required minLength={2} maxLength={60} value={cargo} onChange={(e) => setCargo(e.target.value)} placeholder="Ej.: Vigilante" className={campo} />
                    </label>
                    <label className="block text-sm font-medium text-gray-800">
                        Cédula (opcional)
                        <input maxLength={20} value={cedula} onChange={(e) => setCedula(e.target.value)} className={campo} />
                    </label>
                    <label className="flex min-h-[44px] items-center gap-2 text-sm text-gray-800">
                        <input type="checkbox" checked={seQueda} onChange={(e) => setSeQueda(e.target.checked)} className="h-5 w-5 accent-indigo-600" />
                        Guardarlo para los próximos ciclos (con lo mismo acordado)
                    </label>
                    {problema && (
                        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                            {problema}
                        </p>
                    )}
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="contorno" onClick={() => alCerrar()}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={crear.isPending}>
                            {crear.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <UserPlus aria-hidden />}
                            Agregar
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function AjustesDeNomina({ lista, ciclo, alCerrar }: { lista: ListaDelPersonal; ciclo: string | null; alCerrar: () => void }) {
    const guardar = useGuardarNomina(ciclo);
    const n = lista.nomina;
    const [dia, setDia] = React.useState(String(n.diaDePago));
    const [meses, setMeses] = React.useState<Set<string>>(new Set(n.mesesDeVacaciones));
    const [cobra, setCobra] = React.useState(n.cobraEnVacaciones);
    const [bono, setBono] = React.useState(Number(n.bonoVacacional) > 0 ? n.bonoVacacional : '');
    const [fechaBono, setFechaBono] = React.useState(n.fechaBono ?? '');
    const [problema, setProblema] = React.useState<string | null>(null);
    const delCiclo = mesesDelCiclo(lista.academicYear.startDate, lista.academicYear.endDate);
    const enviar = async (e: React.FormEvent) => {
        e.preventDefault();
        setProblema(null);
        try {
            await guardar.mutateAsync({ diaDePago: Number(dia), mesesDeVacaciones: [...meses], cobraEnVacaciones: cobra, bonoVacacional: bono || 0, fechaBono: fechaBono || null });
            toast.success('Guardado para todos');
            alCerrar();
        } catch (err) {
            setProblema(errorDe(err, 'No se pudo guardar'));
        }
    };
    return (
        <Dialog open onOpenChange={(v) => !v && alCerrar()}>
            <DialogContent className="max-h-[92dvh] max-w-lg overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>La nómina, para todos</DialogTitle>
                    <DialogDescription>Vale para quien no tenga lo suyo puesto en su ficha.</DialogDescription>
                </DialogHeader>
                <form onSubmit={enviar} className="space-y-4">
                    <label className="block text-sm font-medium text-gray-800">
                        Día de pago de cada mes (1–31)
                        <input required type="number" min={1} max={31} value={dia} onChange={(e) => setDia(e.target.value)} className={cn(campo, 'w-28')} />
                        <span className="mt-1 block text-xs text-gray-600">31 = el último día del mes (en febrero, el 28).</span>
                    </label>
                    <fieldset>
                        <legend className="text-sm font-medium text-gray-800">Meses de vacaciones</legend>
                        <div className="mt-1 grid grid-cols-3 gap-2 sm:grid-cols-4">
                            {delCiclo.map((m) => (
                                <label key={m} className={cn('flex min-h-[44px] items-center gap-2 rounded-lg border px-2 text-sm', meses.has(m) ? 'border-amber-500 bg-amber-50' : 'border-gray-200')}>
                                    <input
                                        type="checkbox"
                                        checked={meses.has(m)}
                                        onChange={() =>
                                            setMeses((s) => {
                                                const x = new Set(s);
                                                x.has(m) ? x.delete(m) : x.add(m);
                                                return x;
                                            })
                                        }
                                        className="h-4 w-4 accent-amber-600"
                                    />
                                    {nombreDelMes(m)}
                                </label>
                            ))}
                        </div>
                    </fieldset>
                    <label className="flex min-h-[44px] items-center gap-2 text-sm text-gray-800">
                        <input type="checkbox" checked={cobra} onChange={(e) => setCobra(e.target.checked)} className="h-5 w-5 accent-indigo-600" />
                        En vacaciones se sigue cobrando el sueldo
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="text-sm font-medium text-gray-800">
                            Bono vacacional (opcional)
                            <input type="number" min="0" step="0.01" inputMode="decimal" value={bono} onChange={(e) => setBono(e.target.value)} className={campo} />
                        </label>
                        <label className="text-sm font-medium text-gray-800">
                            Fecha del bono
                            <input type="date" value={fechaBono} onChange={(e) => setFechaBono(e.target.value)} className={campo} />
                            <span className="mt-1 block text-xs text-gray-600">Vacía = el día 1 del primer mes de vacaciones.</span>
                        </label>
                    </div>
                    {problema && (
                        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                            {problema}
                        </p>
                    )}
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="contorno" onClick={alCerrar}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={guardar.isPending}>
                            {guardar.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
                            Guardar para todos
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export default VistaDelPersonal;
