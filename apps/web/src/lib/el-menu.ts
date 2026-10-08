import {
    Home,
    Users,
    BookOpen,
    Library,
    Settings,
    Calendar,
    CalendarDays,
    Wallet,
    FileText,
    ClipboardCheck,
    HeartHandshake,
    MessageSquareText,
    UtensilsCrossed,
    type LucideIcon,
} from 'lucide-react';

/**
 * EL MENÚ, EN UN SOLO SITIO
 *
 * Lo usan tres cosas: la barra lateral del ordenador, los dos botones de la
 * barra de abajo del teléfono y los accesos del panel de inicio. Escrito tres
 * veces se desincroniza a la primera, y el que se queda viejo no da ningún
 * error: simplemente deja de ofrecer una pantalla.
 *
 * NOTA DE SINCRONIZACIÓN (Fase B):
 * Esta lista está COPIADA en el servidor en `services/paquete-de-precarga.service.ts`
 * (`elMenuDelRol`). Ambos archivos deben mantenerse idénticos para que el paquete
 * preparado de antemano contenga exactamente las pantallas que el menú ofrece.
 *
 * Los roles tienen que coincidir con el enum `UserRole` del servidor
 * (ADMIN | TEACHER | STUDENT | TUTOR). Ponerlos en español rompe el filtro en
 * silencio.
 */

export interface DestinoDelMenu {
    name: string;
    href: string;
    icon: LucideIcon;
    roles: string[];
    /** Una línea de qué se hace ahí. Se lee en los accesos del panel. */
    pista?: string;
}

export function elMenuDe(rol: string | undefined, conPagos: boolean, conPae = false): DestinoDelMenu[] {
    const todos: DestinoDelMenu[] = [
        {
            name: 'Inicio',
            href: '/dashboard',
            icon: Home,
            roles: ['ADMIN', 'TEACHER', 'STUDENT', 'TUTOR'],
        },
        {
            name: 'Académico',
            href: '/dashboard/academico',
            icon: BookOpen,
            roles: ['ADMIN', 'TEACHER'],
            pista: 'Ciclos, secciones y alumnos',
        },
        {
            name: 'Materias',
            href: '/dashboard/materias',
            icon: Library,
            roles: ['ADMIN', 'TEACHER'],
            pista: 'Las materias del liceo',
        },
        {
            name: 'Pendientes',
            href: '/dashboard/materias-pendientes',
            icon: ClipboardCheck,
            roles: ['ADMIN', 'TEACHER'],
            pista: 'Materias pendientes, momento a momento',
        },
        {
            name: 'Observaciones',
            href: '/dashboard/observaciones',
            icon: MessageSquareText,
            roles: ['ADMIN', 'TEACHER'],
            pista: 'Observaciones y citaciones a representantes',
        },
        {
            name: 'Labor social',
            href: '/dashboard/labor-social',
            icon: HeartHandshake,
            roles: ['ADMIN', 'TEACHER'],
            pista: 'Las horas comunitarias de cada alumno',
        },
        {
            name: 'Horarios',
            href: '/dashboard/horarios',
            icon: Calendar,
            roles: ['ADMIN', 'TEACHER'],
            pista: 'Por sección y por profesor',
        },
        {
            name: 'Mi sección guía',
            href: '/dashboard/mi-seccion-guia',
            icon: Users,
            roles: ['TEACHER'],
            pista: 'Cuadro general y notas de tus alumnos',
        },
        {
            name: 'Eventos',
            href: '/dashboard/eventos',
            icon: CalendarDays,
            roles: ['ADMIN'],
            pista: 'Actos, feriados y suspensiones',
        },
        // Solo aparece si el liceo activó el control de pagos (Configuración → Pagos).
        ...(conPagos
            ? [
                  {
                      // «Finanzas» desde 2026-10-01: además de las cuotas, el personal,
                      // los gastos y los fondos del liceo. La dirección es la de siempre.
                      name: 'Finanzas',
                      href: '/dashboard/pagos',
                      icon: Wallet,
                      roles: ['ADMIN'],
                      pista: 'Cuotas, personal, gastos y fondos',
                  },
              ]
            : []),
        // El profesor: lo que el liceo le paga, solo lo suyo (2026-10-01).
        ...(conPagos
            ? [
                  {
                      name: 'Mis pagos',
                      href: '/dashboard/mis-pagos',
                      icon: Wallet,
                      roles: ['TEACHER'],
                      pista: 'Lo que el liceo te paga y tus recibos',
                  },
              ]
            : []),
        // Solo si el liceo activó el comedor (Configuración → Comedor (PAE)).
        ...(conPae
            ? [
                  {
                      name: 'Comedor',
                      href: '/dashboard/comedor',
                      icon: UtensilsCrossed,
                      roles: ['ADMIN'],
                      pista: 'Raciones del PAE, día a día',
                  },
              ]
            : []),
        {
            name: 'Usuarios',
            href: '/dashboard/usuarios',
            icon: Users,
            roles: ['ADMIN'],
            pista: 'Alumnos, profesores y representantes',
        },
        // La boleta del alumno: notas por lapso, definitiva e inasistencias.
        // El representante la abre desde cada representado, en el inicio.
        {
            name: 'Mi boleta',
            href: '/dashboard/boleta/mia',
            icon: FileText,
            roles: ['STUDENT'],
            pista: 'Notas por lapso e inasistencias',
        },
        {
            name: 'Configuración',
            href: '/dashboard/configuracion',
            icon: Settings,
            roles: ['ADMIN'],
            pista: 'Reglas, lapsos y pagos',
        },
    ];
    return todos.filter((d) => !rol || d.roles.includes(rol));
}

/** En la barra, en vez de una pantalla: abre «Mi cuenta» (la ficha de la foto). */
export const MI_CUENTA = '@mi-cuenta';

/**
 * LOS DE LA BARRA DE ABAJO
 *
 * Se eligen a mano y no por orden de lista: lo que se abre todos los días, no
 * lo que salga primero. Lo demás está en el panel de inicio, a un toque de la
 * casita del centro.
 *
 *  · El personal lleva cuatro, dos a cada lado de Inicio.
 *  · «Mi cuenta» (cambiar la contraseña, la huella, cerrar sesión) va en la
 *    barra del profesor, del alumno y del representante: si no, solo se
 *    encuentra tocando la foto.
 *  · El administrador ve Pagos solo si el liceo los usa; si no, Eventos.
 *  · El calendario (la agenda del plan de evaluación) se quitó: el dueño no
 *    lo quiere. El horario en vivo ya dice qué toca cada día.
 */
export function losDeLaBarra(rol: string | undefined, conPagos: boolean): string[] {
    switch (rol) {
        case 'ADMIN':
            return [
                '/dashboard/academico',
                '/dashboard/usuarios',
                '/dashboard/horarios',
                conPagos ? '/dashboard/pagos' : '/dashboard/eventos',
            ];
        case 'TEACHER':
            return ['/dashboard/academico', '/dashboard/materias', '/dashboard/horarios', MI_CUENTA];
        case 'STUDENT':
            return ['/dashboard/boleta/mia', MI_CUENTA];
        case 'TUTOR':
            return [MI_CUENTA];
        default:
            return [];
    }
}

/** Lo que se ofrece como acceso en el panel: todo el menú menos Inicio. */
export function losAccesosDe(rol: string | undefined, conPagos: boolean): DestinoDelMenu[] {
    return elMenuDe(rol, conPagos).filter((d) => d.href !== '/dashboard');
}
