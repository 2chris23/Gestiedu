'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { CalendarDays, ChevronRight, Loader2, Plus, Save, Search, UserPlus, Users } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { VerMas } from '@/components/pagos/listas-de-finanzas';
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
    useGuardarAreas,
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


export function VistaDelPersonal({ ciclo }: { ciclo: string | null }) {
    const { data, isLoading } = usePersonal(true, ciclo);
    const [abierta, setAbierta] = React.useState<string | null>(null);
    const [ajustando, setAjustando] = React.useState(false);
    const [poniendo, setPoniendo] = React.useState(false);
    const [busqueda, setBusqueda] = React.useState('');
    const [areaVista, setAreaVista] = React.useState('Profesor');

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
    const areas = data.areas?.length ? data.areas : ['Profesor'];
    const laArea = areas.find((a) => a === areaVista) ?? areas[0];

    const vacaciones = n.mesesDeVacaciones.length ? n.mesesDeVacaciones.map((m) => nombreDelMes(m).split(' ')[0].toLowerCase()).join(', ') : 'sin vacaciones';

    return (
        // Como Rial (2026-10-14): lo de todos y quién no tiene sueldo son dos
        // filas, no dos cajas; la lista va por áreas y de 20 en 20.
        <div className="space-y-6">
            {data.traidos.traidos > 0 && (
                <p className="rounded-2xl bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
                    {data.traidos.traidos} {data.traidos.traidos === 1 ? 'persona traída' : 'personas traídas'} del ciclo {data.traidos.desde}.
                </p>
            )}

            <ul className="divide-y divide-gray-100 overflow-hidden rounded-[24px] bg-white ring-1 ring-gray-200">
                <li>
                    <button
                        type="button"
                        onClick={() => setAjustando(true)}
                        disabled={data.closed}
                        aria-label="Cambiar para todos"
                        className="flex min-h-[64px] w-full items-center gap-4 px-4 py-3 text-left active:bg-gray-50 disabled:cursor-default"
                    >
                        <CalendarDays className="h-6 w-6 shrink-0 text-gray-700" aria-hidden />
                        <span className="min-w-0 flex-1">
                            <span className="block text-[15px] text-gray-900">{n.diaDePago >= 31 ? 'Se paga el último día' : `Se paga el día ${n.diaDePago}`}</span>
                            <span className="block text-sm text-gray-600">
                                Vacaciones: {vacaciones}
                                {Number(n.bonoVacacional) > 0 ? ` · bono ${fmt(n.bonoVacacional)}` : ''}
                            </span>
                        </span>
                        {!data.closed && <ChevronRight className="h-5 w-5 shrink-0 text-gray-500" aria-hidden />}
                    </button>
                </li>
                {!data.closed && sinSueldo.length > 0 && (
                    <li>
                        <button type="button" onClick={() => setPoniendo(true)} className="flex min-h-[64px] w-full items-center gap-4 px-4 py-3 text-left active:bg-gray-50">
                            <Users className="h-6 w-6 shrink-0 text-amber-700" aria-hidden />
                            <span className="min-w-0 flex-1 text-[15px] text-gray-900">{sinSueldo.length} sin sueldo</span>
                            <span className="shrink-0 rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Poner sueldo</span>
                        </button>
                    </li>
                )}
            </ul>

            <section aria-labelledby="titulo-personal" className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 id="titulo-personal" className="text-lg font-bold text-gray-900">
                        Personal <span className="font-normal text-gray-500">{data.personas.filter((p) => p.activo).length}</span>
                    </h2>
                    {!data.closed && <CrearArea areas={areas} alCrear={setAreaVista} />}
                </div>
                <label className="flex min-h-[48px] items-center gap-3 rounded-full bg-white px-4 ring-1 ring-gray-200 focus-within:ring-2 focus-within:ring-indigo-500">
                    <Search className="h-5 w-5 shrink-0 text-gray-500" aria-hidden />
                    <input
                        type="search"
                        aria-label="Buscar en el personal"
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        placeholder="Buscar por nombre, área o cédula"
                        className="min-h-[44px] min-w-0 flex-1 bg-transparent text-[15px] text-gray-900 outline-none placeholder:text-gray-500"
                    />
                </label>
                {texto ? (
                    <div className="overflow-hidden rounded-[24px] bg-white ring-1 ring-gray-200">
                        <VerMas cosas={visibles} etiqueta="Personal encontrado" vacio={`Nadie coincide con «${busqueda}».`}>
                            {(p) => <FilaDePersona key={p.id} persona={p} fmt={fmt} conArea alAbrir={() => setAbierta(p.id)} />}
                        </VerMas>
                    </div>
                ) : (
                    // Por área: Profesores siempre (salen solos de sus cuentas) y las
                    // que crea el admin, en un carril de píldoras.
                    <>
                        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0" role="group" aria-label="Áreas del personal">
                            {areas.map((a) => {
                                const cuantas = data.personas.filter((p) => p.activo && delArea(p, a)).length;
                                return (
                                    <button
                                        key={a}
                                        type="button"
                                        aria-pressed={a === laArea}
                                        onClick={() => setAreaVista(a)}
                                        className={cn(
                                            'min-h-[44px] shrink-0 rounded-full px-4 text-sm font-medium',
                                            a === laArea ? 'bg-indigo-600 text-white' : 'bg-white text-gray-800 ring-1 ring-gray-200'
                                        )}
                                    >
                                        {nombreDelArea(a)} ({cuantas})
                                    </button>
                                );
                            })}
                        </div>
                        <AreaDelPersonal
                            key={laArea}
                            area={laArea}
                            areas={areas}
                            personas={data.personas.filter((p) => delArea(p, laArea))}
                            cerrado={data.closed}
                            fmt={fmt}
                            alAbrir={setAbierta}
                        />
                    </>
                )}
            </section>

            {abierta && <DialogoDePersona id={abierta} ciclo={ciclo} alCerrar={() => setAbierta(null)} />}
            {ajustando && <AjustesDeNomina lista={data} ciclo={ciclo} alCerrar={() => setAjustando(false)} />}
            {poniendo && <PonerSueldo personas={sinSueldo} ciclo={ciclo} moneda={data.currency} alCerrar={() => setPoniendo(false)} />}
        </div>
    );
}

/** Una persona, como una fila de Rial: el sueldo debajo y, si se le debe, a la derecha en rojo. */
function FilaDePersona({ persona: p, fmt, conArea, alAbrir }: { persona: PersonaDelPersonal; fmt: (n: string | number) => string; conArea?: boolean; alAbrir: () => void }) {
    const a = p.acuerdo;
    const r = p.resumen;
    const atrasado = r && Number(r.vencido) > 0;
    const detalle = [conArea ? nombreDelArea(p.cargo) : null, a ? `${fmt(a.monto)} ${FRECUENCIA[a.frecuencia].toLowerCase()}` : null, !p.activo ? 'ya no trabaja aquí' : null]
        .filter(Boolean)
        .join(' · ');
    return (
        <li>
            <button type="button" onClick={alAbrir} className={cn('flex min-h-[60px] w-full items-center gap-3 px-4 py-2 text-left active:bg-gray-100', !p.activo && 'opacity-60')}>
                <UserAvatar name={p.nombre} className="h-9 w-9" initialsClassName="text-xs" />
                <span className="min-w-0 flex-1">
                    <span className="block break-words text-[15px] text-gray-900">{p.nombre}</span>
                    {detalle ? <span className="block text-sm text-gray-600">{detalle}</span> : <span className="block text-sm font-medium text-amber-800">Sin sueldo</span>}
                </span>
                {atrasado && <span className="shrink-0 text-sm font-semibold tabular-nums text-red-700">{fmt(r!.vencido)}</span>}
            </button>
        </li>
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

/** «Poner sueldo»: una hoja con el monto grande, cada cuánto y a quiénes (todos marcados). */
function PonerSueldo({ personas, ciclo, moneda, alCerrar }: { personas: PersonaDelPersonal[]; ciclo: string | null; moneda: string; alCerrar: () => void }) {
    const aplicar = useAplicarATodos(ciclo);
    const [elegidas, setElegidas] = React.useState<Set<string>>(() => new Set(personas.map((p) => p.id)));
    const [monto, setMonto] = React.useState('');
    const [frecuencia, setFrecuencia] = React.useState<FrecuenciaDelPersonal>('MENSUAL');
    const enviar = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const r = await aplicar.mutateAsync({ monto, frecuencia, personalIds: [...elegidas] });
            toast.success(`Sueldo puesto a ${r.aplicados} ${r.aplicados === 1 ? 'persona' : 'personas'}`);
            alCerrar();
        } catch (err) {
            toast.error(errorDe(err, 'No se pudo aplicar'));
        }
    };
    const todas = elegidas.size === personas.length;
    return (
        <Sheet open onOpenChange={(v) => !v && alCerrar()}>
            <SheetContent side="bottom" onOpenAutoFocus={(e) => e.preventDefault()} className="zona-segura-abajo flex max-h-[90dvh] flex-col rounded-t-[28px] bg-gray-50 px-4 pb-4 pt-6 sm:mx-auto sm:max-w-lg">
                <SheetTitle className="pr-12 text-lg font-bold text-gray-900">Poner sueldo</SheetTitle>
                <SheetDescription className="sr-only">El mismo sueldo para las personas marcadas</SheetDescription>
                <form onSubmit={enviar} className="mt-4 flex min-h-0 flex-1 flex-col gap-4">
                    <label className="flex flex-col items-center">
                        <span className="sr-only">Cuánto ({moneda === 'USD' ? '$' : 'Bs'})</span>
                        <span className="flex items-baseline gap-1 text-4xl font-bold text-gray-900">
                            <span className="text-gray-400">{moneda === 'USD' ? '$' : 'Bs'}</span>
                            <input
                                required
                                type="number"
                                min="0.01"
                                step="0.01"
                                inputMode="decimal"
                                value={monto}
                                onChange={(e) => setMonto(e.target.value)}
                                placeholder="0,00"
                                style={{ width: `${Math.max(4, monto.length + 0.5)}ch` }}
                                className="!border-0 !bg-transparent !p-0 text-left text-4xl font-bold tabular-nums text-gray-900 outline-none placeholder:text-gray-300"
                            />
                        </span>
                    </label>
                    <div className="mx-auto flex rounded-full bg-gray-200/70 p-1" role="radiogroup" aria-label="Cada cuánto">
                        {(['MENSUAL', 'QUINCENAL'] as FrecuenciaDelPersonal[]).map((f) => (
                            <button
                                key={f}
                                type="button"
                                role="radio"
                                aria-checked={frecuencia === f}
                                onClick={() => setFrecuencia(f)}
                                className={cn('min-h-[44px] rounded-full px-5 text-sm', frecuencia === f ? 'bg-white font-semibold text-gray-900 shadow-sm' : 'text-gray-700')}
                            >
                                {FRECUENCIA[f]}
                            </button>
                        ))}
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[22px] bg-white ring-1 ring-gray-200">
                        <button
                            type="button"
                            onClick={() => setElegidas(todas ? new Set() : new Set(personas.map((p) => p.id)))}
                            className="flex min-h-[48px] items-center justify-between border-b border-gray-100 px-4 text-sm"
                        >
                            <span className="font-semibold text-gray-900">{elegidas.size} de {personas.length}</span>
                            <span className="font-semibold text-indigo-700">{todas ? 'Quitar todas' : 'Marcar todas'}</span>
                        </button>
                        <ul className="min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto">
                            {personas.map((p) => (
                                <li key={p.id}>
                                    <label className="flex min-h-[52px] items-center gap-3 px-4 text-[15px] text-gray-900">
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
                                            className="h-5 w-5 accent-indigo-600"
                                        />
                                        {p.nombre}
                                    </label>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <Button type="submit" disabled={aplicar.isPending || !monto || elegidas.size === 0} className="min-h-[52px] rounded-full text-base">
                        {aplicar.isPending && <Loader2 className="animate-spin" aria-hidden />}
                        Ponerles este sueldo ({elegidas.size})
                    </Button>
                </form>
            </SheetContent>
        </Sheet>
    );
}

const nombreDelArea = (a: string) => (a === 'Profesor' ? 'Profesores' : a);
const delArea = (p: PersonaDelPersonal, area: string) => p.cargo.trim().toLowerCase() === area.toLowerCase();

/**
 * UN ÁREA DEL PERSONAL (2026-10-14). Cristian: «crea un área como cocina, y
 * añadir personal: se le coloca un nombre y listo». El área de cada persona es
 * su cargo; los profesores salen solos de sus cuentas.
 */
function AreaDelPersonal({
    area,
    areas,
    personas,
    cerrado,
    fmt,
    alAbrir,
}: {
    area: string;
    areas: string[];
    personas: PersonaDelPersonal[];
    cerrado: boolean;
    fmt: (n: string | number) => string;
    alAbrir: (id: string) => void;
}) {
    const crear = useCrearPersona();
    const guardarAreas = useGuardarAreas();
    const [anadiendo, setAnadiendo] = React.useState(false);
    const [nombre, setNombre] = React.useState('');
    const esDeProfesores = area === 'Profesor';
    const activas = personas.filter((p) => p.activo).length;
    const anadir = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const r = await crear.mutateAsync({ nombre: nombre.trim(), cargo: area, cedula: null, seQuedaParaProximosCiclos: true });
            toast.success(`${nombre.trim()} agregado a ${nombreDelArea(area)}: ahora ponle su sueldo`);
            setNombre('');
            setAnadiendo(false);
            alAbrir(r.persona.id);
        } catch (err) {
            toast.error(errorDe(err, 'No se pudo agregar'));
        }
    };
    const quitar = async () => {
        try {
            await guardarAreas.mutateAsync(areas.filter((a) => a !== 'Profesor' && a !== area));
            toast.success(`Área «${area}» quitada`);
        } catch (err) {
            toast.error(errorDe(err, 'No se pudo quitar'));
        }
    };
    return (
        <section aria-label={nombreDelArea(area)} className="overflow-hidden rounded-[24px] bg-white ring-1 ring-gray-200">
            {!cerrado && !esDeProfesores && (
                <div className="flex flex-wrap items-center justify-end gap-2 border-b border-gray-100 px-3 py-2">
                    {personas.length === 0 && (
                        <Button variant="contorno" onClick={quitar} disabled={guardarAreas.isPending}>
                            Quitar área
                        </Button>
                    )}
                    <Button onClick={() => setAnadiendo((v) => !v)} aria-expanded={anadiendo}>
                        <UserPlus aria-hidden />
                        Añadir persona
                    </Button>
                </div>
            )}
            {anadiendo && (
                <form onSubmit={anadir} className="flex flex-wrap items-center gap-2 border-b border-gray-100 p-3">
                    <label className="sr-only" htmlFor={`nombre-${area}`}>
                        Nombre y apellido
                    </label>
                    <input
                        id={`nombre-${area}`}
                        autoFocus
                        required
                        minLength={3}
                        maxLength={120}
                        value={nombre}
                        onChange={(e) => setNombre(e.target.value)}
                        placeholder="Nombre y apellido"
                        className="min-h-[44px] min-w-0 flex-1 rounded-full bg-gray-100 px-4 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <Button type="submit" disabled={crear.isPending || nombre.trim().length < 3}>
                        {crear.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
                        Agregar
                    </Button>
                </form>
            )}
            <VerMas cosas={personas} etiqueta={`${nombreDelArea(area)}: ${activas}`} vacio="Nadie todavía.">
                {(p) => <FilaDePersona key={p.id} persona={p} fmt={fmt} alAbrir={() => alAbrir(p.id)} />}
            </VerMas>
        </section>
    );
}

/** «Crear área»: un nombre (Cocina, Limpieza…) y ya sale para añadirle gente. */
function CrearArea({ areas, alCrear }: { areas: string[]; alCrear: (area: string) => void }) {
    const guardar = useGuardarAreas();
    const [abierto, setAbierto] = React.useState(false);
    const [nombre, setNombre] = React.useState('');
    const crear = async (e: React.FormEvent) => {
        e.preventDefault();
        const nueva = nombre.trim();
        if (areas.some((a) => a.toLowerCase() === nueva.toLowerCase())) {
            toast.error(`Ya existe el área «${nueva}»`);
            return;
        }
        try {
            await guardar.mutateAsync([...areas.filter((a) => a !== 'Profesor'), nueva]);
            toast.success(`Área «${nueva}» creada: añádele su personal`);
            alCrear(nueva);
            setNombre('');
            setAbierto(false);
        } catch (err) {
            toast.error(errorDe(err, 'No se pudo crear el área'));
        }
    };
    if (!abierto) {
        return (
            <Button variant="contorno" onClick={() => setAbierto(true)}>
                <Plus aria-hidden />
                Crear área
            </Button>
        );
    }
    return (
        <form onSubmit={crear} className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <label className="sr-only" htmlFor="nombre-del-area">
                Nombre del área
            </label>
            <input
                id="nombre-del-area"
                autoFocus
                required
                minLength={2}
                maxLength={40}
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej.: Cocina"
                className="min-h-[44px] min-w-0 flex-1 rounded-lg border border-gray-300 px-3 text-sm text-gray-900 outline-none focus:border-indigo-500"
            />
            <Button type="submit" disabled={guardar.isPending || nombre.trim().length < 2}>
                Crear
            </Button>
            <Button type="button" variant="contorno" onClick={() => setAbierto(false)}>
                Cancelar
            </Button>
        </form>
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
