'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Calendar, ChevronRight, MoreVertical, Pencil, Plus, Search, Trash2, UsersRound } from 'lucide-react';
import { FilaInterruptor, Grupo } from '@/components/configuracion/ajustes';
import { useSubjects, useCreateSubject, useUpdateSubject, useDeleteSubject } from '@/hooks/useSubjects';
import { useAcademicYears } from '@/hooks/useAcademicYears';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useConfirm } from '@/hooks/useConfirm';
import { CreateSubjectData, UpdateSubjectData, Subject } from '@/services/subjects.service';
import { PaletteColorSelector } from '@/components/ui/PaletteColorSelector';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { ElegirCiclo } from '@/components/subject/ElegirCiclo';
import { CirculoDeMateria } from '@/components/subject/CirculoDeMateria';
import { cn } from '@/lib/utils';
import { useQuienSoy } from '@/hooks/useQuienSoy';
import MateriasDelAlumno from '@/components/subject/MateriasDelAlumno';
import CargandoMaterias from './loading';

export default function MateriasPage() {
    const { yo, cargando } = useQuienSoy();

    if (cargando) {
        return <CargandoMaterias />;
    }

    if (yo?.role === 'STUDENT' || yo?.role === 'TUTOR') {
        return <MateriasDelAlumno />;
    }

    return <AdminMateriasPage />;
}

/**
 * EL CATÁLOGO DE MATERIAS, COMO LOS MOVIMIENTOS
 *
 * Rediseño pedido por Cristian (18-oct-2026), con el estilo de Finanzas y de
 * la sección: sin miga de pan ni explicación arriba; el título con el año en
 * gris, el año y «+» a la derecha; un buscador redondo y cada materia una
 * fila (su color, el nombre, cuántas secciones y profesores). Editar y
 * eliminar van juntos en UN botón que abre su ventana.
 */
function AdminMateriasPage() {
    const router = useRouter();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedYearId, setSelectedYearId] = useState<string>('');
    const [creando, setCreando] = useState(false);
    const [editando, setEditando] = useState<Subject | null>(null);
    const [conOpciones, setConOpciones] = useState<Subject | null>(null);
    const confirmar = useConfirm();

    const { data: academicYears, isLoading: isLoadingYears } = useAcademicYears();
    const debouncedSearch = useDebouncedValue(searchTerm, 300);

    // Predeterminado: ciclo activo
    useEffect(() => {
        if (academicYears && academicYears.length > 0 && !selectedYearId) {
            const active = academicYears.find((y) => y.status === 'ACTIVE');
            setSelectedYearId(active?.id || academicYears[0].id);
        }
    }, [academicYears, selectedYearId]);

    // Un liceo tiene unas veinte materias: todas de una vez (con 20 por página,
    // la 21.ª se iba a una segunda página que nadie veía).
    const { data: subjectsData, isLoading } = useSubjects({
        page: 1,
        limit: 100,
        search: debouncedSearch,
        grade: '',
        academicYearId: selectedYearId || undefined,
    });
    const createMutation = useCreateSubject();
    const updateMutation = useUpdateSubject();
    const deleteMutation = useDeleteSubject();

    const subjects = useMemo(() => subjectsData?.subjects ?? [], [subjectsData]);
    const selectedYear = academicYears?.find((y) => y.id === selectedYearId);
    const selectedCycleName = selectedYear?.name || '';
    const sinCiclos = !isLoadingYears && (!academicYears || academicYears.length === 0);

    const borrar = async (m: Subject) => {
        setConOpciones(null);
        const si = await confirmar({
            title: `¿Eliminar ${m.name}?`,
            description: 'Se lleva sus notas, su plan y sus horarios en todas las secciones (queda una copia en la papelera).',
            confirmLabel: 'Eliminar',
        });
        if (si) await deleteMutation.mutateAsync(m.id);
    };

    if (isLoading && !subjectsData) {
        return <CargandoMaterias />;
    }

    return (
        <div className="space-y-4">
            <header className="flex items-center gap-2">
                <div className="min-w-0 flex-1" data-recorrido="pantalla">
                    <h1 className="truncate text-seccion font-bold text-gray-900 sm:text-pantalla">Materias</h1>
                    <p className="truncate text-xs font-medium text-gray-600 sm:text-sm">
                        {/* El año ya lo dice el selector de al lado. */}
                        {subjects.length} {subjects.length === 1 ? 'materia' : 'materias'}
                    </p>
                </div>
                <div className="flex shrink-0 items-center gap-2" data-recorrido="acciones">
                    <ElegirCiclo ciclos={academicYears ?? []} valor={selectedYearId} alCambiar={setSelectedYearId} />
                    <button
                        type="button"
                        onClick={() => setCreando(true)}
                        aria-label="Nueva Materia"
                        title="Nueva materia"
                        className="flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-full bg-indigo-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 sm:px-4"
                    >
                        <Plus className="h-5 w-5" aria-hidden />
                        <span className="hidden sm:inline">Nueva materia</span>
                    </button>
                </div>
            </header>

            {sinCiclos && (
                <div className="rounded-[24px] bg-white p-6 text-center ring-1 ring-gray-200">
                    <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-700">
                        <Calendar className="h-6 w-6" aria-hidden />
                    </span>
                    <p className="mt-3 font-semibold text-gray-900">Todavía no hay un año escolar</p>
                    <Link
                        href="/dashboard/academico"
                        className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700"
                    >
                        <Plus className="h-4 w-4" aria-hidden /> Crear el año escolar
                    </Link>
                </div>
            )}

            {!sinCiclos && (
                <>
                    <label className="relative block">
                        <span className="sr-only">Buscar materia</span>
                        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" aria-hidden />
                        <input
                            type="search"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Buscar materia"
                            className="!h-11 w-full !rounded-full !border-gray-200 !bg-white pl-11 pr-4 text-sm text-gray-900 placeholder:text-gray-500 focus:!border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                    </label>

                    {subjects.length === 0 ? (
                        <p className="rounded-[24px] bg-white px-4 py-8 text-center text-sm text-gray-600 ring-1 ring-gray-200">
                            {debouncedSearch ? 'Ninguna materia se llama así.' : 'No hay materias todavía.'}
                        </p>
                    ) : (
                        <ul aria-label="Materias" className="divide-y divide-gray-100 overflow-hidden rounded-[24px] bg-white ring-1 ring-gray-200">
                            {subjects.map((m) => {
                                const secciones = m.sectionCount || 0;
                                const profesores = m.teacherCount || 0;
                                return (
                                    <li key={m.id} className="flex items-center">
                                        <Link
                                            href={`/dashboard/materias/${selectedCycleName}/${m.slug}`}
                                            className="flex min-h-[64px] min-w-0 flex-1 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-gray-50"
                                        >
                                            <CirculoDeMateria nombre={m.name} color={m.color} />
                                            <span className="min-w-0 flex-1">
                                                <span className="flex items-center gap-2">
                                                    <span className="truncate text-[15px] font-medium text-gray-900">{m.name}</span>
                                                    {m.evaluacion === 'CUALITATIVA' && (
                                                        <span className="shrink-0 rounded-full bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-800">Apreciación</span>
                                                    )}
                                                </span>
                                                <span className="block truncate text-sm text-gray-600">
                                                    {secciones} {secciones === 1 ? 'sección' : 'secciones'} · {profesores} {profesores === 1 ? 'profesor' : 'profesores'}
                                                </span>
                                            </span>
                                            <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" aria-hidden />
                                        </Link>
                                        <button
                                            type="button"
                                            onClick={() => setConOpciones(m)}
                                            aria-label={`Opciones de ${m.name}`}
                                            className="mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
                                        >
                                            <MoreVertical className="h-5 w-5" aria-hidden />
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </>
            )}

            {/* Editar y eliminar: un botón, una ventana. */}
            {conOpciones && (
                <Sheet open onOpenChange={(v) => !v && setConOpciones(null)}>
                    <SheetContent
                        side="bottom"
                        onOpenAutoFocus={(e) => e.preventDefault()}
                        className="zona-segura-abajo flex max-h-[90dvh] flex-col rounded-t-[28px] bg-gray-50 px-4 pb-4 pt-6 sm:mx-auto sm:max-w-lg"
                    >
                        <div className="flex items-center gap-3 pr-12">
                            <CirculoDeMateria nombre={conOpciones.name} color={conOpciones.color} />
                            <SheetTitle className="truncate text-lg font-bold text-gray-900">{conOpciones.name}</SheetTitle>
                        </div>
                        <SheetDescription className="sr-only">Editar o eliminar la materia</SheetDescription>
                        <ul className="mt-4 divide-y divide-gray-100 overflow-hidden rounded-[22px] bg-white ring-1 ring-gray-200">
                            <li>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setEditando(conOpciones);
                                        setConOpciones(null);
                                    }}
                                    className="flex min-h-[56px] w-full items-center gap-3 px-4 text-left transition-colors hover:bg-gray-50"
                                >
                                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-50 text-indigo-700">
                                        <Pencil className="h-4 w-4" aria-hidden />
                                    </span>
                                    <span className="text-[15px] font-medium text-gray-900">Editar materia</span>
                                </button>
                            </li>
                            <li>
                                <button
                                    type="button"
                                    onClick={() => borrar(conOpciones)}
                                    className="flex min-h-[56px] w-full items-center gap-3 px-4 text-left transition-colors hover:bg-red-50"
                                >
                                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-red-50 text-red-700">
                                        <Trash2 className="h-4 w-4" aria-hidden />
                                    </span>
                                    <span className="text-[15px] font-medium text-red-700">Eliminar materia</span>
                                </button>
                            </li>
                        </ul>
                    </SheetContent>
                </Sheet>
            )}

            {creando && (
                <VentanaDeMateria
                    titulo="Nueva Materia"
                    alCerrar={() => setCreando(false)}
                    alGuardar={async (d) => {
                        const nueva = await createMutation.mutateAsync(d);
                        setCreando(false);
                        // Crear y decir dónde va, en un solo paso.
                        if (nueva?.slug && selectedCycleName) router.push(`/dashboard/materias/${selectedCycleName}/${nueva.slug}?dondeSeDa=1`);
                    }}
                />
            )}

            {editando && (
                <VentanaDeMateria
                    titulo="Editar Materia"
                    inicial={editando}
                    alCerrar={() => setEditando(null)}
                    alGuardar={async (d: UpdateSubjectData) => {
                        await updateMutation.mutateAsync({ id: editando.id, data: d });
                        setEditando(null);
                    }}
                />
            )}
        </div>
    );
}

/**
 * CREAR O EDITAR UNA MATERIA
 *
 * Como el editor de instrumentos: fondo gris claro, cajas blancas, el nombre,
 * el color y cómo se evalúa (dos opciones en una barra, sin explicación
 * larga) y abajo, fijos, «Cancelar» y «Guardar».
 */
function VentanaDeMateria({
    titulo,
    inicial,
    alCerrar,
    alGuardar,
}: {
    titulo: string;
    inicial?: Subject;
    alCerrar: () => void;
    alGuardar: (d: CreateSubjectData) => Promise<void>;
}) {
    const [datos, setDatos] = useState<CreateSubjectData>({
        name: inicial?.name || '',
        color: inicial?.color || '#3B82F6',
        evaluacion: inicial?.evaluacion || 'NUMERICA',
        porGrupos: inicial?.porGrupos ?? false,
    });
    const [guardando, setGuardando] = useState(false);

    const enviar = async (e: React.FormEvent) => {
        e.preventDefault();
        setGuardando(true);
        try {
            await alGuardar(datos);
        } finally {
            setGuardando(false);
        }
    };

    return (
        <Dialog open onOpenChange={(v) => !v && alCerrar()}>
            <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-lg flex-col gap-0 overflow-hidden rounded-[28px] bg-gray-50 p-0 sm:rounded-[28px]">
                <form onSubmit={enviar} className="flex min-h-0 flex-1 flex-col">
                    <DialogHeader className="shrink-0 px-5 pb-3 pr-14 pt-5 text-left">
                        <DialogTitle className="text-lg font-bold text-gray-900">{titulo}</DialogTitle>
                        <DialogDescription className="sr-only">El nombre, el color y cómo se evalúa</DialogDescription>
                    </DialogHeader>
                    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-4">
                        <div>
                            <label htmlFor="subjectName" className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
                                Nombre de la materia
                            </label>
                            <input
                                id="subjectName"
                                type="text"
                                required
                                autoFocus={!inicial}
                                value={datos.name}
                                onChange={(e) => setDatos({ ...datos, name: e.target.value })}
                                placeholder="Ej: Matemáticas"
                                className="mt-2 w-full !min-h-[48px] !rounded-[18px] !border-transparent !bg-white px-4 text-[15px] text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>

                        <div>
                            <span className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-600">Color</span>
                            <div className="mt-2 rounded-[22px] bg-white p-3 ring-1 ring-gray-200">
                                <PaletteColorSelector
                                    id="subjectColor"
                                    selectedColor={datos.color || '#3B82F6'}
                                    onSelectColor={(color) => setDatos({ ...datos, color })}
                                />
                            </div>
                        </div>

                        <div>
                            <span id="como-se-evalua" className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
                                Cómo se evalúa
                            </span>
                            <div className="mt-2 flex rounded-full bg-gray-200/70 p-1" role="radiogroup" aria-labelledby="como-se-evalua">
                                {(
                                    [
                                        ['NUMERICA', 'Con nota (01 a 20)'],
                                        ['CUALITATIVA', 'Con apreciación'],
                                    ] as const
                                ).map(([valor, texto]) => (
                                    <button
                                        key={valor}
                                        type="button"
                                        role="radio"
                                        aria-checked={datos.evaluacion === valor}
                                        // Con nota no hay grupos: los grupos se evalúan con apreciación.
                                        onClick={() => setDatos({ ...datos, evaluacion: valor, porGrupos: valor === 'NUMERICA' ? false : datos.porGrupos })}
                                        className={cn(
                                            'min-h-[44px] min-w-0 flex-1 rounded-full px-2 text-[13px] font-semibold transition-colors',
                                            datos.evaluacion === valor ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
                                        )}
                                    >
                                        {texto}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Los grupos estables: a la misma hora, cada alumno va al grupo que eligió. */}
                        {datos.evaluacion === 'CUALITATIVA' && (
                            <Grupo>
                                <FilaInterruptor
                                    titulo="Los estudiantes eligen grupo"
                                    descripcion="Fútbol, costura, lectura…: cada uno con su profesor"
                                    icono={UsersRound}
                                    checked={Boolean(datos.porGrupos)}
                                    onChange={(v) => setDatos({ ...datos, porGrupos: v })}
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
                            disabled={guardando || !datos.name.trim()}
                            className="min-h-[48px] flex-[2] rounded-full bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
                        >
                            {inicial ? 'Guardar cambios' : 'Crear materia'}
                        </button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
