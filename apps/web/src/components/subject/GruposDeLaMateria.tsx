'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Check, ChevronRight, MoreVertical, Pencil, Plus, Search, Trash2, UserPlus, UsersRound } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Fila, FilaInterruptor, Grupo, Opciones } from '@/components/configuracion/ajustes';
import UserAvatar from '@/components/ui/UserAvatar';
import { VerMas } from '@/components/pagos/listas-de-finanzas';
import { useConfirm } from '@/hooks/useConfirm';
import { useTeachers } from '@/hooks/useTeachers';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { cn, getApiErrorMessage } from '@/lib/utils';
import {
    AREAS_DE_GRUPO,
    NOMBRE_DEL_TURNO,
    nombreDelArea,
    useAsignarAlGrupo,
    useGruposDeLaMateria,
    useGuardarGrupo,
    useGuardarReglasDeGrupos,
    useQuitarGrupo,
    useSinGrupo,
    type DatosDelGrupo,
    type GrupoDeLaMateria,
} from '@/lib/grupos-estables';

/**
 * LOS GRUPOS ESTABLES DE UNA MATERIA, PARA EL ADMIN
 *
 * Dos pestañas de la materia «por grupos» (Materias → la materia): los
 * **Grupos** (cada uno una fila: su nombre, el profesor y el turno, y cuántos
 * van de su cupo; tocarlo lo edita) con la elección del liceo arriba (una vez
 * al año o en cada lapso, y abierta o no), y **Sin grupo**: por sección, quién
 * no tiene uno aceptado, con «Asignar». Pedido por Cristian (18-oct-2026).
 */

const CAJA = 'divide-y divide-gray-100 overflow-hidden rounded-[24px] bg-white ring-1 ring-gray-200';
const ROTULO = 'px-1 text-xs font-semibold uppercase tracking-wide text-gray-600';

export function PestanaDeGrupos({ subjectId, academicYearId }: { subjectId: string; academicYearId: string }) {
    const { data, isLoading } = useGruposDeLaMateria(subjectId, academicYearId);
    const guardarReglas = useGuardarReglasDeGrupos();
    const quitar = useQuitarGrupo();
    const confirmar = useConfirm();
    const [editando, setEditando] = React.useState<GrupoDeLaMateria | 'nuevo' | null>(null);
    const [opciones, setOpciones] = React.useState<GrupoDeLaMateria | null>(null);

    if (isLoading || !data) return <div className="h-40 animate-pulse rounded-[24px] bg-white ring-1 ring-gray-200" aria-label="Cargando los grupos" />;

    const reglas = data.reglas;
    const cambiarReglas = (r: Partial<typeof reglas>) =>
        guardarReglas.mutate({ ...reglas, ...r }, { onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo guardar')) });

    return (
        <div className="space-y-5">
            <Grupo titulo="La elección">
                <Fila etiqueta="Eligen grupo" apilada>
                    <Opciones
                        etiqueta="Cada cuánto eligen grupo"
                        valor={reglas.eleccion}
                        alCambiar={(v) => cambiarReglas({ eleccion: v })}
                        opciones={[
                            { valor: 'ANUAL', texto: 'Una vez al año' },
                            { valor: 'POR_LAPSO', texto: 'En cada lapso' },
                        ]}
                    />
                </Fila>
                <FilaInterruptor
                    titulo="Abierta"
                    descripcion={reglas.abierta ? 'Los estudiantes pueden pedir grupo' : 'Nadie puede pedir grupo ahora'}
                    checked={reglas.abierta}
                    onChange={(v) => cambiarReglas({ abierta: v })}
                    comoInterruptor
                />
            </Grupo>

            <section aria-label="Grupos">
                <div className="flex items-center justify-between">
                    <h2 className={ROTULO}>
                        {data.grupos.length} {data.grupos.length === 1 ? 'grupo' : 'grupos'}
                    </h2>
                    <button
                        type="button"
                        onClick={() => setEditando('nuevo')}
                        className="flex min-h-11 items-center gap-1.5 rounded-full bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
                    >
                        <Plus className="h-4 w-4" aria-hidden /> Nuevo grupo
                    </button>
                </div>
                {data.grupos.length === 0 ? (
                    <p className="mt-2 rounded-[24px] bg-white px-4 py-8 text-center text-sm text-gray-600 ring-1 ring-gray-200">
                        Todavía no hay grupos. Crea el primero: fútbol, coro, lectura…
                    </p>
                ) : (
                    <ul className={cn('mt-2', CAJA)}>
                        {data.grupos.map((g) => {
                            const lleno = g.aceptados >= g.cupo;
                            const detalle = [g.profesor?.nombre ?? 'Sin profesor', g.turno ? NOMBRE_DEL_TURNO[g.turno] : null, nombreDelArea(g.area)]
                                .filter(Boolean)
                                .join(' · ');
                            return (
                                <li key={g.id} className="flex items-center">
                                    <button
                                        type="button"
                                        onClick={() => setEditando(g)}
                                        className="flex min-h-[64px] min-w-0 flex-1 items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-gray-50"
                                    >
                                        <span
                                            className={cn(
                                                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                                                g.activo ? 'bg-indigo-50 text-indigo-700' : 'bg-gray-100 text-gray-500'
                                            )}
                                        >
                                            <UsersRound className="h-5 w-5" aria-hidden />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="flex items-center gap-2">
                                                <span className="truncate text-[15px] font-medium text-gray-900">{g.nombre}</span>
                                                {!g.activo && <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">Cerrado</span>}
                                            </span>
                                            <span className={cn('block truncate text-sm', g.profesor ? 'text-gray-600' : 'font-medium text-amber-800')}>{detalle}</span>
                                        </span>
                                        <span className="shrink-0 text-right">
                                            <span className={cn('block text-[15px] font-bold tabular-nums', lleno ? 'text-red-600' : 'text-gray-900')}>
                                                {g.aceptados}/{g.cupo}
                                            </span>
                                            {g.pendientes > 0 && <span className="block text-xs font-semibold text-indigo-700">{g.pendientes} por decidir</span>}
                                        </span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setOpciones(g)}
                                        aria-label={`Opciones de ${g.nombre}`}
                                        className="mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
                                    >
                                        <MoreVertical className="h-5 w-5" aria-hidden />
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>

            {opciones && (
                <Sheet open onOpenChange={(v) => !v && setOpciones(null)}>
                    <SheetContent
                        side="bottom"
                        onOpenAutoFocus={(e) => e.preventDefault()}
                        className="zona-segura-abajo flex max-h-[90dvh] flex-col rounded-t-[28px] bg-gray-50 px-4 pb-4 pt-6 sm:mx-auto sm:max-w-lg"
                    >
                        <SheetTitle className="pr-12 text-lg font-bold text-gray-900">{opciones.nombre}</SheetTitle>
                        <SheetDescription className="sr-only">Editar o quitar el grupo</SheetDescription>
                        <ul className={cn('mt-4', CAJA)}>
                            <li>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setEditando(opciones);
                                        setOpciones(null);
                                    }}
                                    className="flex min-h-[56px] w-full items-center gap-3 px-4 text-left transition-colors hover:bg-gray-50"
                                >
                                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-50 text-indigo-700">
                                        <Pencil className="h-4 w-4" aria-hidden />
                                    </span>
                                    <span className="text-[15px] font-medium text-gray-900">Editar grupo</span>
                                </button>
                            </li>
                            <li>
                                <button
                                    type="button"
                                    onClick={async () => {
                                        const g = opciones;
                                        setOpciones(null);
                                        const si = await confirmar({
                                            title: `¿Quitar ${g.nombre}?`,
                                            description: 'Sus solicitudes y su asistencia se van con él (queda una copia en la papelera).',
                                            confirmLabel: 'Quitar',
                                        });
                                        if (si) quitar.mutate(g.id, { onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo quitar')) });
                                    }}
                                    className="flex min-h-[56px] w-full items-center gap-3 px-4 text-left transition-colors hover:bg-red-50"
                                >
                                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-red-50 text-red-700">
                                        <Trash2 className="h-4 w-4" aria-hidden />
                                    </span>
                                    <span className="text-[15px] font-medium text-red-700">Quitar grupo</span>
                                </button>
                            </li>
                        </ul>
                    </SheetContent>
                </Sheet>
            )}

            {editando && (
                <VentanaDeGrupo
                    subjectId={subjectId}
                    academicYearId={academicYearId}
                    inicial={editando === 'nuevo' ? undefined : editando}
                    alCerrar={() => setEditando(null)}
                />
            )}
        </div>
    );
}

/** Crear o editar un grupo: como la ventana de la materia. */
function VentanaDeGrupo({
    subjectId,
    academicYearId,
    inicial,
    alCerrar,
}: {
    subjectId: string;
    academicYearId: string;
    inicial?: GrupoDeLaMateria;
    alCerrar: () => void;
}) {
    const guardar = useGuardarGrupo(subjectId, academicYearId);
    const [datos, setDatos] = React.useState<DatosDelGrupo>({
        nombre: inicial?.nombre ?? '',
        descripcion: inicial?.descripcion ?? '',
        area: inicial?.area ?? null,
        profesorId: inicial?.profesor?.id ?? null,
        cupo: inicial?.cupo ?? 30,
        turno: inicial?.turno ?? null,
        activo: inicial?.activo ?? true,
    });
    const [profesor, setProfesor] = React.useState<{ id: string; nombre: string } | null>(inicial?.profesor ?? null);
    const [eligiendoProfesor, setEligiendoProfesor] = React.useState(false);
    const campo =
        'w-full !min-h-[48px] !rounded-[18px] !border-transparent !bg-white px-4 text-[15px] text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-indigo-500';

    const enviar = (e: React.FormEvent) => {
        e.preventDefault();
        guardar.mutate(
            { ...datos, id: inicial?.id, descripcion: datos.descripcion || null },
            {
                onSuccess: () => {
                    toast.success(inicial ? 'Grupo guardado' : 'Grupo creado');
                    alCerrar();
                },
                onError: (err) => toast.error(getApiErrorMessage(err, 'No se pudo guardar el grupo')),
            }
        );
    };

    return (
        <Dialog open onOpenChange={(v) => !v && alCerrar()}>
            <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-lg flex-col gap-0 overflow-hidden rounded-[28px] bg-gray-50 p-0 sm:rounded-[28px]">
                <form onSubmit={enviar} className="flex min-h-0 flex-1 flex-col">
                    <DialogHeader className="shrink-0 px-5 pb-3 pr-14 pt-5 text-left">
                        <DialogTitle className="text-lg font-bold text-gray-900">{inicial ? 'Editar grupo' : 'Nuevo grupo'}</DialogTitle>
                        <DialogDescription className="sr-only">El nombre, el profesor, el cupo y el turno del grupo</DialogDescription>
                    </DialogHeader>
                    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-4">
                        <div>
                            <label htmlFor="nombreDelGrupo" className={ROTULO}>
                                Nombre del grupo
                            </label>
                            <input
                                id="nombreDelGrupo"
                                required
                                maxLength={80}
                                autoFocus={!inicial}
                                value={datos.nombre}
                                onChange={(e) => setDatos({ ...datos, nombre: e.target.value })}
                                placeholder="Ej: Fútbol"
                                className={cn('mt-2', campo)}
                            />
                        </div>

                        <div>
                            <span className={ROTULO}>Profesor</span>
                            <button
                                type="button"
                                onClick={() => setEligiendoProfesor(true)}
                                className="mt-2 flex min-h-[56px] w-full items-center gap-3 rounded-[18px] bg-white px-4 text-left ring-1 ring-gray-200 transition-colors hover:bg-gray-50"
                            >
                                {profesor ? (
                                    <UserAvatar name={profesor.nombre} className="h-9 w-9 shrink-0" initialsClassName="text-xs" />
                                ) : (
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500">
                                        <UserPlus className="h-4 w-4" aria-hidden />
                                    </span>
                                )}
                                <span className={cn('min-w-0 flex-1 truncate text-[15px]', profesor ? 'text-gray-900' : 'text-gray-500')}>
                                    {profesor?.nombre ?? 'Elegir profesor'}
                                </span>
                                <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" aria-hidden />
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label htmlFor="cupoDelGrupo" className={ROTULO}>
                                    Cupo
                                </label>
                                <input
                                    id="cupoDelGrupo"
                                    type="number"
                                    inputMode="numeric"
                                    min={1}
                                    max={500}
                                    required
                                    value={datos.cupo}
                                    onChange={(e) => setDatos({ ...datos, cupo: Number(e.target.value) })}
                                    className={cn('mt-2 tabular-nums', campo)}
                                />
                            </div>
                            <div>
                                <span className={ROTULO}>Turno</span>
                                <select
                                    aria-label="Turno del grupo"
                                    value={datos.turno ?? ''}
                                    onChange={(e) => setDatos({ ...datos, turno: e.target.value || null })}
                                    className={cn('mt-2', campo)}
                                >
                                    <option value="">Cualquiera</option>
                                    <option value="MANANA">Mañana</option>
                                    <option value="TARDE">Tarde</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <span className={ROTULO}>Área</span>
                            <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Área del grupo">
                                {AREAS_DE_GRUPO.map((a) => {
                                    const esta = datos.area === a.id;
                                    return (
                                        <button
                                            key={a.id}
                                            type="button"
                                            role="radio"
                                            aria-checked={esta}
                                            onClick={() => setDatos({ ...datos, area: esta ? null : a.id })}
                                            className={cn(
                                                'min-h-[48px] rounded-[18px] px-3 py-2 text-left text-sm font-medium leading-tight transition-colors',
                                                esta ? 'bg-indigo-600 text-white' : 'bg-white text-gray-900 ring-1 ring-gray-200 hover:bg-indigo-50'
                                            )}
                                        >
                                            {a.nombre}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div>
                            <label htmlFor="descripcionDelGrupo" className={ROTULO}>
                                Qué hacen (opcional)
                            </label>
                            <textarea
                                id="descripcionDelGrupo"
                                rows={2}
                                maxLength={500}
                                value={datos.descripcion ?? ''}
                                onChange={(e) => setDatos({ ...datos, descripcion: e.target.value })}
                                className="mt-2 w-full !rounded-[18px] !border-transparent !bg-white px-4 py-3 text-[15px] text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>

                        {inicial && (
                            <Grupo>
                                <FilaInterruptor
                                    titulo="Recibe estudiantes"
                                    descripcion="Cerrado, no se ofrece a quien elige"
                                    checked={Boolean(datos.activo)}
                                    onChange={(v) => setDatos({ ...datos, activo: v })}
                                    comoInterruptor
                                />
                            </Grupo>
                        )}
                    </div>
                    <div className="zona-segura-abajo flex shrink-0 gap-2 border-t border-gray-200 bg-white px-4 py-3">
                        <button
                            type="button"
                            onClick={alCerrar}
                            className="min-h-[48px] flex-1 rounded-full bg-gray-100 px-4 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-200"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={guardar.isPending || !datos.nombre.trim()}
                            className="min-h-[48px] flex-[2] rounded-full bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
                        >
                            {inicial ? 'Guardar grupo' : 'Crear grupo'}
                        </button>
                    </div>
                </form>
                {eligiendoProfesor && (
                    <ElegirProfesor
                        actual={profesor?.id ?? null}
                        alCerrar={() => setEligiendoProfesor(false)}
                        alElegir={(p) => {
                            setProfesor(p);
                            setDatos((d) => ({ ...d, profesorId: p?.id ?? null }));
                            setEligiendoProfesor(false);
                        }}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}

/** El profesor del grupo: una hoja con buscador. */
function ElegirProfesor({
    actual,
    alCerrar,
    alElegir,
}: {
    actual: string | null;
    alCerrar: () => void;
    alElegir: (p: { id: string; nombre: string } | null) => void;
}) {
    const [buscar, setBuscar] = React.useState('');
    const buscado = useDebouncedValue(buscar, 300);
    const { data, isLoading } = useTeachers(buscado || undefined);
    const profes: any[] = Array.isArray(data) ? data : [];
    return (
        <Sheet open onOpenChange={(v) => !v && alCerrar()}>
            <SheetContent
                side="bottom"
                onOpenAutoFocus={(e) => e.preventDefault()}
                className="zona-segura-abajo flex max-h-[85dvh] flex-col rounded-t-[28px] bg-gray-50 px-4 pb-4 pt-6 sm:mx-auto sm:max-w-lg"
            >
                <SheetTitle className="pr-12 text-lg font-bold text-gray-900">Profesor del grupo</SheetTitle>
                <SheetDescription className="sr-only">Busca y elige al profesor que lleva el grupo</SheetDescription>
                <label className="relative mt-4 block">
                    <span className="sr-only">Buscar profesor</span>
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" aria-hidden />
                    <input
                        type="search"
                        value={buscar}
                        onChange={(e) => setBuscar(e.target.value)}
                        placeholder="Buscar profesor"
                        className="!h-11 w-full !rounded-full !border-gray-200 !bg-white pl-11 pr-4 text-sm text-gray-900 placeholder:text-gray-500 focus:!border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                </label>
                <ul className={cn('mt-3 min-h-0 flex-1 overflow-y-auto', CAJA)}>
                    {actual && (
                        <li>
                            <button type="button" onClick={() => alElegir(null)} className="flex min-h-[56px] w-full items-center px-4 text-left text-[15px] text-red-700 hover:bg-red-50">
                                Sin profesor
                            </button>
                        </li>
                    )}
                    {isLoading && <li className="px-4 py-6 text-center text-sm text-gray-600">Buscando…</li>}
                    {!isLoading && profes.length === 0 && <li className="px-4 py-6 text-center text-sm text-gray-600">Ningún profesor se llama así.</li>}
                    {profes.map((p) => {
                        const nombre = `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim();
                        return (
                            <li key={p.id}>
                                <button
                                    type="button"
                                    onClick={() => alElegir({ id: p.id, nombre })}
                                    className="flex min-h-[56px] w-full items-center gap-3 px-4 text-left transition-colors hover:bg-gray-50"
                                >
                                    <UserAvatar name={nombre} src={p.avatar} className="h-9 w-9 shrink-0" initialsClassName="text-xs" />
                                    <span className="min-w-0 flex-1 truncate text-[15px] text-gray-900">{nombre}</span>
                                    {p.id === actual && <Check className="h-5 w-5 shrink-0 text-indigo-700" aria-hidden />}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </SheetContent>
        </Sheet>
    );
}

/** Quién no tiene grupo, por sección, con «Asignar». */
export function PestanaSinGrupo({ subjectId, academicYearId }: { subjectId: string; academicYearId: string }) {
    const { data, isLoading } = useSinGrupo(subjectId, academicYearId);
    const { data: grupos } = useGruposDeLaMateria(subjectId, academicYearId);
    const asignar = useAsignarAlGrupo();
    const [asignando, setAsignando] = React.useState<{ id: string; nombre: string; turno: string } | null>(null);
    const [seccionAbierta, setSeccionAbierta] = React.useState<string | null>(null);

    if (isLoading || !data) return <div className="h-40 animate-pulse rounded-[24px] bg-white ring-1 ring-gray-200" aria-label="Cargando quién está sin grupo" />;

    if (data.total === 0) {
        return (
            <p className="rounded-[24px] bg-white px-4 py-8 text-center text-sm text-gray-600 ring-1 ring-gray-200">
                Todos los estudiantes tienen grupo.
            </p>
        );
    }

    // Los grupos donde cabe: activos, con cupo y de su turno (la sección integral, cualquiera).
    const dondeCabe = (turno: string) =>
        (grupos?.grupos ?? []).filter((g) => g.activo && g.aceptados < g.cupo && (!g.turno || g.turno === turno || turno === 'INTEGRAL'));

    return (
        <div className="space-y-4">
            <p className={ROTULO}>
                {data.total} {data.total === 1 ? 'estudiante sin grupo' : 'estudiantes sin grupo'}
            </p>
            {/* Nunca más de 20 filas de golpe: cada sección es una fila que se abre, y dentro, de 20 en 20. */}
            {data.secciones.map((s) => {
                const abierta = seccionAbierta === s.seccion.id;
                return (
                <section key={s.seccion.id} aria-label={s.seccion.nombre} className={CAJA}>
                    <button
                        type="button"
                        aria-expanded={abierta}
                        onClick={() => setSeccionAbierta(abierta ? null : s.seccion.id)}
                        className="flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-gray-50"
                    >
                        <span className="min-w-0 flex-1">
                            <span className="block text-[15px] font-medium text-gray-900">{s.seccion.nombre}</span>
                            <span className="block text-sm text-gray-600">
                                {s.alumnos.length} sin grupo
                                {s.alumnos.some((a) => a.pendienteEn) && ` · ${s.alumnos.filter((a) => a.pendienteEn).length} pidieron`}
                            </span>
                        </span>
                        <ChevronRight className={cn('h-5 w-5 shrink-0 text-gray-500 transition-transform', abierta && 'rotate-90')} aria-hidden />
                    </button>
                    {abierta && (
                    <div className="border-t border-gray-100">
                    <VerMas cosas={s.alumnos} etiqueta={`Sin grupo en ${s.seccion.nombre}`}>
                        {(a) => (
                            <li key={a.id} className="flex min-h-[64px] items-center gap-3 px-4 py-2.5">
                                <UserAvatar name={a.nombre} src={a.avatar} className="h-10 w-10 shrink-0" initialsClassName="text-xs" />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[15px] font-medium text-gray-900">{a.nombre}</span>
                                    <span className="block truncate text-sm text-gray-600">{a.pendienteEn ? `Pidió ${a.pendienteEn}` : 'No ha pedido'}</span>
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setAsignando({ id: a.id, nombre: a.nombre, turno: s.seccion.turno })}
                                    className="flex min-h-11 shrink-0 items-center rounded-full bg-indigo-50 px-4 text-sm font-semibold text-indigo-700 transition-colors hover:bg-indigo-100"
                                >
                                    Asignar
                                </button>
                            </li>
                        )}
                    </VerMas>
                    </div>
                    )}
                </section>
                );
            })}

            {asignando && (
                <Sheet open onOpenChange={(v) => !v && setAsignando(null)}>
                    <SheetContent
                        side="bottom"
                        onOpenAutoFocus={(e) => e.preventDefault()}
                        className="zona-segura-abajo flex max-h-[85dvh] flex-col rounded-t-[28px] bg-gray-50 px-4 pb-4 pt-6 sm:mx-auto sm:max-w-lg"
                    >
                        <SheetTitle className="pr-12 text-lg font-bold text-gray-900">Asignar a {asignando.nombre}</SheetTitle>
                        <SheetDescription className="text-sm text-gray-600">Los grupos de su turno con cupo</SheetDescription>
                        {dondeCabe(asignando.turno).length === 0 ? (
                            <p className="mt-4 rounded-[22px] bg-white px-4 py-6 text-center text-sm text-gray-600 ring-1 ring-gray-200">
                                No queda cupo en ningún grupo de su turno.
                            </p>
                        ) : (
                            <ul className={cn('mt-4 min-h-0 flex-1 overflow-y-auto', CAJA)}>
                                {dondeCabe(asignando.turno).map((g) => (
                                    <li key={g.id}>
                                        <button
                                            type="button"
                                            disabled={asignar.isPending}
                                            onClick={() =>
                                                asignar.mutate(
                                                    { grupoId: g.id, studentId: asignando.id },
                                                    {
                                                        onSuccess: () => {
                                                            toast.success(`${asignando.nombre}: ${g.nombre}`);
                                                            setAsignando(null);
                                                        },
                                                        onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo asignar')),
                                                    }
                                                )
                                            }
                                            className="flex min-h-[60px] w-full items-center gap-3 px-4 text-left transition-colors hover:bg-gray-50 disabled:opacity-60"
                                        >
                                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-700">
                                                <UsersRound className="h-4 w-4" aria-hidden />
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-[15px] font-medium text-gray-900">{g.nombre}</span>
                                                <span className="block truncate text-sm text-gray-600">{g.profesor?.nombre ?? 'Sin profesor'}</span>
                                            </span>
                                            <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-700">
                                                {g.cupo - g.aceptados} libres
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </SheetContent>
                </Sheet>
            )}
        </div>
    );
}

/**
 * Las tres cifras de la materia por grupos. Con apreciación no hay promedio
 * sobre 20 que enseñar: cuántos grupos, cuántos estudiantes siguen sin uno y
 * en cuántas secciones está.
 */
export function CifrasDeLosGrupos({ subjectId, academicYearId, secciones }: { subjectId: string; academicYearId: string; secciones: number }) {
    const { data: grupos } = useGruposDeLaMateria(subjectId, academicYearId);
    const { data: sinGrupo } = useSinGrupo(subjectId, academicYearId);
    const cifras: Array<[string, React.ReactNode]> = [
        ['Grupos', grupos ? grupos.grupos.length : '—'],
        ['Sin grupo', sinGrupo ? sinGrupo.total : '—'],
        ['Secciones', secciones],
    ];
    return (
        <dl className="grid grid-cols-3 divide-x divide-gray-100 rounded-[24px] bg-white py-4 ring-1 ring-gray-200">
            {cifras.map(([rotulo, valor]) => (
                <div key={rotulo} className="px-4">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-gray-600">{rotulo}</dt>
                    <dd className="mt-0.5 text-2xl font-bold tabular-nums text-gray-900">{valor}</dd>
                </div>
            ))}
        </dl>
    );
}
