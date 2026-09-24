import * as fs from 'fs';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const resolveConfig = require('tailwindcss/resolveConfig');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const config = require('../../tailwind.config.js');

/**
 * NINGUNA CLASE DE COLOR QUE NO EXISTA
 *
 * Tailwind no avisa cuando una clase no existe: simplemente no pinta nada. Al
 * cambiar la paleta, `bg-primary-600` dejó de existir y el botón "+ Nuevo Ciclo"
 * quedó con letra blanca sobre el fondo gris — invisible — sin un solo error.
 *
 * Esta prueba lee todo el código de la web, saca cada clase de color con tono
 * (`bg-primary-600`, `text-indigo-500`, `ring-coral-hondo`…) y comprueba que la
 * configuración la define.
 */

const PREFIJOS = 'bg|text|border|border-[trblxy]|ring|ring-offset|from|via|to|fill|stroke|outline|divide|placeholder|decoration|accent|caret|shadow';
const CLASE = new RegExp(`(?<![\\w-])(?:[a-z-]+:)*(${PREFIJOS})-([a-z]+)-(\\d{2,3}|claro|suave|hondo|encima|alta|hundido|fuerte|tenue)(?:\\/\\d+)?(?![\\w-])`, 'g');

function archivos(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const ruta = path.join(dir, e.name);
        if (e.isDirectory()) return e.name === 'node_modules' ? [] : archivos(ruta);
        return /\.(tsx|ts)$/.test(e.name) && !/\.test\.ts$/.test(e.name) ? [ruta] : [];
    });
}

describe('Clases de color', () => {
    it('COLOR-01: toda clase de color con tono usada en la web está definida', () => {
        const colores = resolveConfig(config).theme.colors as Record<string, any>;
        const faltan = new Map<string, string>();
        let vistas = 0;

        for (const archivo of archivos(path.join(__dirname, '..'))) {
            const texto = fs.readFileSync(archivo, 'utf8');
            for (const m of texto.matchAll(CLASE)) {
                const [, , familia, tono] = m;
                // Palabras que no son colores (text-xs-100 no existe, pero
                // tampoco es un color: solo se miran familias de color).
                if (!(familia in colores) && !/^(primary|secondary|indigo|menta|ambar|coral|cian|tinta|linea|lienzo|tarjeta)$/.test(familia)) continue;
                vistas++;
                const def = colores[familia];
                if (!def || typeof def !== 'object' || !(tono in def)) {
                    faltan.set(`${familia}-${tono}`, path.relative(process.cwd(), archivo));
                }
            }
        }

        expect(vistas).toBeGreaterThan(500);
        expect([...faltan].map(([c, a]) => `${c}  (${a})`)).toEqual([]);
    });
});
