/**
 * LAS PANTALLAS QUE SE PIDIERON SIN CONEXIÓN Y NO ESTABAN GUARDADAS
 *
 * El ayudante (`sw.js`, `volverADondeEstaba`) devuelve a la pantalla de la que
 * se venía con `?sin-guardar=<ruta>`. Aquí se le pone nombre para el aviso y
 * se apunta, para guardarla en cuanto vuelva la conexión (la descarga en
 * segundo plano las recoge con `lasPorGuardar`).
 */

const NOMBRES: Array<[string, string]> = [
    ['/dashboard/clase-en-vivo', 'La clase en vivo'],
    ['/dashboard/mi-clase', 'Mi clase'],
    ['/dashboard/academico', 'Académico'],
    ['/dashboard/horarios', 'Horarios'],
    ['/dashboard/horario', 'El horario'],
    ['/dashboard/boleta', 'La boleta'],
    ['/dashboard/usuarios', 'Usuarios'],
    ['/dashboard/configuracion', 'Configuración'],
    ['/dashboard/eventos', 'Eventos'],
    ['/dashboard/observaciones', 'Observaciones'],
    ['/dashboard/pagos', 'Finanzas'],
    ['/dashboard/materias', 'Materias'],
    ['/dashboard/plan-de-evaluacion', 'El plan de evaluación'],
    ['/dashboard', 'El inicio'],
];

export function nombreDeLaPantalla(ruta: string): string {
    for (const [base, nombre] of NOMBRES) {
        if (ruta === base || ruta.startsWith(`${base}/`)) return nombre;
    }
    return 'Esa pantalla';
}

const LLAVE = 'gestiedu:pantallas-por-guardar';

export function apuntarParaGuardar(ruta: string): void {
    try {
        const lista = new Set<string>(JSON.parse(localStorage.getItem(LLAVE) || '[]'));
        lista.add(ruta);
        localStorage.setItem(LLAVE, JSON.stringify([...lista].slice(-30)));
    } catch {
        // Sin almacenamiento: la descarga en segundo plano la traerá igual si es de las de siempre.
    }
}

/** Las apuntadas, y se vacía la lista (quien las pide las guarda). */
export function lasPorGuardar(): string[] {
    try {
        const lista = JSON.parse(localStorage.getItem(LLAVE) || '[]');
        localStorage.removeItem(LLAVE);
        return Array.isArray(lista) ? lista.filter((r) => typeof r === 'string' && r.startsWith('/dashboard')) : [];
    } catch {
        return [];
    }
}
