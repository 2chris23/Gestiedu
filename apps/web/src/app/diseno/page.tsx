'use client';

import * as React from 'react';
import {
    Users,
    CalendarCheck,
    TriangleAlert,
    GraduationCap,
    Sun,
    Moon,
    Smartphone,
    Monitor,
    Clock,
    ArrowRight,
} from 'lucide-react';
import { Bento, Pieza, Tarjeta, Cifra, Pastilla, Mosaico, Baldosa, type Tono } from '@/components/ui/bento';
import { BotonIcono, ProveedorDeGlobos } from '@/components/ui/boton-icono';
import { MorphIcon } from 'morphicons/react';
import {
    CalendarCheck2 as DatoAsistencia,
    PenLine as DatoNotas,
    CalendarDays as DatoHorario,
    MessageSquarePlus as DatoObservacion,
    Pencil as DatoEditar,
    Trash2 as DatoBorrar,
    Eye as DatoVer,
    EyeOff as DatoNoVer,
    Download as DatoBajar,
    Printer as DatoImprimir,
} from 'lucide';
import { Carril } from '@/components/ui/carril';
import { TablaAdaptable } from '@/components/ui/tabla-adaptable';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * EL IDIOMA DE GESTIEDU, EN UNA PANTALLA
 *
 * No es una pantalla del sistema: es el muestrario. Sirve para dos cosas, y las
 * dos importan más de lo que parece:
 *
 *   1. **Decidir el diseño mirándolo**, no imaginándolo. Un color en un archivo
 *      de configuración no se puede juzgar; la misma tarjeta en claro y en
 *      oscuro, sí.
 *
 *   2. **Que no se invente cada pantalla por su cuenta.** Cuando alguien tenga
 *      que hacer una pantalla nueva, la copia de aquí. Sin esto, en seis meses
 *      hay cuatro tipos de tarjeta y tres azules distintos.
 *
 * Se abre en `/diseno`.
 */

const ALUMNOS = [
    { id: 'EST-0020', nombre: 'Carlos Blanco', seccion: '1er Año A', promedio: 18.4, asistencia: 96, estado: 'Aprobado' },
    { id: 'EST-0018', nombre: 'Milagros Blanco', seccion: '1er Año A', promedio: 15.1, asistencia: 91, estado: 'Aprobado' },
    { id: 'EST-0011', nombre: 'Pedro Flores', seccion: '1er Año B', promedio: 9.6, asistencia: 74, estado: 'Reprobado' },
    { id: 'EST-0007', nombre: 'Yusmary Flores', seccion: '1er Año B', promedio: 11.2, asistencia: 82, estado: 'En riesgo' },
    { id: 'EST-0015', nombre: 'Cristóbal González', seccion: '2do Año A', promedio: 16.8, asistencia: 99, estado: 'Aprobado' },
];

const HORAS = [
    { hora: '1ra', rango: '07:00 – 07:45', materia: 'Castellano', tema: 'Tema S.4', ahora: true },
    { hora: '2da', rango: '07:45 – 08:30', materia: 'Física', tema: 'Semana 4: Trabajo y energía', ahora: false },
    { hora: '3ra', rango: '08:30 – 09:15', materia: 'Matemática', tema: 'Ecuaciones de primer grado', ahora: false },
    { hora: '4ta', rango: '09:35 – 10:20', materia: 'Biología', tema: 'La célula animal', ahora: false },
    { hora: '5ta', rango: '10:20 – 11:05', materia: 'Historia', tema: 'Independencia de Venezuela', ahora: false },
];

const COLORES: Array<{ nombre: string; tono: Tono; significa: string; clase: string }> = [
    { nombre: 'Índigo', tono: 'indigo', significa: 'Lo que se puede pulsar. Lo del liceo.', clase: 'bg-indigo' },
    { nombre: 'Menta', tono: 'menta', significa: 'Va bien: aprobado, presente, al día.', clase: 'bg-menta' },
    { nombre: 'Ámbar', tono: 'ambar', significa: 'Ojo: en riesgo, pendiente, a medias.', clase: 'bg-ambar' },
    { nombre: 'Coral', tono: 'coral', significa: 'Va mal: reprobado, ausente, vencido.', clase: 'bg-coral' },
    { nombre: 'Cian', tono: 'cian', significa: 'Información y gráficas, sin juicio.', clase: 'bg-cian' },
];

export default function Muestrario() {
    const [oscuro, setOscuro] = React.useState(false);
    const [verOculto, setVerOculto] = React.useState(false);
    const [estrecho, setEstrecho] = React.useState(false);

    React.useEffect(() => {
        document.documentElement.classList.toggle('dark', oscuro);
    }, [oscuro]);

    return (
      <ProveedorDeGlobos>
        <div className="min-h-dvh bg-lienzo">
            {/* ── La barra de arriba ─────────────────────────────────────── */}
            <header className="sticky top-0 z-30 border-b border-linea bg-lienzo/85 backdrop-blur-xl">
                <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
                    <div className="min-w-0">
                        <p className="truncate text-titulo font-bold tracking-tight text-tinta">
                            El idioma de Gestiedu
                        </p>
                        <p className="text-etiqueta text-tinta-tenue">
                            Soft UI · bento · cinco colores
                        </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        <Button
                            variant="contorno"
                            size="icon-sm"
                            onClick={() => setEstrecho((v) => !v)}
                            title={estrecho ? 'Ver ancho' : 'Ver como teléfono'}
                        >
                            {estrecho ? <Monitor /> : <Smartphone />}
                        </Button>
                        <Button
                            variant="contorno"
                            size="icon-sm"
                            onClick={() => setOscuro((v) => !v)}
                            title={oscuro ? 'Modo claro' : 'Modo oscuro'}
                        >
                            {oscuro ? <Sun /> : <Moon />}
                        </Button>
                    </div>
                </div>
            </header>

            <main
                className={cn(
                    '@container mx-auto flex flex-col gap-8 px-4 py-7 transition-all duration-300 ease-suave sm:px-6',
                    estrecho ? 'max-w-[390px]' : 'max-w-6xl'
                )}
            >
                {/* ══ 1. LOS CINCO COLORES ════════════════════════════════ */}
                <Seccion
                    titulo="Cinco colores. Ni uno más."
                    explica="Cada uno significa una cosa y siempre la misma. El gris no cuenta: es el papel."
                >
                    <div className="grid grid-cols-1 gap-2.5 @lg:grid-cols-2 @4xl:grid-cols-5">
                        {COLORES.map((c) => (
                            <Tarjeta key={c.nombre} className="flex flex-col gap-3 p-4">
                                <div className={cn('h-14 w-full rounded-sm shadow-dentro', c.clase)} />
                                <div>
                                    <p className="text-cuerpo font-bold text-tinta">{c.nombre}</p>
                                    <p className="mt-1 text-etiqueta leading-snug text-tinta-suave">
                                        {c.significa}
                                    </p>
                                </div>
                            </Tarjeta>
                        ))}
                    </div>
                </Seccion>

                {/* ══ 2. EL PANEL, EN BENTO ═══════════════════════════════ */}
                <Seccion
                    titulo="El panel es una caja de bento"
                    explica="El tamaño dice qué importa antes de leer nada. Dos por fila ya en el teléfono: seis datos de un vistazo, no tres y desplazar."
                >
                    <Bento>
                        <Cifra
                            rotulo="Total estudiantes"
                            valor="599"
                            pie="Ciclo 2026–2027"
                            icono={<Users className="h-[15px] w-[15px]" />}
                            tono="tinta"
                            tamano="ancha"
                        />
                        <Cifra
                            rotulo="Asistencia"
                            valor="93%"
                            pie="Últimos 30 días"
                            icono={<CalendarCheck className="h-[15px] w-[15px]" />}
                            tono="menta"
                        />
                        <Cifra
                            rotulo="En riesgo"
                            valor="257"
                            pie="Bajo 10 puntos"
                            icono={<TriangleAlert className="h-[15px] w-[15px]" />}
                            tono="ambar"
                        />
                        <Cifra
                            rotulo="Promedio general"
                            valor="14,2"
                            pie="Sobre 20"
                            icono={<GraduationCap className="h-[15px] w-[15px]" />}
                            tono="cian"
                        />
                        <Cifra rotulo="Secciones" valor="20" pie="Todas con horario" />
                        <Cifra rotulo="Profesores" valor="21" pie="Asignados" />
                        <Cifra rotulo="Observaciones" valor="57" pie="Este lapso" tono="coral" />
                    </Bento>

                    <Mosaico className="mt-2.5">
                        <Baldosa icono={<MorphIcon icon={DatoAsistencia} size={20} />} tono="indigo">
                            Pasar asistencia
                        </Baldosa>
                        <Baldosa icono={<MorphIcon icon={DatoNotas} size={20} />}>Poner notas</Baldosa>
                        <Baldosa icono={<MorphIcon icon={DatoHorario} size={20} />}>Ver horario</Baldosa>
                        <Baldosa icono={<MorphIcon icon={DatoObservacion} size={20} />}>
                            Observación
                        </Baldosa>
                    </Mosaico>
                </Seccion>

                {/* ══ 3. EL CARRIL ════════════════════════════════════════ */}
                <Seccion
                    titulo="Horario en vivo: se arrastra"
                    explica="Con el dedo, con el ratón, con la rueda o con las flechas del teclado. Cada hora engancha al llegar, y arrastrar nunca abre la tarjeta por error."
                >
                    <Carril etiqueta="Horas de clase de hoy">
                        {HORAS.map((h) => (
                            <Tarjeta
                                key={h.hora}
                                pulsable
                                tono={h.ahora ? 'indigo' : 'papel'}
                                className="w-[240px] p-4"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-etiqueta font-bold uppercase tracking-wide">
                                        {h.hora} hora
                                    </span>
                                    {h.ahora && (
                                        <Pastilla tono="menta" punto>
                                            En curso
                                        </Pastilla>
                                    )}
                                </div>
                                <p className="mt-3 text-titulo font-bold">{h.materia}</p>
                                <p className="mt-0.5 flex items-center gap-1.5 text-etiqueta">
                                    <Clock className="h-3.5 w-3.5" />
                                    {h.rango}
                                </p>
                                <p className="mt-3 line-clamp-2 rounded-sm bg-black/5 px-2.5 py-2 text-etiqueta dark:bg-white/10">
                                    {h.tema}
                                </p>
                            </Tarjeta>
                        ))}
                    </Carril>
                </Seccion>

                {/* ══ 4. LA TABLA ═════════════════════════════════════════ */}
                <Seccion
                    titulo="La tabla que en el teléfono no esconde nada"
                    explica="Pulsa el botón del teléfono ahí arriba: cada fila se convierte en una tarjeta y cada columna en una línea con su nombre. No se corta ni una."
                >
                    <TablaAdaptable
                        datos={ALUMNOS}
                        clave={(a) => a.id}
                        alPulsar={() => undefined}
                        columnas={[
                            {
                                id: 'alumno',
                                titulo: 'Alumno',
                                principal: true,
                                celda: (a) => (
                                    <div className="flex items-center gap-3">
                                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-pastilla bg-indigo-claro text-etiqueta font-bold text-indigo-hondo">
                                            {a.nombre
                                                .split(' ')
                                                .map((p) => p[0])
                                                .join('')}
                                        </span>
                                        <span className="font-semibold">{a.nombre}</span>
                                    </div>
                                ),
                            },
                            { id: 'cedula', titulo: 'Cédula', celda: (a) => <span className="tabular-nums text-tinta-suave">{a.id}</span> },
                            { id: 'seccion', titulo: 'Sección', celda: (a) => a.seccion },
                            {
                                id: 'promedio',
                                titulo: 'Promedio',
                                alinear: 'derecha',
                                celda: (a) => (
                                    <span className="font-bold tabular-nums">
                                        {a.promedio.toLocaleString('es-VE', { minimumFractionDigits: 1 })}
                                    </span>
                                ),
                            },
                            {
                                id: 'asistencia',
                                titulo: 'Asistencia',
                                alinear: 'derecha',
                                celda: (a) => <span className="tabular-nums">{a.asistencia}%</span>,
                            },
                            {
                                id: 'estado',
                                titulo: 'Estado',
                                celda: (a) => (
                                    <Pastilla
                                        punto
                                        tono={
                                            a.estado === 'Aprobado'
                                                ? 'menta'
                                                : a.estado === 'En riesgo'
                                                  ? 'ambar'
                                                  : 'coral'
                                        }
                                    >
                                        {a.estado}
                                    </Pastilla>
                                ),
                            },
                            {
                                id: 'ir',
                                titulo: 'Acciones',
                                acciones: true,
                                alinear: 'derecha',
                                celda: () => (
                                    <Button variant="suave" size="sm">
                                        Ver ficha <ArrowRight />
                                    </Button>
                                ),
                            },
                        ]}
                    />
                </Seccion>

                {/* ══ 5. BOTONES Y PASTILLAS ══════════════════════════════ */}
                <Seccion
                    titulo="Botones y estados"
                    explica="Un botón con texto por pantalla: el principal. Lo demás, icono y globo. Un icono se reconoce más rápido de lo que se lee un verbo, y no se come la pantalla."
                >
                    <Tarjeta className="flex flex-col gap-4 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                            {/* UNA acción principal, con su texto. */}
                            <Button variant="solido">Guardar notas</Button>
                            {/* Lo demás: icono y globo al posar el ratón. */}
                            <BotonIcono icono={DatoEditar} etiqueta="Editar" tono="normal" />
                            <BotonIcono
                                icono={verOculto ? DatoNoVer : DatoVer}
                                etiqueta={verOculto ? 'Mostrar notas' : 'Ocultar notas'}
                                tono="normal"
                                onClick={() => setVerOculto((v) => !v)}
                            />
                            <BotonIcono icono={DatoBajar} etiqueta="Descargar" tono="normal" />
                            <BotonIcono icono={DatoImprimir} etiqueta="Imprimir" tono="normal" />
                            <BotonIcono icono={DatoBorrar} etiqueta="Eliminar" tono="peligro" />
                        </div>
                        <p className="text-micro text-tinta-tenue">
                            Pulsa el ojo: el icono <strong className="font-semibold text-tinta-suave">se
                            transforma</strong> en el otro con física de muelle. Dice que es el mismo
                            botón que cambió, no dos botones distintos.
                        </p>
                        <div className="h-px bg-linea" />
                        <div className="flex flex-wrap items-center gap-2.5">
                            <Pastilla tono="menta" punto>Aprobado</Pastilla>
                            <Pastilla tono="ambar" punto>En riesgo</Pastilla>
                            <Pastilla tono="coral" punto>Reprobado</Pastilla>
                            <Pastilla tono="cian" punto>Sin nota</Pastilla>
                            <Pastilla tono="indigo">1er Lapso</Pastilla>
                            <Pastilla tono="papel">Borrador</Pastilla>
                        </div>
                    </Tarjeta>
                </Seccion>

                <p className="pb-10 text-center text-etiqueta text-tinta-tenue">
                    Nada de lo que ves aquí usa un control del navegador sin vestir.
                </p>
            </main>
        </div>
      </ProveedorDeGlobos>
    );
}

function Seccion({
    titulo,
    explica,
    children,
}: {
    titulo: string;
    explica: string;
    children: React.ReactNode;
}) {
    return (
        <section className="flex flex-col gap-4">
            <div>
                <h2 className="text-seccion font-bold text-tinta">{titulo}</h2>
                <p className="mt-1 max-w-2xl text-cuerpo text-tinta-suave">{explica}</p>
            </div>
            {children}
        </section>
    );
}
