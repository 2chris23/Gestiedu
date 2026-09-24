import {
    Archive,
    CalendarClock,
    ClipboardCheck,
    GraduationCap,
    Landmark,
    type LucideIcon,
    Users,
    WifiOff,
    Calculator,
} from 'lucide-react';

/**
 * LO QUE LE QUITA TRABAJO AL LICEO
 *
 * Cada tarjeta dice un problema de la dirección y lo que hace el sistema con
 * él. Todo está comprobado en el código (ver `docs/nube/portada.md`, «Qué
 * dice la portada y dónde está en el código»): si algo no lo hace el
 * sistema, aquí no se promete.
 */

interface Funcion {
    icono: LucideIcon;
    titulo: string;
    texto: string;
}

const FUNCIONES: Funcion[] = [
    {
        icono: Calculator,
        titulo: 'Notas y promedios sin calculadora',
        texto: 'Cada profesor carga sus notas según el plan de evaluación del lapso. El promedio del alumno, de la sección y del año sale solo, con la escala y la nota mínima de tu liceo: del 1 al 20 y se aprueba con 10, si no dices otra cosa.',
    },
    {
        icono: ClipboardCheck,
        titulo: 'Asistencia en segundos',
        texto: 'A mano, con un toque por alumno; con un QR que los alumnos escanean desde su app y cambia cada 10 segundos; o el profesor escanea el del alumno. Un mismo teléfono no puede marcar a dos alumnos en la misma clase.',
    },
    {
        icono: CalendarClock,
        titulo: 'Horarios sin choques',
        texto: 'Turno de mañana, de tarde o integral, cada sección con su horario. El sistema no deja poner a un profesor en dos salones a la misma hora. Si se suspende una clase, la dirección puede poner otra materia en ese hueco si su profesor está libre.',
    },
    {
        icono: Landmark,
        titulo: 'Mensualidades en orden',
        texto: 'Si tu liceo cobra: cuotas mensuales, quincenales o por lapso, e inscripción. En dólares o en bolívares con la tasa que anota la administración. Se ve quién está al día y quién debe, y un pago no se borra: se anula con su motivo. Si no cobras, el módulo queda apagado.',
    },
    {
        icono: Users,
        titulo: 'Representantes al tanto',
        texto: 'Cada representante entra con su propia cuenta y ve el promedio, la asistencia y el horario de sus representados, con un aviso si bajan de la nota o de la asistencia mínima del liceo. De ningún otro alumno.',
    },
    {
        icono: WifiOff,
        titulo: 'Aunque se vaya la señal',
        texto: 'El teléfono guarda lo último que descargó y lo enseña sin conexión, con un aviso. Guardar sí necesita internet, y lo dice en el momento: nada queda «pendiente de enviar» a escondidas. Se instala como app, sin pasar por una tienda.',
    },
    {
        icono: GraduationCap,
        titulo: 'Cierre de año y promoción',
        texto: 'Al cerrar el año escolar, el sistema propone quién pasa al año siguiente, quién pasa con materias pendientes y quién repite, según las reglas de tu liceo, y la dirección lo confirma. De 1.º a 5.º año, o hasta 6.º en media técnica.',
    },
    {
        icono: Archive,
        titulo: 'Nada se pierde',
        texto: 'Cada liceo tiene su propia base de datos, aparte de los demás. Se hace una copia de todo cada noche, y lo que se borra no desaparece: queda guardado entero en una papelera, con lo que arrastraba.',
    },
];

export function FeaturesSection() {
    return (
        <section id="funciones" aria-labelledby="funciones-titulo" className="scroll-mt-20 bg-white px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
            <div className="mx-auto max-w-6xl">
                <div className="mx-auto max-w-2xl text-center">
                    <p className="text-sm font-semibold text-indigo-700">Qué resuelve</p>
                    <h2 id="funciones-titulo" className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
                        Lo que hoy se hace en papel, en hojas de cálculo y por WhatsApp
                    </h2>
                    <p className="mt-4 text-base leading-7 text-slate-600 sm:text-lg">
                        Un solo sitio para las notas, la asistencia, los horarios y los cobros, con las reglas de tu plantel y no con
                        unas escritas en el código.
                    </p>
                </div>

                <ul className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                    {FUNCIONES.map(({ icono: Icono, titulo, texto }) => (
                        <li key={titulo} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100">
                                <Icono className="h-5 w-5" aria-hidden />
                            </span>
                            <h3 className="mt-4 text-base font-bold text-slate-900">{titulo}</h3>
                            <p className="mt-2 text-sm leading-6 text-slate-600">{texto}</p>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}
