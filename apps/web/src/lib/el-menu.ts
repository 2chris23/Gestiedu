import {
    Home,
    Users,
    BookOpen,
    Library,
    Settings,
    Calendar,
    CalendarDays,
    CalendarRange,
    Wallet,
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

export function elMenuDe(rol: string | undefined, conPagos: boolean): DestinoDelMenu[] {
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
            name: 'Horarios',
            href: '/dashboard/horarios',
            icon: Calendar,
            roles: ['ADMIN', 'TEACHER'],
            pista: 'Por sección y por profesor',
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
                      name: 'Pagos',
                      href: '/dashboard/pagos',
                      icon: Wallet,
                      roles: ['ADMIN'],
                      pista: 'Cobros y solvencia',
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
        // El calendario del liceo lo usan TODOS —el alumno y el representante
        // también—, pero no estaba en el menú de nadie: solo se llegaba
        // escribiendo la dirección a mano.
        {
            name: 'Calendario',
            href: '/dashboard/calendario',
            icon: CalendarRange,
            roles: ['ADMIN', 'TEACHER', 'STUDENT', 'TUTOR'],
            pista: 'Qué pasa este mes',
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

/**
 * LOS DOS DE LA BARRA DE ABAJO
 *
 * Solo caben dos, uno a cada lado de Inicio. Se eligen a mano y no por orden
 * de lista: lo que se abre todos los días, no lo que salga primero. Lo demás
 * está en el panel de inicio, a un toque de la casita del centro.
 */
export const LOS_DE_LA_BARRA: Record<string, string[]> = {
    ADMIN: ['/dashboard/academico', '/dashboard/horarios'],
    TEACHER: ['/dashboard/academico', '/dashboard/horarios'],
    STUDENT: ['/dashboard/calendario'],
    TUTOR: ['/dashboard/calendario'],
};

/** Lo que se ofrece como acceso en el panel: todo el menú menos Inicio. */
export function losAccesosDe(rol: string | undefined, conPagos: boolean): DestinoDelMenu[] {
    return elMenuDe(rol, conPagos).filter((d) => d.href !== '/dashboard');
}
