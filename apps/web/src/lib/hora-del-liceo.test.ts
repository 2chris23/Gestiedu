import * as fs from 'fs';
import * as path from 'path';

/**
 * NADA DE `new Date()` A PELO PARA EL DÍA DEL LICEO (HORA-01, 2026-10-04)
 *
 * El día y la hora los pone el servidor con la zona del liceo
 * (`useSchoolToday`, `useRelojDelLiceo`). `new Date()` es el reloj del
 * TELÉFONO: un alumno que cambia la hora, una VPN o simplemente las 20:00 en
 * Caracas (ya es mañana en UTC) cambiaban el «hoy». Ya mordió cinco veces
 * (VIVO, DOC-01, EVENTO-UI-01…).
 *
 * Aquí se lee el código de la web y cada `new Date()` sin argumentos tiene
 * que estar en esta lista, con su motivo. Uno nuevo pone la prueba en rojo:
 * o se usa la hora del liceo, o se añade aquí diciendo por qué no hace falta.
 */
const PERMITIDOS: Record<string, string> = {
    'app/(dashboard)/dashboard/clase-en-vivo/[classroomId]/[subjectId]/page.tsx': '«Guardado 07:45»: la hora a la que este teléfono guardó',
    'components/live-class/CalificarConInstrumento.tsx': '«Guardado a las…»: la hora a la que este teléfono guardó',
    'components/academic/AcademicYearModal.tsx': 'el año que se propone para un ciclo nuevo (se puede cambiar)',
    'components/common/CambiosSinEnviar.tsx': '«hoy/ayer» de lo hecho en ESTE teléfono, con su propio reloj',
    'components/fin-de-ano/PasoAnoSiguiente.tsx': 'respaldo si el nombre del ciclo no trae año',
    'components/landing/Secciones.tsx': 'el año del pie de la portada',
    'components/modals/CreateActivityModal.tsx': 'marca de creación; el día de la actividad lo pone la clase (`date`)',
    'hooks/useConexion.ts': '«hace un rato»: cuánto hace que contestó el servidor',
    'lib/por-enviar.ts': '`hechoEn`: cuándo se hizo en el teléfono, para el orden de subida',
    'utils/date.utils.ts': '`toLocalYMD(d = new Date())`: quien la llama sin fecha pide el día del aparato a propósito',
};

function archivos(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const ruta = path.join(dir, e.name);
        if (e.isDirectory()) return e.name === 'node_modules' ? [] : archivos(ruta);
        return /\.(tsx|ts)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [ruta] : [];
    });
}

describe('La hora del liceo (HORA-01)', () => {
    it('cada `new Date()` a pelo está en la lista, con su motivo', () => {
        const raiz = path.join(__dirname, '..');
        const fuera: string[] = [];
        for (const f of archivos(raiz)) {
            const rel = path.relative(raiz, f).split(path.sep).join('/');
            const lineas = fs.readFileSync(f, 'utf8').split(/\r?\n/);
            lineas.forEach((l, i) => {
                const codigo = l.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
                if (/new Date\(\)/.test(codigo) && !PERMITIDOS[rel]) fuera.push(`${rel}:${i + 1}`);
            });
        }
        expect(fuera).toEqual([]);
    });

    it('la lista no guarda motivos de archivos que ya no lo usan', () => {
        const raiz = path.join(__dirname, '..');
        const sobran = Object.keys(PERMITIDOS).filter((rel) => {
            const f = path.join(raiz, rel);
            return !fs.existsSync(f) || !/new Date\(\)/.test(fs.readFileSync(f, 'utf8'));
        });
        expect(sobran).toEqual([]);
    });
});
