import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import path from 'path';

/**
 * NINGÚN SECRETO EN EL REPOSITORIO (SECRETOS-01/02, 2026-10-04)
 *
 * El repositorio es público y llevaba tres claves reales: la de PostgreSQL en
 * ocho guiones, la del superadmin YA PUESTA en la pantalla de entrar, y otra
 * vieja en un guion suelto. Ver SECURITY.md. Esto se pone en rojo si vuelve:
 *
 *   SECRETOS-01  una URL de base de datos con una contraseña que no es de
 *                ejemplo («password», «postgres», «cambia…», «***»…)
 *   SECRETOS-02  un campo de contraseña de la pantalla que abre ya relleno
 */

const RAIZ = path.resolve(__dirname, '..', '..', '..', '..');

const DE_EJEMPLO = /^(password|postgres|postgres_password|secret|changeme|change[-_]?me|cambia.*|tu[-_].*|your[-_].*|user|pass|test|test123|testpass|clave|\*+|xxx+|\.\.\.|<.*>|\$\{.*\}|%.*%|placeholder|example|ejemplo|gestion)$/i;

/**
 * Una clave de ejemplo lo dice («gestion_password», «LA_CLAVE_DE_LA_BASE»,
 * «secure_password», «e2e_pass»…). Las que se filtraron de verdad eran una
 * ristra al azar y una frase pegada con números: no decían nada de eso.
 */
function esDeEjemplo(clave: string): boolean {
    if (DE_EJEMPLO.test(clave) || clave.length < 10) return true;
    return /pass|clave|contrase|secret|secure|change|cambia|example|ejemplo|prod_|e2e|test|dummy|placeholder|xxx|^la_|^tu_|^your/i.test(clave);
}

function archivosDelRepositorio(): string[] {
    return execSync('git ls-files', { cwd: RAIZ, encoding: 'utf8', maxBuffer: 1e8 })
        .split('\n')
        .filter(Boolean)
        .filter((f) => !/\.(png|jpe?g|webp|gif|ico|apk|aab|zip|gz|pdf|docx?|xlsx?|woff2?|ttf|jar|keystore|lock)$/i.test(f))
        .filter((f) => !f.startsWith('.claude/'));
}

describe('Ningún secreto en el repositorio (SECRETOS)', () => {
    it('SECRETOS-01: ninguna URL de base de datos lleva una contraseña de verdad', () => {
        const URL_CON_CLAVE = /postgres(?:ql)?:\/\/([^:/\s'"`@]+):([^@\s'"`]+)@/g;
        const malas: string[] = [];
        for (const f of archivosDelRepositorio()) {
            let texto: string;
            try {
                texto = readFileSync(path.join(RAIZ, f), 'utf8');
            } catch {
                continue;
            }
            for (const m of texto.matchAll(URL_CON_CLAVE)) {
                const clave = decodeURIComponent(m[2]);
                if (!esDeEjemplo(clave)) malas.push(`${f} (usuario ${m[1]})`);
            }
        }
        expect(malas).toEqual([]);
    });

    it('SECRETOS-02: ninguna pantalla abre con una contraseña ya escrita', () => {
        const RELLENO = /\[\s*(password|contrasena|clave)\s*,\s*set\w+\s*\]\s*=\s*useState\(\s*['"`]([^'"`]+)['"`]\s*\)/gi;
        const malas: string[] = [];
        for (const f of archivosDelRepositorio().filter((x) => x.startsWith('apps/web/src/') && x.endsWith('.tsx'))) {
            const texto = readFileSync(path.join(RAIZ, f), 'utf8');
            for (const m of texto.matchAll(RELLENO)) malas.push(`${f}: ${m[1]}`);
        }
        expect(malas).toEqual([]);
    });
});
