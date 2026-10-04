/**
 * LOS RECORRIDOS GUIADOS: QUÉ SE ENSEÑA EN CADA PANTALLA (2026-10-04)
 *
 * Cristian, viendo la app rial: la pantalla se oscurece, se ilumina el botón
 * de verdad y un globo explica qué hace, con «Atrás» y «Siguiente». Aquí van
 * los pasos; quien los pinta es `components/common/Recorrido.tsx`.
 *
 * Cada paso apunta a un elemento con `data-recorrido="…"`. Si ese elemento no
 * está a la vista (el rol no lo tiene, la pestaña no está abierta, el liceo no
 * usa pagos…), el paso se salta: nunca se ilumina un hueco vacío. Un paso sin
 * `donde` sale en el centro (la bienvenida).
 *
 * `pantalla` y `acciones` los pone solo `EncabezadoDePantalla`: el título con
 * su línea de para qué sirve, y los botones de la derecha.
 */

export type Rol = 'ADMIN' | 'TEACHER' | 'STUDENT' | 'TUTOR';

export interface PasoDelRecorrido {
    /** El valor de `data-recorrido` del elemento a iluminar. Sin él, en el centro. */
    donde?: string;
    titulo: string;
    texto: string;
    /** Solo para estos roles (sin decir nada, para todos). */
    roles?: Rol[];
    /** De la app, no de la pantalla (menú, campana…): va al final, en su orden. */
    deLaApp?: boolean;
}

export interface Recorrido {
    /** Lo que se apunta como visto (una vez por pantalla). */
    id: string;
    nombre: string;
    pasos: PasoDelRecorrido[];
    /**
     * Los pasos van en el orden en que salen en la pantalla (de arriba abajo)
     * y no en el escrito: el Inicio cambia de forma según el rol («Ir a» va
     * arriba para el personal y al final para el alumno).
     */
    enOrdenDePantalla?: boolean;
}

const PERSONAL: Rol[] = ['ADMIN', 'TEACHER'];

/** Lo que tiene toda pantalla: el menú, la campana y este botón. */
const LO_DE_SIEMPRE: PasoDelRecorrido[] = ([
    {
        donde: 'menu',
        titulo: 'El menú',
        texto: 'Aquí están las partes del sistema que te tocan. En el teléfono va abajo, donde llega el pulgar, con Inicio en el centro.',
    },
    {
        donde: 'campana',
        titulo: 'Tus avisos',
        texto: 'Citaciones, notas nuevas, pagos y cambios del liceo. Si das el permiso, también te llegan al teléfono con la app cerrada.',
    },
    {
        donde: 'mi-cuenta',
        titulo: 'Tu cuenta',
        texto: 'Tu foto, tus datos y cerrar sesión.',
    },
    {
        donde: 'ayuda',
        titulo: '¿Dudas? Toca aquí',
        texto: 'En cada pantalla, este botón te enseña cómo funciona. Puedes verlo las veces que quieras.',
    },
] as PasoDelRecorrido[]).map((p) => ({ ...p, deLaApp: true }));

const RECORRIDOS: Array<{ ruta: RegExp } & Recorrido> = [
    {
        id: 'inicio',
        nombre: 'Inicio',
        enOrdenDePantalla: true,
        ruta: /^\/dashboard\/?$/,
        pasos: [
            {
                titulo: 'Bienvenido a Gestiedu',
                texto: 'Te enseño lo principal en un minuto. Usa «Siguiente» (o las flechas del teclado); «Saltar» lo cierra cuando quieras.',
            },
            {
                donde: 'inicio-cifras',
                titulo: 'Las cifras del liceo',
                texto: 'Estudiantes, asistencia de los últimos 30 días, alumnos en riesgo y profesores, de un vistazo. Se ponen al día solas.',
                roles: PERSONAL,
            },
            {
                donde: 'accesos',
                titulo: 'Todo a un toque',
                texto: 'Cada parte del liceo que usas, con lo que trae dentro. Es el mismo camino que el menú.',
            },
            {
                donde: 'calendario-del-liceo',
                titulo: 'Lo que viene',
                texto: 'Los eventos y actividades de los próximos días. Se crean en Eventos.',
                roles: ['ADMIN'],
            },
            {
                donde: 'cuadro-de-honor',
                titulo: 'El cuadro de honor',
                texto: 'Los mejores por puntaje: notas, asistencia y observaciones. Elige un lapso o el ciclo completo, y el liceo entero o un año. Se actualiza cada sábado; los pesos se cambian en Configuración → Académica.',
                roles: ['ADMIN'],
            },
            {
                donde: 'mi-dia',
                titulo: 'Tu día de clases',
                texto: 'Lo que toca hoy, hora a hora. Toca una clase para ver su plan, tus actividades y tus notas.',
                roles: ['STUDENT'],
            },
            {
                donde: 'mi-puntaje',
                titulo: 'Tu puntaje',
                texto: 'Sale de tus notas, tu asistencia y tus observaciones. Cada sábado se actualiza y te dice cuántos puestos subiste.',
                roles: ['STUDENT'],
            },
            {
                donde: 'citaciones-del-representante',
                titulo: 'Citaciones',
                texto: 'Si el liceo te cita, sale aquí con el día y la hora.',
                roles: ['TUTOR'],
            },
            {
                donde: 'mis-representados',
                titulo: 'Tus representados',
                texto: 'Toca a cada uno para ver sus notas, su asistencia, sus observaciones y su puntaje del cuadro de honor.',
                roles: ['TUTOR'],
            },
            {
                donde: 'pagos-del-representante',
                titulo: 'Las cuotas',
                texto: 'Cómo va cada uno con los pagos. Puedes reportar un pago con la captura: cuenta cuando el liceo lo confirma.',
                roles: ['TUTOR'],
            },
            ...LO_DE_SIEMPRE,
        ],
    },
    {
        id: 'clase-en-vivo',
        nombre: 'La clase en vivo',
        ruta: /^\/dashboard\/clase-en-vivo\//,
        pasos: [
            {
                donde: 'clase-tema',
                titulo: 'Qué toca hoy',
                texto: 'El tema y la evaluación del plan para esta semana. «Editar» cambia el tema; «Añadir bloque» agrega una parte más.',
            },
            {
                donde: 'clase-actividades',
                titulo: 'Actividades y notas',
                texto: '«Nueva Actividad» la crea en esta clase. «Dar nota» cambia la tabla de alumnos para calificar; con instrumento, se califica indicador por indicador.',
            },
            {
                donde: 'clase-asistencia',
                titulo: 'Pasa la asistencia',
                texto: 'Pregunta cómo: a mano (cuatro botones por alumno), con el QR en la mesa o escaneando el QR de cada alumno.',
            },
            {
                donde: 'clase-alumnos',
                titulo: 'Tus alumnos',
                texto: 'La lista de la sección, con su asistencia de hoy. Al pasar lista o dar nota, esta tabla cambia para hacerlo de un toque.',
            },
            {
                donde: 'clase-guardado',
                titulo: 'No hay botón de guardar',
                texto: 'Todo se guarda solo y aquí lo ves («Guardado 07:45»). Sin conexión queda pendiente con un relojito y sube cuando vuelve.',
            },
            {
                donde: 'clase-observacion',
                titulo: 'Observaciones',
                texto: 'Anota algo de la clase entera o de unos alumnos. La ven su representante y el profesor guía.',
            },
        ],
    },
    {
        id: 'finanzas',
        nombre: 'Finanzas',
        ruta: /^\/dashboard\/pagos\/?$/,
        pasos: [
            { donde: 'pantalla', titulo: 'Las finanzas del liceo', texto: 'Lo que tiene el liceo, lo que le deben, lo que paga y lo que gasta.' },
            { donde: 'acciones', titulo: 'El ciclo', texto: 'Elige otro ciclo para ver los anteriores. Un ciclo cerrado se ve, pero no se toca.' },
            {
                donde: 'finanzas-resumen',
                titulo: 'Empieza por el saldo',
                texto: 'En «Resumen», «Poner el saldo inicial»: lo que el liceo tiene hoy. Desde ahí los fondos se calculan solos: entra lo cobrado y lo agregado, sale lo pagado y lo gastado.',
            },
            {
                donde: 'finanzas-estudiantes',
                titulo: 'Cobra a los estudiantes',
                texto: 'El ciclo mes a mes y la lista. Toca a un estudiante, las cuotas que paga y «Registrar pago».',
            },
            {
                donde: 'finanzas-personal',
                titulo: 'Paga al personal',
                texto: 'Los profesores salen solos; agrega al resto. A cada uno, su sueldo, su día de pago y sus vacaciones. Al pagar sale su recibo.',
            },
            {
                donde: 'finanzas-gastos',
                titulo: 'Gastos y fondos',
                texto: 'Lo que se compra o se repara, con la foto de la factura, y lo que entra que no es cuota (una donación). Nada se borra: lo anotado mal se anula con un motivo.',
            },
        ],
    },
    {
        id: 'plan-de-evaluacion',
        nombre: 'El plan de evaluación',
        // Vive dentro de la sección y de la materia: lo abre su botón.
        ruta: /^\/dashboard\/academico\/[^/]+\/[^/]+\/[^/]+\/?$/,
        pasos: [
            {
                donde: 'plan-rejilla',
                titulo: 'Una fila por semana',
                texto: 'Cada fila es una semana del lapso. Las columnas las pone el profesor (tema, contenido, actividad…) y una celda puede abarcar varias semanas.',
            },
            {
                donde: 'plan-editar',
                titulo: 'Las evaluaciones y sus puntos',
                texto: 'En «Editar Plan» marcas qué semanas son de evaluación y cuánto valen, y armas su instrumento si quieres (lista de cotejo, escala, rúbrica). Desde ahí, «Importar Word» lo lee de un archivo.',
            },
            {
                donde: 'plan-copiar',
                titulo: 'Úsalo en otra sección',
                texto: 'Copia este plan a otra sección donde das la misma materia. Las notas ya puestas no se tocan.',
            },
            {
                donde: 'plan-imprimir',
                titulo: 'En papel',
                texto: 'Saca la hoja del plan con el membrete del liceo, lista para firmar.',
            },
            {
                titulo: 'Y en la clase',
                texto: 'Lo guardado sale en la clase en vivo de cada semana; las actividades de esa semana suman a su evaluación.',
            },
        ],
    },
    {
        id: 'usuarios',
        nombre: 'Usuarios',
        ruta: /^\/dashboard\/usuarios\/?$/,
        pasos: [
            { donde: 'usuarios-nuevo', titulo: 'Crear una cuenta', texto: 'Pide lo mínimo: nombre, apellido, correo, cédula, contraseña, rol y sexo. Lo demás se completa en su perfil.' },
            { donde: 'usuarios-importar', titulo: 'Importar un alumno', texto: 'Trae a un alumno que viene de otro liceo con Gestiedu, con sus notas, desde su archivo de traslado.' },
            { donde: 'usuarios-buscar', titulo: 'Buscar', texto: 'Por nombre, correo o cédula.' },
            { donde: 'usuarios-rol', titulo: 'Filtrar', texto: 'Por rol, o «Alumnos a los que les falta algo» para ver a quién le faltan datos o recaudos.' },
            { donde: 'usuarios-lista', titulo: 'La lista', texto: 'Toca a una persona para abrir su ficha: sus datos, sus notas, sus documentos y su inscripción.' },
            { donde: 'usuarios-archivados', titulo: 'Archivados', texto: 'Quien está en pausa o retirado: no entra al sistema ni sale en las listas, pero no se borra.' },
        ],
    },
    {
        id: 'academico',
        nombre: 'Académico',
        ruta: /^\/dashboard\/academico\/?$/,
        pasos: [
            { donde: 'pantalla', titulo: 'Los ciclos escolares', texto: 'Cada año escolar del liceo. Abre uno para ver sus secciones, sus notas y su fin de año.' },
            { donde: 'acciones', titulo: 'Un ciclo nuevo', texto: 'Se ofrece el calendario del MPPE con sus lapsos; cada liceo lo ajusta.', roles: ['ADMIN'] },
            { donde: 'academico-ciclos', titulo: 'Abre un ciclo', texto: 'Dentro: las secciones, cada materia con su plan de evaluación y sus notas, y el cierre del año paso a paso.' },
        ],
    },
    {
        id: 'horarios',
        nombre: 'Horarios',
        ruta: /^\/dashboard\/horarios\/?$/,
        pasos: [
            { donde: 'pantalla', titulo: 'Los horarios', texto: 'De todas las secciones y profesores del ciclo.' },
            { donde: 'horarios-vista', titulo: 'Por sección o por profesor', texto: 'Mira el horario de una sección o la carga de un profesor.' },
            { donde: 'horarios-filtros', titulo: 'El año y la búsqueda', texto: 'Elige el ciclo y busca una sección o un profesor.' },
            { donde: 'horarios-lista', titulo: 'Ábrelo para editar', texto: 'Toca uno para poner las clases en su rejilla. El turno (mañana o tarde) decide las horas.' },
        ],
    },
    {
        id: 'eventos',
        nombre: 'Eventos',
        ruta: /^\/dashboard\/eventos\/?$/,
        pasos: [
            { donde: 'pantalla', titulo: 'Los eventos del liceo', texto: 'Actos, reuniones y días sin clases. Las clases que caen en esa franja se suspenden solas.' },
            { donde: 'eventos-calendario', titulo: 'Elige un día', texto: 'Toca un día y luego una hora para crear un evento. Con doble clic en el día, un día sin clases para todo el liceo, unos años o unas secciones.' },
        ],
    },
    {
        id: 'observaciones',
        nombre: 'Observaciones',
        ruta: /^\/dashboard\/observaciones\/?$/,
        pasos: [
            { donde: 'pantalla', titulo: 'Las observaciones', texto: 'Las de tus secciones, en un solo sitio.' },
            { donde: 'acciones', titulo: 'Una nueva', texto: 'Escribe una observación de uno o varios alumnos. Su representante la ve.' },
            { donde: 'observaciones-lista', titulo: 'Citar al representante', texto: 'Desde una observación se cita al representante: le llega un aviso, sale la hoja impresa y se anota si vino.' },
        ],
    },
    {
        id: 'configuracion',
        nombre: 'Configuración',
        ruta: /^\/dashboard\/configuracion\/?$/,
        pasos: [
            { donde: 'pantalla', titulo: 'La configuración del liceo', texto: 'Lo que se ajusta una vez y vale para todo el liceo.' },
            { donde: 'config-general', titulo: 'Información General', texto: 'El nombre oficial, el código DEA y los datos del Ministerio que salen en cada documento.' },
            { donde: 'config-academic', titulo: 'Las reglas académicas', texto: 'La escala de notas, la mínima aprobatoria, los lapsos, el horario de mañana y tarde, el fin de año y los pesos del cuadro de honor.' },
            { donde: 'config-documents', titulo: 'Documentos', texto: 'Los textos de cada constancia (con marcadores como {{nombre}}), la firma y los recaudos de inscripción.' },
            { donde: 'config-payments', titulo: 'Pagos', texto: 'Enciende las finanzas: cuotas, monedas, vencimientos, becas y mora.' },
            { donde: 'config-qr', titulo: 'Asistencia por QR', texto: 'Si los alumnos escanean para pasar lista, y qué tan cerca del profesor tienen que estar.' },
        ],
    },
    {
        id: 'materias',
        nombre: 'Materias',
        ruta: /^\/dashboard\/materias\/?$/,
        pasos: [
            { donde: 'pantalla', titulo: 'Las materias', texto: 'El catálogo del liceo. Cada sección las toma de aquí.' },
            { donde: 'acciones', titulo: 'Una nueva', texto: 'Crea una materia con su código y su color, o un ciclo académico.', roles: ['ADMIN'] },
        ],
    },
    {
        id: 'mis-pagos',
        nombre: 'Mis pagos',
        ruta: /^\/dashboard\/mis-pagos\/?$/,
        pasos: [{ donde: 'pantalla', titulo: 'Lo que el liceo te paga', texto: 'Tu próximo pago, lo pagado en este ciclo y tus recibos. Solo lo tuyo.' }],
    },
    {
        id: 'mi-clase',
        nombre: 'Mi clase',
        ruta: /^\/dashboard\/mi-clase\//,
        pasos: [
            { donde: 'pantalla', titulo: 'Tu clase', texto: 'La materia, tu sección y tu profesor.' },
            { donde: 'mi-clase-qr', titulo: 'La asistencia por QR', texto: '«Escanear asistencia» lee el QR que pone el profesor; «Mi QR» es el tuyo, por si él te escanea.', roles: ['STUDENT'] },
            { donde: 'mi-clase-plan', titulo: 'El plan de evaluación', texto: 'Qué se evalúa cada semana y cuánto vale.' },
            { donde: 'mi-clase-actividades', titulo: 'Tus actividades', texto: 'Cada una con tu nota. Solo lo tuyo: nunca las notas de los compañeros.' },
            { donde: 'mi-clase-observaciones', titulo: 'Tus observaciones', texto: 'Lo que el profesor anotó de ti en esta materia.' },
        ],
    },
];

/** El de la pantalla en que se está; sin uno propio, el de siempre. */
export function recorridoDe(pathname: string | null | undefined): Recorrido {
    const ruta = (pathname ?? '').split('?')[0];
    const propio = RECORRIDOS.find((r) => r.ruta.test(ruta));
    if (propio) return { id: propio.id, nombre: propio.nombre, pasos: propio.pasos, enOrdenDePantalla: propio.enOrdenDePantalla };
    return {
        id: 'general',
        nombre: 'Esta pantalla',
        enOrdenDePantalla: true,
        pasos: [
            { donde: 'pantalla', titulo: 'Esta pantalla', texto: 'Arriba, su nombre y para qué sirve.' },
            { donde: 'acciones', titulo: 'Lo que se hace aquí', texto: 'Los botones de lo principal de esta pantalla.' },
            ...LO_DE_SIEMPRE,
        ],
    };
}

/** Uno por su nombre (el botón «¿Cómo funciona?» de dentro de una pantalla). */
export function recorridoPorId(id: string): Recorrido | null {
    const r = RECORRIDOS.find((x) => x.id === id);
    return r ? { id: r.id, nombre: r.nombre, pasos: r.pasos, enOrdenDePantalla: r.enOrdenDePantalla } : null;
}

/** Los pasos de este rol (los que quedan a la vista se eligen al abrir). */
export function pasosDelRol(r: Recorrido, rol: Rol | null | undefined): PasoDelRecorrido[] {
    return r.pasos.filter((p) => !p.roles || (rol ? p.roles.includes(rol) : false));
}

/** Las pantallas con recorrido propio (lo usa su prueba). */
export const PANTALLAS_CON_RECORRIDO = RECORRIDOS.map((r) => r.id);
