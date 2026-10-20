import * as React from 'react';
import {
    ArrowDown,
    ArrowUp,
    Loader2,
    Search,
    X,
} from 'lucide-react';
import {
    usePersonal,
} from '@/hooks/useFinanzas';
import { useResumenDePagos } from '@/hooks/usePagos';
import { cn } from '@/lib/utils';

const ANOS = ['1er Año', '2do Año', '3er Año', '4to Año', '5to Año', '6to Año'];

const primerNombre = (nombre: string, apellido: string) => `${nombre.split(' ')[0]} ${apellido.split(' ')[0]}`;

const nombreDelArea = (a: string) => (a === 'Profesor' ? 'Profesores' : a);

export function IconoDelTipo({ entra }: { entra: boolean }) {
    return (
        <span className={cn('flex h-6 w-6 items-center justify-center rounded-full text-white', entra ? 'bg-emerald-600' : 'bg-red-600')}>
            {entra ? <ArrowUp className="h-4 w-4" aria-hidden /> : <ArrowDown className="h-4 w-4" aria-hidden />}
        </span>
    );
}

export function Tecla({ children, alPulsar, etiqueta, className }: { children: React.ReactNode; alPulsar: () => void; etiqueta?: string; className?: string }) {
    return (
        <button
            type="button"
            onClick={alPulsar}
            aria-label={etiqueta}
            className={cn('flex h-14 items-center justify-center rounded-2xl bg-white text-xl font-medium text-gray-900 shadow-sm ring-1 ring-gray-200 active:scale-95', className)}
        >
            {children}
        </button>
    );
}

/** Lo elegido (el estudiante o la persona), con su botón para cambiarlo. */
export function Elegido({ titulo, detalle, alCambiar }: { titulo: string; detalle: string; alCambiar: () => void }) {
    return (
        <div className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-gray-200">
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-gray-900">{titulo}</span>
                <span className="block truncate text-xs text-gray-600">{detalle}</span>
            </span>
            <button type="button" onClick={alCambiar} className="flex min-h-[44px] items-center gap-1 rounded-full px-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50">
                <X className="h-4 w-4" aria-hidden />
                Cambiar
            </button>
        </div>
    );
}

function Buscador({ valor, alCambiar, rotulo }: { valor: string; alCambiar: (v: string) => void; rotulo: string }) {
    return (
        <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden />
            <input
                type="search"
                aria-label={rotulo}
                value={valor}
                onChange={(e) => alCambiar(e.target.value)}
                placeholder={rotulo}
                className="min-h-[44px] w-full rounded-full bg-white py-2 pl-9 pr-3 text-sm text-gray-900 shadow-sm outline-none ring-1 ring-gray-200 focus:ring-2 focus:ring-indigo-300"
            />
        </div>
    );
}

function Pastilla({ activa, alPulsar, children }: { activa: boolean; alPulsar: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            aria-pressed={activa}
            onClick={alPulsar}
            className={cn(
                'min-h-[44px] shrink-0 rounded-full px-4 text-sm font-medium',
                activa ? 'bg-indigo-600 text-white' : 'bg-white text-gray-800 shadow-sm ring-1 ring-gray-200'
            )}
        >
            {children}
        </button>
    );
}

/**
 * EL ESTUDIANTE: año → sección → la tabla con su nombre, su mensualidad y lo
 * que lleva pagado. Con el buscador se salta los pasos.
 */
export function ElegirEstudiante({
    ciclo,
    fmt,
    alElegir,
}: {
    ciclo: string | null;
    fmt: (n: string | number) => string;
    alElegir: (e: { id: string; nombre: string; seccion: string }) => void;
}) {
    const { data, isLoading } = useResumenDePagos(true, ciclo);
    const [grado, setGrado] = React.useState<number | null>(null);
    const [seccionId, setSeccionId] = React.useState<string | null>(null);
    const [busqueda, setBusqueda] = React.useState('');

    if (isLoading || !data) {
        return (
            <div className="flex justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-600" aria-label="Cargando los estudiantes" />
            </div>
        );
    }
    const grados = [...new Set(data.classrooms.map((c) => c.grade))].sort((a, b) => a - b);
    const elGrado = grado ?? grados[0] ?? null;
    const secciones = data.classrooms.filter((c) => c.grade === elGrado).sort((a, b) => a.name.localeCompare(b.name, 'es'));
    const laSeccion = secciones.find((s) => s.id === seccionId) ?? null;
    const texto = busqueda.trim().toLowerCase();
    const filas = texto
        ? data.classrooms
              .flatMap((c) => c.students.map((a) => ({ a, seccion: c.name })))
              .filter(({ a }) => `${a.firstName} ${a.lastName} ${a.id}`.toLowerCase().includes(texto))
              .slice(0, 60)
        : laSeccion
          ? laSeccion.students.map((a) => ({ a, seccion: laSeccion.name }))
          : [];

    return (
        <div className="space-y-3">
            <Buscador valor={busqueda} alCambiar={setBusqueda} rotulo="Buscar estudiante o cédula" />
            {!texto && (
                <>
                    <div className="flex flex-wrap gap-2" aria-label="Año">
                        {grados.map((g) => (
                            <Pastilla
                                key={g}
                                activa={g === elGrado}
                                alPulsar={() => {
                                    setGrado(g);
                                    setSeccionId(null);
                                }}
                            >
                                {ANOS[g - 1] ?? `${g}º`}
                            </Pastilla>
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-2" aria-label="Sección">
                        {secciones.map((s) => (
                            <Pastilla key={s.id} activa={s.id === laSeccion?.id} alPulsar={() => setSeccionId(s.id)}>
                                {s.section ? `Sección ${s.section}` : s.name}
                            </Pastilla>
                        ))}
                    </div>
                    {!laSeccion && <p className="text-sm text-gray-600">Elige la sección para ver a sus estudiantes.</p>}
                </>
            )}
            {(texto || laSeccion) && (
                <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
                    <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-gray-100 px-3 py-2 text-xs font-semibold text-gray-600" aria-hidden>
                        <span>Estudiante</span>
                        <span className="w-20 text-right">Mensualidad</span>
                        <span className="w-20 text-right">Pagado</span>
                    </div>
                    {filas.length === 0 ? (
                        <p className="px-3 py-6 text-center text-sm text-gray-600">{texto ? `Nadie coincide con «${busqueda}».` : 'Sin estudiantes en esta sección.'}</p>
                    ) : (
                        <ul className="divide-y divide-gray-100" aria-label="Estudiantes">
                            {filas.map(({ a, seccion }) => {
                                const nombre = primerNombre(a.firstName, a.lastName);
                                return (
                                    <li key={a.id}>
                                        <button
                                            type="button"
                                            onClick={() => alElegir({ id: a.id, nombre, seccion })}
                                            className="grid min-h-[48px] w-full grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-2 text-left text-sm hover:bg-gray-50"
                                        >
                                            <span className="min-w-0">
                                                <span className="block truncate font-medium text-gray-900">{nombre}</span>
                                                {texto && <span className="block truncate text-xs text-gray-600">{seccion}</span>}
                                            </span>
                                            <span className="w-20 text-right tabular-nums text-gray-800">{a.mensualidad ? fmt(a.mensualidad) : '—'}</span>
                                            <span className={cn('w-20 text-right tabular-nums', a.state === 'DEBE' ? 'text-red-700' : 'text-emerald-700')}>{fmt(a.paid)}</span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}

/** LA PERSONA: por área (Profesores siempre, y las que crea el admin), con buscador. */
export function ElegirPersona({ ciclo, fmt, alElegir }: { ciclo: string | null; fmt: (n: string | number) => string; alElegir: (p: { id: string; nombre: string }) => void }) {
    const { data, isLoading } = usePersonal(true, ciclo);
    const [area, setArea] = React.useState('Profesor');
    const [busqueda, setBusqueda] = React.useState('');
    if (isLoading || !data) {
        return (
            <div className="flex justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-600" aria-label="Cargando el personal" />
            </div>
        );
    }
    const texto = busqueda.trim().toLowerCase();
    const activas = data.personas.filter((p) => p.activo);
    const filas = texto
        ? activas.filter((p) => `${p.nombre} ${p.cargo} ${p.cedula ?? ''}`.toLowerCase().includes(texto))
        : activas.filter((p) => p.cargo.trim().toLowerCase() === area.toLowerCase());
    return (
        <div className="space-y-3">
            <Buscador valor={busqueda} alCambiar={setBusqueda} rotulo="Buscar en el personal" />
            {!texto && (
                <div className="flex flex-wrap gap-2" aria-label="Área">
                    {(data.areas ?? ['Profesor']).map((a) => (
                        <Pastilla key={a} activa={a === area} alPulsar={() => setArea(a)}>
                            {nombreDelArea(a)}
                        </Pastilla>
                    ))}
                </div>
            )}
            <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
                {filas.length === 0 ? (
                    <p className="px-3 py-6 text-center text-sm text-gray-600">
                        {texto ? `Nadie coincide con «${busqueda}».` : `Nadie en ${nombreDelArea(area)}: se agrega en Finanzas → Personal.`}
                    </p>
                ) : (
                    <ul className="divide-y divide-gray-100" aria-label="Personal">
                        {filas.map((p) => (
                            <li key={p.id}>
                                <button
                                    type="button"
                                    onClick={() => alElegir({ id: p.id, nombre: p.nombre })}
                                    className="flex min-h-[48px] w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-gray-50"
                                >
                                    <span className="min-w-0 flex-1 truncate font-medium text-gray-900">{p.nombre}</span>
                                    <span className={cn('shrink-0 text-xs', p.resumen && Number(p.resumen.pendiente) > 0 ? 'text-gray-800' : 'text-gray-600')}>
                                        {!p.resumen ? 'Sin sueldo' : Number(p.resumen.pendiente) > 0 ? `Se le debe ${fmt(p.resumen.pendiente)}` : 'Al día'}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
