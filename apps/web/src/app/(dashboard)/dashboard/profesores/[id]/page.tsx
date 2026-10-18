'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import {
    AlertCircle,
    BookOpen,
    CalendarDays,
    ChevronRight,
    Clock,
    FileText,
    LayoutGrid,
    Library,
    MoreHorizontal,
    MoreVertical,
    Plus,
    UserMinus,
    UserRound,
} from 'lucide-react';
import { CabezaDeLaClase, PartesDeLaPantalla } from '@/components/academic/CabezaDeLaClase';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ClasesSinProfesor } from '@/components/profesores/ClasesSinProfesor';
import { AssignSubjectTeacherModal } from '@/components/subject/AssignSubjectTeacherModal';
import { useAcademicYears } from '@/hooks/useAcademicYears';
import { useConfirm } from '@/hooks/useConfirm';
import { BarraDeCarga, colorDeLaCarga, horas, NOMBRE_DEL_ESTADO } from '@/lib/carga-horaria';
import { NOMBRE_DEL_TURNO } from '@/lib/grupos-estables';
import {
    useElProfesor,
    useFijarHorasDelCargo,
    useQuitarProfesorDeLaClase,
    type ClaseDelProfesor,
    type ClaseSinProfesor,
    type FichaDelProfesor,
} from '@/lib/profesores';
import { cn, getApiErrorMessage } from '@/lib/utils';

const NOMBRE_DEL_ANO: Record<number, string> = { 1: 'Primer año', 2: 'Segundo año', 3: 'Tercer año', 4: 'Cuarto año', 5: 'Quinto año' };
const colorDelPromedio = (p: number | null) => (p === null ? 'text-gray-500' : p >= 15 ? 'text-emerald-700' : p < 10 ? 'text-red-600' : 'text-amber-700');
const CAJA = 'divide-y divide-gray-100 overflow-hidden rounded-[24px] bg-white ring-1 ring-gray-200';

/**
 * UN PROFESOR (solo el admin)
 *
 * Sus horas frente a las de su cargo, su promedio (el de sus alumnos) y la
 * asistencia de sus secciones; sus clases por año (cada una abre la clase y
 * su ⋯ cambia los bloques o le quita la clase) y su promedio por materia.
 * Lo suyo (fijar horas, asignar clase, horario, documentos) va en UN botón
 * con su ventana.
 */
export default function FichaDelProfesorPage() {
    const { id } = useParams<{ id: string }>();
    const teacherId = decodeURIComponent(id);
    const { data: f, isLoading, error } = useElProfesor(teacherId);
    const [parte, setParte] = useState<'clases' | 'materias'>('clases');
    const [acciones, setAcciones] = useState(false);
    const [fijando, setFijando] = useState(false);
    const [eligiendoClase, setEligiendoClase] = useState(false);
    const [asignando, setAsignando] = useState<{ classroomId: string; subjectId: string; nombre: string; turno: string; bloques: number | null; actual?: string } | null>(null);
    const [conOpciones, setConOpciones] = useState<ClaseDelProfesor | null>(null);
    const quitar = useQuitarProfesorDeLaClase();
    const confirmar = useConfirm();
    const { data: anos } = useAcademicYears();
    const ciclo = anos?.find((a) => a.status === 'ACTIVE')?.name ?? '';

    const porAno = useMemo(() => {
        const g = new Map<number, ClaseDelProfesor[]>();
        for (const c of f?.clases ?? []) g.set(c.grado, [...(g.get(c.grado) ?? []), c]);
        return [...g.entries()].sort(([a], [b]) => a - b);
    }, [f]);

    if (isLoading) return <EsqueletoDeLaFicha />;
    if (error || !f) {
        return (
            <div className="mx-auto max-w-md rounded-[24px] bg-white p-6 text-center ring-1 ring-gray-200">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
                    <AlertCircle className="h-6 w-6" aria-hidden />
                </span>
                <h1 className="mt-3 text-lg font-bold text-gray-900">Profesor no encontrado</h1>
                <Link href="/dashboard/profesores" className="mt-4 inline-flex min-h-11 items-center rounded-full bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700">
                    Volver a los profesores
                </Link>
            </div>
        );
    }

    // La clase en Académico (la misma dirección que Materias).
    const aLaClase = (c: ClaseDelProfesor) =>
        `/dashboard/academico/${ciclo}/${ciclo && c.seccionSlug.endsWith(`-${ciclo}`) ? c.seccionSlug.slice(0, -(ciclo.length + 1)) : c.seccionSlug}/${c.subjectId}`;
    const color = colorDeLaCarga(f.estado);
    const yo = { id: f.profesor.id, nombre: f.profesor.nombre, avatar: f.profesor.avatar, total: f.horas, cargo: f.cargo, horasDelCargo: f.horasDelCargo, estado: f.estado };

    const quitarLaClase = async (c: ClaseDelProfesor) => {
        setConOpciones(null);
        const si = await confirmar({
            title: `¿Quitarle ${c.materia} de ${c.seccion}?`,
            description: 'La clase queda sin profesor (sus notas y su plan no se tocan).',
            confirmLabel: 'Quitar',
        });
        if (!si) return;
        quitar.mutate(
            { classroomId: c.classroomId, subjectId: c.subjectId },
            { onSuccess: () => toast.success('Clase quitada'), onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo quitar')) }
        );
    };

    return (
        <div className="space-y-5">
            <CabezaDeLaClase
                volverA="/dashboard/profesores"
                rotuloVolver="Volver a los profesores"
                titulo={f.profesor.nombre}
                subtitulo={[f.horasDelCargo ? `${f.horasDelCargo} h de cargo` : 'Sin horas de cargo', f.guiaDe.length ? `Guía de ${f.guiaDe.map((g) => g.nombre).join(', ')}` : null]
                    .filter(Boolean)
                    .join(' · ')}
            >
                <button
                    type="button"
                    onClick={() => setAcciones(true)}
                    aria-label="Opciones del profesor"
                    title="Opciones del profesor"
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-indigo-700 shadow-[0_1px_2px_rgba(13,71,161,0.08)] ring-1 ring-gray-200 transition-colors hover:bg-indigo-50"
                >
                    <MoreHorizontal className="h-5 w-5" aria-hidden />
                </button>
            </CabezaDeLaClase>

            {/* Sus horas, su promedio y su asistencia. */}
            <section aria-label="Sus cifras" className="rounded-[24px] bg-white p-4 ring-1 ring-gray-200">
                <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">Horas a la semana</span>
                    <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', color.fondo)}>{NOMBRE_DEL_ESTADO[f.estado]}</span>
                </div>
                <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">
                    {horas(f.horas)} <span className="text-base font-semibold text-gray-500">/ {f.cargo} h</span>
                </p>
                <BarraDeCarga total={f.horas} cargo={f.cargo} estado={f.estado} className="mt-2 h-2" />
                <p className="mt-1.5 text-sm text-gray-600">
                    {f.bloques} bloques{f.sinHoras > 0 && ` · ${f.sinHoras} sin horas`}
                    {!f.horasDelCargo && ` · el máximo del liceo`}
                </p>
                <dl className="mt-4 grid grid-cols-3 divide-x divide-gray-100 border-t border-gray-100 pt-3">
                    <div className="pr-3">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-gray-600">Promedio</dt>
                        <dd className={cn('mt-0.5 text-xl font-bold tabular-nums', colorDelPromedio(f.promedio))}>{f.promedio !== null ? horas(f.promedio) : '—'}</dd>
                    </div>
                    <div className="px-3">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-gray-600">Asistencia</dt>
                        <dd className="mt-0.5 text-xl font-bold tabular-nums text-gray-900">{f.asistencia !== null ? `${f.asistencia}%` : '—'}</dd>
                    </div>
                    <div className="pl-3">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-gray-600">Clases</dt>
                        <dd className="mt-0.5 text-xl font-bold tabular-nums text-gray-900">{f.clases.length}</dd>
                    </div>
                </dl>
            </section>

            <PartesDeLaPantalla
                etiqueta="Partes del profesor"
                activa={parte}
                alElegir={(p) => setParte(p as typeof parte)}
                partes={[
                    { id: 'clases', nombre: 'Clases', icono: LayoutGrid },
                    { id: 'materias', nombre: 'Materias', rotulo: 'Por materia', icono: Library },
                ]}
            />

            {parte === 'clases' &&
                (f.clases.length === 0 ? (
                    <div className="rounded-[24px] bg-white px-4 py-8 text-center ring-1 ring-gray-200">
                        <p className="text-sm text-gray-600">Todavía no tiene clases este año.</p>
                        <button
                            type="button"
                            onClick={() => setEligiendoClase(true)}
                            className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700"
                        >
                            <Plus className="h-4 w-4" aria-hidden /> Asignar clase
                        </button>
                    </div>
                ) : (
                    porAno.map(([ano, clases]) => (
                        <section key={ano} aria-label={NOMBRE_DEL_ANO[ano] ?? `${ano}.º año`} className="space-y-2">
                            <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-600">{NOMBRE_DEL_ANO[ano] ?? `${ano}.º año`}</h2>
                            <ul className={CAJA}>
                                {clases.map((c) => (
                                    <li key={c.claseId} className="flex items-center">
                                        <Link href={aLaClase(c)} className="flex min-h-[64px] min-w-0 flex-1 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-gray-50">
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-[15px] font-medium text-gray-900">
                                                    {c.materia} · {c.seccion}
                                                </span>
                                                <span className="block truncate text-sm text-gray-600">
                                                    {c.horas !== null ? `${horas(c.horas)} h/sem` : 'Sin horas'}
                                                    {c.turno !== 'MANANA' && ` · ${NOMBRE_DEL_TURNO[c.turno] ?? c.turno}`}
                                                    {c.asistencia !== null && ` · ${c.asistencia}% asist.`}
                                                </span>
                                            </span>
                                            <span className={cn('shrink-0 text-[15px] font-bold tabular-nums', colorDelPromedio(c.promedio))}>{c.promedio !== null ? horas(c.promedio) : '—'}</span>
                                        </Link>
                                        <button
                                            type="button"
                                            onClick={() => setConOpciones(c)}
                                            aria-label={`Opciones de ${c.materia} en ${c.seccion}`}
                                            className="mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
                                        >
                                            <MoreVertical className="h-5 w-5" aria-hidden />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ))
                ))}

            {parte === 'materias' && (
                <ul className={CAJA} aria-label="Por materia">
                    {f.porMateria.length === 0 ? (
                        <li className="px-4 py-8 text-center text-sm text-gray-600">Todavía no tiene clases este año.</li>
                    ) : (
                        f.porMateria.map((m) => (
                            <li key={m.subjectId} className="flex min-h-[64px] items-center gap-3 px-4 py-2.5">
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[15px] font-medium text-gray-900">{m.materia}</span>
                                    <span className="block truncate text-sm text-gray-600">
                                        {m.secciones} {m.secciones === 1 ? 'sección' : 'secciones'} · {horas(m.horas)} h/sem
                                    </span>
                                </span>
                                <span className={cn('shrink-0 text-[15px] font-bold tabular-nums', colorDelPromedio(m.promedio))}>{m.promedio !== null ? horas(m.promedio) : '—'}</span>
                            </li>
                        ))
                    )}
                </ul>
            )}

            {/* Lo suyo: un botón, una ventana. */}
            {acciones && (
                <HojaDeAcciones
                    f={f}
                    alCerrar={() => setAcciones(false)}
                    alFijar={() => {
                        setAcciones(false);
                        setFijando(true);
                    }}
                    alAsignar={() => {
                        setAcciones(false);
                        setEligiendoClase(true);
                    }}
                />
            )}

            {conOpciones && (
                <Sheet open onOpenChange={(v) => !v && setConOpciones(null)}>
                    <SheetContent
                        side="bottom"
                        onOpenAutoFocus={(e) => e.preventDefault()}
                        className="zona-segura-abajo rounded-t-[28px] bg-gray-50 px-4 pb-4 pt-6 sm:mx-auto sm:max-w-lg"
                    >
                        <SheetTitle className="pr-12 text-lg font-bold text-gray-900">
                            {conOpciones.materia} · {conOpciones.seccion}
                        </SheetTitle>
                        <SheetDescription className="sr-only">Opciones de la clase</SheetDescription>
                        <ul className={cn('mt-4', CAJA)}>
                            <FilaDeAccion
                                icono={Clock}
                                titulo="Cambiar bloques"
                                detalle={conOpciones.bloques ? `Ahora ${conOpciones.bloques} a la semana` : 'Sin bloques'}
                                onClick={() => {
                                    const c = conOpciones;
                                    setConOpciones(null);
                                    setAsignando({ classroomId: c.classroomId, subjectId: c.subjectId, nombre: `${c.materia} · ${c.seccion}`, turno: c.turno, bloques: c.bloques, actual: f.profesor.id });
                                }}
                            />
                            <FilaDeAccion icono={UserMinus} titulo="Quitarle la clase" detalle="Queda sin profesor" peligro onClick={() => quitarLaClase(conOpciones)} />
                        </ul>
                    </SheetContent>
                </Sheet>
            )}

            {eligiendoClase && (
                <ClasesSinProfesor
                    titulo="Asignar clase"
                    descripcion={`Las clases sin profesor, para ${f.profesor.nombre}`}
                    alCerrar={() => setEligiendoClase(false)}
                    alElegir={(c: ClaseSinProfesor) => {
                        setEligiendoClase(false);
                        setAsignando({ classroomId: c.classroomId, subjectId: c.subjectId, nombre: `${c.materia} · ${c.seccion}`, turno: c.turno, bloques: c.bloques });
                    }}
                />
            )}

            {asignando && (
                <AssignSubjectTeacherModal
                    sectionId={asignando.classroomId}
                    sectionName={asignando.nombre}
                    subjectSlug={asignando.subjectId}
                    currentTeacherId={asignando.actual}
                    initialWeeklyBlocks={asignando.bloques ?? undefined}
                    turno={asignando.turno}
                    soloEste={yo}
                    onClose={() => setAsignando(null)}
                />
            )}

            {fijando && <FijarHoras f={f} alCerrar={() => setFijando(false)} />}
        </div>
    );
}

function FilaDeAccion({
    icono: Icono,
    titulo,
    detalle,
    onClick,
    href,
    peligro,
}: {
    icono: typeof Clock;
    titulo: string;
    detalle: string;
    onClick?: () => void;
    href?: string;
    peligro?: boolean;
}) {
    const dentro = (
        <>
            <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', peligro ? 'bg-red-50 text-red-700' : 'bg-indigo-50 text-indigo-700')}>
                <Icono className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
                <span className={cn('block text-[15px] font-medium', peligro ? 'text-red-700' : 'text-gray-900')}>{titulo}</span>
                <span className="block text-sm text-gray-600">{detalle}</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" aria-hidden />
        </>
    );
    const clase = 'flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-gray-50';
    return <li>{href ? <Link href={href} className={clase}>{dentro}</Link> : <button type="button" onClick={onClick} className={clase}>{dentro}</button>}</li>;
}

function HojaDeAcciones({ f, alCerrar, alFijar, alAsignar }: { f: FichaDelProfesor; alCerrar: () => void; alFijar: () => void; alAsignar: () => void }) {
    const id = encodeURIComponent(f.profesor.id);
    return (
        <Sheet open onOpenChange={(v) => !v && alCerrar()}>
            <SheetContent
                side="bottom"
                onOpenAutoFocus={(e) => e.preventDefault()}
                className="zona-segura-abajo flex max-h-[90dvh] flex-col rounded-t-[28px] bg-gray-50 px-4 pb-4 pt-6 sm:mx-auto sm:max-w-lg"
            >
                <SheetTitle className="pr-12 text-lg font-bold text-gray-900">{f.profesor.nombre}</SheetTitle>
                <SheetDescription className="sr-only">Lo que se puede hacer con este profesor</SheetDescription>
                <ul className={cn('mt-4 min-h-0 overflow-y-auto', CAJA)}>
                    <FilaDeAccion icono={Clock} titulo="Horas de su cargo" detalle={f.horasDelCargo ? `${f.horasDelCargo} h a la semana` : 'Las del liceo'} onClick={alFijar} />
                    <FilaDeAccion icono={Plus} titulo="Asignar clase" detalle="Una de las que no tienen profesor" onClick={alAsignar} />
                    <FilaDeAccion icono={CalendarDays} titulo="Su horario" detalle="Verlo y editarlo" href={`/dashboard/horarios/profesor/${id}`} />
                    <FilaDeAccion icono={FileText} titulo="Carga horaria" detalle="Para imprimir" href={`/dashboard/carga-horaria/${id}`} />
                    <FilaDeAccion icono={BookOpen} titulo="Constancia de trabajo" detalle="Para imprimir" href={`/dashboard/constancia-de-trabajo/${id}`} />
                    <FilaDeAccion icono={UserRound} titulo="Su ficha" detalle="Datos personales y cuenta" href={`/dashboard/usuarios/${id}`} />
                </ul>
            </SheetContent>
        </Sheet>
    );
}

const COMUNES = [12, 18, 24, 30, 36, 40];

/** Las horas de su cargo: las comunes de un toque, otra a mano, o las del liceo. */
function FijarHoras({ f, alCerrar }: { f: FichaDelProfesor; alCerrar: () => void }) {
    const [valor, setValor] = useState(f.horasDelCargo ? String(f.horasDelCargo) : '');
    const fijar = useFijarHorasDelCargo();
    const n = Number(valor);
    const valido = valor === '' || (Number.isInteger(n) && n >= 1 && n <= 80);
    const guardar = () =>
        fijar.mutate(
            { id: f.profesor.id, horas: valor === '' ? null : n },
            {
                onSuccess: () => {
                    toast.success('Horas guardadas');
                    alCerrar();
                },
                onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudieron guardar')),
            }
        );
    return (
        <Dialog open onOpenChange={(v) => !v && alCerrar()}>
            <DialogContent className="max-w-sm gap-0 rounded-[28px] bg-gray-50 p-0 sm:rounded-[28px]">
                <DialogHeader className="px-5 pb-3 pr-14 pt-5 text-left">
                    <DialogTitle className="text-lg font-bold text-gray-900">Horas de su cargo</DialogTitle>
                    <DialogDescription className="text-sm text-gray-600">Vacío: las del liceo ({f.reglas.maximo} h)</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 px-5 pb-5">
                    <div className="flex flex-wrap gap-2" role="group" aria-label="Horas comunes">
                        {COMUNES.map((h) => (
                            <button
                                key={h}
                                type="button"
                                aria-pressed={valor === String(h)}
                                onClick={() => setValor(String(h))}
                                className={cn(
                                    'min-h-11 min-w-[56px] rounded-full px-4 text-sm font-semibold transition-colors',
                                    valor === String(h) ? 'bg-indigo-600 text-white' : 'bg-white text-gray-900 ring-1 ring-gray-200 hover:bg-indigo-50'
                                )}
                            >
                                {h}
                            </button>
                        ))}
                    </div>
                    <label className="block">
                        <span className="text-sm font-medium text-gray-700">Horas a la semana</span>
                        <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={80}
                            value={valor}
                            onChange={(e) => setValor(e.target.value)}
                            placeholder={`${f.reglas.maximo} (las del liceo)`}
                            aria-invalid={!valido}
                            className="mt-1 !h-12 w-full !rounded-[16px] !border-0 !bg-white px-4 text-[15px] !ring-1 !ring-gray-200 focus:!ring-2 focus:!ring-indigo-500"
                        />
                        {!valido && <span className="mt-1 block text-sm text-red-700">De 1 a 80 horas, sin decimales.</span>}
                    </label>
                    <div className="flex gap-3">
                        {f.horasDelCargo !== null && (
                            <button
                                type="button"
                                onClick={() => setValor('')}
                                className="min-h-[48px] flex-1 rounded-full bg-white px-4 text-sm font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-100"
                            >
                                Las del liceo
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={guardar}
                            disabled={!valido || fijar.isPending}
                            className="min-h-[48px] flex-[2] rounded-full bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                        >
                            Guardar
                        </button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function EsqueletoDeLaFicha() {
    return (
        <div className="space-y-5" aria-busy="true" aria-label="Cargando el profesor">
            <div className="h-12 w-64 rounded-full bg-gray-200/70" />
            <div className="h-44 rounded-[24px] bg-white ring-1 ring-gray-200" />
            <div className="h-20 w-56 rounded-[20px] bg-gray-200/70" />
            <div className="h-64 rounded-[24px] bg-white ring-1 ring-gray-200" />
        </div>
    );
}
