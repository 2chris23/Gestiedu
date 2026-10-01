import Link from 'next/link';
import { BookOpenCheck, ChevronDown, GraduationCap, HeartHandshake, School, UserRound } from 'lucide-react';
import { BotonDelPortal } from './BotonDelPortal';
import { BotonDeContacto } from './BotonDeContacto';

/**
 * EL RESTO DE LA PORTADA, DESPUÉS DE LAS FUNCIONES
 *
 * Todo de servidor: es texto, y así llega pintado en el primer byte. Lo único
 * que necesita el navegador son los botones del portal (`BotonDelPortal`).
 */

// ─── Para quién ────────────────────────────────────────────────────────────

const ROLES = [
    {
        icono: School,
        quien: 'Dirección y administración',
        que: 'Todo el liceo: años, secciones, profesores, horarios, las cifras de cada lapso y, si se activa, los cobros.',
    },
    {
        icono: BookOpenCheck,
        quien: 'Profesores',
        que: 'Sus clases: asistencia, notas, plan de evaluación y observaciones de las secciones que imparten. De ninguna otra.',
    },
    {
        icono: GraduationCap,
        quien: 'Alumnos',
        que: 'Sus notas, su horario y sus actividades. Miran, no cambian nada: ni su propio perfil.',
    },
    {
        icono: HeartHandshake,
        quien: 'Representantes',
        que: 'Lo de sus representados y nada más: promedio, asistencia, horario y, si el liceo cobra, lo pagado y lo pendiente.',
    },
];

export function ParaQuien() {
    return (
        <section id="para-quien" aria-labelledby="para-quien-titulo" className="scroll-mt-20 bg-slate-50 px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
            <div className="mx-auto max-w-6xl">
                <div className="mx-auto max-w-2xl text-center">
                    <p className="text-sm font-semibold text-indigo-700">Para quién</p>
                    <h2 id="para-quien-titulo" className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
                        Cada uno ve lo suyo, y lo comprueba el servidor
                    </h2>
                    <p className="mt-4 text-base leading-7 text-slate-600 sm:text-lg">
                        Cuatro puertas distintas al mismo liceo. Aunque alguien cambie la dirección en el navegador, el sistema no le
                        enseña lo que no es suyo.
                    </p>
                </div>
                <ul className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                    {ROLES.map(({ icono: Icono, quien, que }) => (
                        <li key={quien} className="rounded-2xl border border-slate-200 bg-white p-6">
                            <Icono className="h-6 w-6 text-indigo-700" aria-hidden />
                            <h3 className="mt-3 text-base font-bold text-slate-900">{quien}</h3>
                            <p className="mt-2 text-sm leading-6 text-slate-600">{que}</p>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}

// ─── Hecho para un liceo venezolano ────────────────────────────────────────

const HECHOS = [
    ['Tres lapsos', 'El año en tres lapsos, cada uno con su plan de evaluación y sus pesos.'],
    ['Escala del 1 al 20', 'Con la nota mínima que decida tu liceo; 10 si no dice otra cosa.'],
    ['Mañana, tarde o integral', 'El mismo año dos veces, con otros alumnos y otros profesores, cada turno con sus horas.'],
    ['Hasta 6.º año', 'Media general hasta 5.º, o media técnica hasta 6.º.'],
    ['Por cédula', 'Cada alumno, profesor y representante se encuentra por su cédula.'],
    ['La hora del liceo', 'La pone el servidor con la zona de tu liceo: cambiar la hora del teléfono no mueve nada.'],
];

export function HechoParaVenezuela() {
    return (
        <section aria-labelledby="venezuela-titulo" className="bg-slate-900 px-4 py-20 text-white sm:px-6 sm:py-24 lg:px-8">
            <div className="mx-auto max-w-6xl">
                <div className="mx-auto max-w-2xl text-center">
                    <p className="text-sm font-semibold text-indigo-300">Pensado aquí</p>
                    <h2 id="venezuela-titulo" className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
                        Hecho para cómo funciona un liceo en Venezuela
                    </h2>
                    <p className="mt-4 text-base leading-7 text-slate-300 sm:text-lg">
                        Las reglas del Ministerio vienen puestas de fábrica, y cada liceo las cambia en su configuración si las suyas
                        son otras.
                    </p>
                </div>
                <dl className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-2xl bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
                    {HECHOS.map(([t, d]) => (
                        <div key={t} className="bg-slate-900 p-6">
                            <dt className="text-base font-bold text-white">{t}</dt>
                            <dd className="mt-1.5 text-sm leading-6 text-slate-300">{d}</dd>
                        </div>
                    ))}
                </dl>
            </div>
        </section>
    );
}

// ─── Cómo se empieza ───────────────────────────────────────────────────────

const PASOS = [
    ['Se da de alta tu liceo', 'Con su propia base de datos, aparte de los demás liceos, y su portal: la dirección por la que entra tu gente.'],
    [
        'Se cargan tus datos y tus reglas',
        'Años, secciones, materias, profesores, alumnos y representantes; la escala, la nota mínima, la asistencia mínima y los turnos.',
    ],
    ['Cada quien entra con su cuenta', 'Desde el portal del liceo, en el ordenador, la tableta o el teléfono. En Android, también como app.'],
];

export function ComoSeEmpieza() {
    return (
        <section id="como-empezar" aria-labelledby="empezar-titulo" className="scroll-mt-20 bg-white px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
            <div className="mx-auto max-w-5xl">
                <div className="mx-auto max-w-2xl text-center">
                    <p className="text-sm font-semibold text-indigo-700">Cómo se empieza</p>
                    <h2 id="empezar-titulo" className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
                        Tres pasos, y el primer día ya se pasa asistencia
                    </h2>
                </div>
                <ol className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
                    {PASOS.map(([t, d], i) => (
                        <li key={t} className="relative rounded-2xl border border-slate-200 bg-white p-6">
                            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">
                                {i + 1}
                            </span>
                            <h3 className="mt-4 text-base font-bold text-slate-900">{t}</h3>
                            <p className="mt-2 text-sm leading-6 text-slate-600">{d}</p>
                        </li>
                    ))}
                </ol>
            </div>
        </section>
    );
}

// ─── Preguntas ─────────────────────────────────────────────────────────────

const PREGUNTAS = [
    [
        '¿Sirve si mi liceo usa otra nota mínima u otra escala?',
        'Sí. La escala del 1 al 20 con aprobación en 10 es solo el valor de partida. La nota mínima, la escala, la asistencia mínima, los turnos y las reglas para promover se cambian en la configuración de cada liceo.',
    ],
    [
        '¿Qué pasa si se va el internet o la luz?',
        'Lo último que el teléfono descargó se puede seguir consultando, con un aviso de que es lo de antes. Guardar sí necesita conexión: si no la hay, el sistema lo dice en el momento, en vez de dejar notas «por enviar» que nadie ve.',
    ],
    [
        '¿Hace falta comprar equipos?',
        'No hace falta un equipo especial: se usa desde el navegador de un ordenador, una tableta o un teléfono, y se puede instalar en el teléfono como una app. Para Android hay además una app propia.',
    ],
    [
        'Tenemos turno de mañana y de tarde, ¿funciona?',
        'Sí. Cada sección lleva su turno —mañana, tarde o integral— y su horario usa las horas de ese turno. El sistema no deja poner a un profesor en dos sitios a la vez, aunque dé clase en los dos turnos.',
    ],
    [
        '¿Se pueden cobrar las mensualidades en dólares?',
        'Sí, si el liceo activa el módulo de pagos: se fija la moneda de las cuotas y se aceptan pagos en dólares, en bolívares o en ambos, con la tasa que anota la administración al cobrar. Los liceos que no cobran lo dejan apagado.',
    ],
    [
        '¿Y si alguien borra algo por error?',
        'Nada se borra de verdad: antes de borrar, el sistema guarda una copia completa en una papelera, con todo lo que dependía de ello. Y además se hace una copia de seguridad de cada liceo cada noche.',
    ],
];

export function Preguntas() {
    return (
        <section id="preguntas" aria-labelledby="preguntas-titulo" className="scroll-mt-20 bg-slate-50 px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
            <div className="mx-auto max-w-3xl">
                <div className="text-center">
                    <p className="text-sm font-semibold text-indigo-700">Preguntas</p>
                    <h2 id="preguntas-titulo" className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
                        Lo que suele preguntar un director
                    </h2>
                </div>
                <div className="mt-10 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
                    {PREGUNTAS.map(([p, r]) => (
                        <details key={p} className="group px-5 sm:px-6">
                            <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-4 py-4 text-left text-base font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
                                {p}
                                <ChevronDown
                                    className="h-5 w-5 shrink-0 text-slate-500 transition-transform duration-200 group-open:rotate-180"
                                    aria-hidden
                                />
                            </summary>
                            <p className="pb-5 text-sm leading-6 text-slate-600">{r}</p>
                        </details>
                    ))}
                </div>
            </div>
        </section>
    );
}

// ─── Final y pie ───────────────────────────────────────────────────────────

export function Llamada({ contacto }: { contacto?: string }) {
    return (
        <section className="bg-white px-4 py-20 sm:px-6 lg:px-8">
            <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-700 via-indigo-600 to-blue-700 px-6 py-14 text-center text-white shadow-xl sm:px-14">
                <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-2xl" aria-hidden />
                <div className="relative mx-auto max-w-2xl">
                    <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Tu liceo, al día desde el primer lapso</h2>
                    <p className="mt-4 text-base leading-7 text-indigo-100">
                        {contacto
                            ? 'Escríbenos para verlo funcionando. Si tu liceo ya está en Gestiedu, entra por su portal con tu correo.'
                            : 'Si tu liceo ya está en Gestiedu, entra por su portal con tu correo. Cada liceo tiene el suyo.'}
                    </p>
                    <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                        {contacto && <BotonDeContacto enlace={contacto} variante="claro" className="px-8 text-base" />}
                        <BotonDelPortal variante={contacto ? 'sobre-color' : 'claro'} className="px-8 text-base">
                            Entrar a mi liceo
                        </BotonDelPortal>
                    </div>
                </div>
            </div>
        </section>
    );
}

export function Pie() {
    return (
        <footer className="border-t border-slate-200 bg-white px-4 py-10 sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 md:flex-row md:justify-between">
                <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
                        <GraduationCap className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="text-base font-bold text-slate-900">Gestiedu</span>
                    <span className="text-sm text-slate-600">Gestión escolar para liceos de Venezuela</span>
                </div>
                <nav aria-label="Pie de página" className="flex flex-wrap items-center justify-center gap-x-2 text-sm text-slate-600">
                    <a href="#funciones" className="inline-flex min-h-[44px] items-center px-2 hover:text-indigo-700">
                        Qué resuelve
                    </a>
                    <a href="#preguntas" className="inline-flex min-h-[44px] items-center px-2 hover:text-indigo-700">
                        Preguntas
                    </a>
                    <Link href="/superadmin/login" className="inline-flex min-h-[44px] items-center gap-1.5 px-2 hover:text-indigo-700">
                        <UserRound className="h-4 w-4" aria-hidden />
                        Acceso de la plataforma
                    </Link>
                </nav>
                <p className="text-sm text-slate-600">© {new Date().getFullYear()} Gestiedu</p>
            </div>
        </footer>
    );
}
